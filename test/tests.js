var expect  = require('chai').expect,
    _       = require('underscore'),
    config  = require('../config'),
    restify = require('restify'),
    backend = require('./backend'),
    client  = restify.createJsonClient({url: config.api.test_server_prot + '://' + config.api.test_server_host + ':' + config.api.test_server_port});

describe('clogger API', function(){
  var response,
      request,
      error,
      object,
      checkLinkHeader = function(link){
        var expected = link;
        return function(res){
          expect(res.headers.link).to.exist;
          expect(res.headers.link).to.equal(expected);
        };
      },
      record = {
        timestamp: "2014-04-14T02:15:15Z",
        source: "spiderman",
        context: "warning",
        content: "my spider sense is tingling!"
      };

  before(function(done){
    //start the api
    var server = require('../server');
    setTimeout(function(){
      backend.connect(function(){
        done();
      });
    }, 1000);
  });
  after(function(){
    backend.close();
  });

  describe('GET /version', function(){
    before(function(done){
      client.get('/version', function(err, req, res, obj){
        try{
          error = err;
          response = res;
          object = obj;
          done();
        }
        catch(e){
          done(e);
        }
      })      
    });
    it('should return a Link header', function(){
      var checker = checkLinkHeader('<' + config.api.url + '/version>;rel="self"');
      checker(response);      
    });
    it('should return the API version', function(){
      var expected = {
        "_links": {
            "self": {"href": "/version"}
        },
        "version": config.api.version
      };
      expect(error).to.be.null;
      expect(object).to.deep.equal(expected);
    });
  });
  
  describe('GET /clogs/{id}', function(){
    var clog;
    before(function(done){
      clog = backend.database.create(record);
      client.get('/clogs/' + clog.id, function(err, req, res, obj){
        try{
          error = err;
          response = res;
          object = obj;
          done();
        }
        catch(e){
          done(e);
        }
      })
    });
    after(function(){
      backend.database.del(clog.id);
    });
    it('should return a correct Link header', function(){
      var checker = checkLinkHeader('<' + config.api.url + '/clogs/' + clog.id + '>;rel="self",<' + config.api.url + '/' + clog.id + '/reply>;rel="reply"');
      checker(response);
    });
    it('should return a valid clog', function(){
      var expected = _.extend({
        _links: {
          self: {href: "/clogs/" + clog.id},
          reply: {href: "/clogs/" + clog.id + "/reply"}
        }      
      }, clog);

      expect(error).to.be.null;
      expect(object).to.deep.equal(expected);
    });
  });

  describe('DELETE /clogs/{id}', function(){
    var clog;
    before(function(done){
      clog = backend.database.create(record);
      client.del('/clogs/' + clog.id, function(err, req, res, obj){
        try{
          response = res;
          error = err;
          done();
        }
        catch(e){
          done(e);
        }
      });
    });
    it('should return code 204 for a successful delete', function(){
      expect(error).to.be.null;
      expect(response.statusCode).to.equal(204);
    });
    it('should have deleted the clog with the specified id', function(done){
      client.get('/clogs/' + clog.id, function(err, req, res, obj){
        try{
          expect(res.statusCode).to.equal(200);
          expect(obj.clog).to.be.empty;
          done();
        }
        catch(e){
          done(e);
        }
      });
    });
  });

  describe('GET /clogs{?since}', function(){
    var clogs = [];
    before(function(){
      _([record, {timestamp: "2014-04-14T01:15:15Z",
                  source: "hulk",
                  context: "notification",
                  content: "hulk smash!"}, 
                 {timestamp: "2014-03-14T00:15:15Z",
                  source: "ironman",
                  context: "reminder",
                  content: "change plutonium chest piece"}]).each(function(clog){
          clogs.push(backend.database.create(clog));
      });
    });

    after(function(){
      _(clogs).each(function(clog){
        backend.database.del(clog.id);
      });
    })
    it('should list all clogs when parameter "since" is not specified', function(done){
      client.get('/clogs', function(err, req, res, obj){
        try{
          expect(err).to.be.null;
          expect(obj._embedded.clogs).to.exist;
          expect(obj._embedded.clogs).to.have.length(3);
          expect(obj._embedded.clogs).to.deep.equal(clogs);
          expect(obj.total).to.equal(3);
          done();
        }
        catch(e){
          done(e);
        }
      });
    });
    it('should list all clogs starting from the date specified in the "since" parameter', function(done){
      client.get('/clogs?since=2014-04-10T00:00:00Z', function(err, req, res, obj){
        try{
          expect(err).to.be.null;
          expect(obj._embedded.clogs).to.have.length(2);
          var arr = _.filter(clogs, function(clog){
            return clog.source != 'ironman';
          });
          expect(obj._embedded.clogs).to.deep.equal(arr);
          expect(obj.total).to.equal(2);
          done();
        }
        catch(e){
          done(e);
        }
      })
    });
  });

  describe('POST /clogs', function(){
    var clog;

    after(function(){
      backend.database.del(clog.id);
    });

    it('should create a new clog', function(done){
      client.post('/clogs', record, function(err, req, res, obj){
        try{
          expect(err).to.be.null;
          expect(res.statusCode).to.equal(201);
          expect(obj.id).to.exist;
          clog = backend.database.read(obj.id);
          expect(clog).to.exist;
          expect(obj.timestamp).to.equal(clog.timestamp);
          expect(obj.source).to.equal(clog.source);
          expect(obj.context).to.equal(clog.context);
          expect(obj.content).to.equal(clog.content);
          done();
        }
        catch(e){
          done(e);
        }
      });
    });
  });

  describe('POST /clogs/{id}/reply', function(){
    var parent,
        child;
    before(function(done){
      parent = backend.database.create(record);
      client.post('/clogs/' + parent.id + '/reply', function(err, req, res, obj){
        try{
          expect(err).to.be.null;
          expect(res.statusCode).to.equal(201);
          child = obj;
          done();
        }
        catch(e){
          done(e);
        }
      });
    });

    after(function(){
      backend.database.clear();
    });
    it('should create a new clog with parent = id', function(){
      expect(child.parent).to.exist;
      expect(child.parent).to.equal(parent.id);
    });
    it('should have added a child element to the parent clog', function(done){
      client.get('/clogs/' + parent.id, function(err, req, res, obj){
        try{
          expect(err).to.be.null;
          expect(obj).to.exist;
          expect(obj.children).to.exist;
          expect(obj.children.length).to.equal(1);
          expect(obj.children[0]).to.equal(child.id);
          done();
        }
        catch(e){
          done(e);
        }
      });
    });
  });
});