(function(){
  var restify, _, config, uuid, MQ, mq, API;

  restify = require('restify');
  _       = require('underscore');
  uuid    = require('node-uuid');
  MQ      = require('./lib/mq');
  mq      = new MQ();
  config  = require('./config');

  API = (function(){
    function API(options){
      var _this = this;
      this.options = options || {};
      mq.connect();
      mq.on(mq.req.xname + '.ready', function(){
        console.log('request exchange ready!');
      });
      mq.on('error', function(error){
        if(error.key){
          mq.emit(error.key, error);
        }
      });
    }

    API.prototype = {
      version: function(req, res, next){
        var body = {
          _links: {
            self: {href: "/version"}
          },
          version: this.options.version,
        };
        var str = JSON.stringify(body);
        res.writeHead(200, {
          'Content-Length': str.length,
          'Content-Type': 'application/hal+json',
          'Link': '<' + config.api.url + '/version>;rel="self"'
        });
        res.write(str);
        res.end();
        return next();
      },

      clog: function(req, res, next){
        var id = req.params[0],
            body = {
              _links: {
                self: {href: "/clogs/" + id},
                reply: {href: "/clogs/" + id + "/reply"}
              }
            },
            key = uuid.v4();

        mq.publish('api.clog', {"id": id}, {"type": "clog"});
        mq.subscribe('clog', key);
        mq.once(key, function(msg, headers, info){
          _.extend(body, msg);
          var status =(msg.error && msg.status) ? msg.status : 200;
          var str = JSON.stringify(body);
          res.writeHead(status, {
            'Content-Length': str.length, 
            'Content-Type': 'application/hal+json',
            'Link': '<' + config.api.url + '/clogs/' + msg.id + '>;rel="self",<' + config.api.url + '/' + msg.id + '/reply>;rel="reply"'
          });
          res.write(str);
          res.end();
          return next();
        });
      },

      clogs: function(req, res, next){
        var since = req.query.since,
            body = {
              _links:{
                self: {href: "/clogs"}
              },
              _embedded: {
                clogs: []
              },
              total: 0
            },
            key = uuid.v4();

        mq.publish('api.clogs', {"since": since, "key": key}, {"type": "clogs"});
        mq.subscribe('clogs', key);
        mq.once(key, function(msg, headers, info){
          if(msg.error){
            _.extend(body, msg);
          }
          else{
            body._embedded.clogs = msg;
          }
          body.total = msg.length;   
          var status = (msg.error && msg.status) ? msg.status : 200;
          var str = JSON.stringify(body);
          res.writeHead(status, {
            'Content-Length': str.length, 
            'Content-Type': 'application/hal+json',
            'Link': '<' + config.api.url + '/clogs>;rel="reply"'
          });
          res.write(str);
          res.end();
          return next();
        });
      },

      create: function(req, res, next){
        var payload = req.body,
            body = {
              _links: {
                self: {href: ""},
                reply: {href: ""}
              },
            },
            key = uuid.v4();

        _.extend(payload, {"timestamp": new Date()});
        mq.publish('api.create', {"clog": payload, "key": key}, {"type": "create"});
        mq.subscribe('create', key);
        mq.once(key, function(msg, headers, info){
          var status = (msg.error && msg.status) ? msg.status : 201;
          body._links.self.href = "/clogs/" + msg.id;
          body._links.reply.href = "/clogs/" + msg.id + "/reply";
          _.extend(body, msg);
          var str = JSON.stringify(body);
          res.writeHead(status, {
            'Content-Length': str.length,
            'Content-Type': 'application/hal+json',
            'Link': '<' + config.api.url + '/clogs/' + msg.id + '>;rel="self",<' + config.api.url + '/clogs/' + msg.id + '/reply>;rel="reply"'
          });
          res.write(str);
          res.end();
          return next();
        });
      },

      reply: function(req, res, next){
        var _this = this,
            id = req.params[0],
            payload = req.body,
            body = {
              _links: {
                self: {href: ""},
                reply: {href: ""}
              }
            },
            key = uuid.v4();

        _.extend(payload, {"parent": id, "timestamp": new Date()});
        mq.publish('api.reply', {"clog": payload, "key": key}, {"type": "reply"});
        mq.subscribe('reply', key);
        mq.once(key, function(msg, headers, info){
          var status = (msg.error && msg.status) ? msg.status : 201;
          body._links.self.href = "/clogs/" + msg.id;
          body._links.reply.href = "/clogs/" + msg.id + "/reply";
          _.extend(body, msg);
          var str = JSON.stringify(body);
          res.writeHead(status, {
            'Content-Length': str.length,
            'Content-Type': 'application/hal+json',
            'Link': '<' + config.api.url + '/clogs/' + msg.id + '>;rel="self",<' + config.api.url + '/clogs/' + msg.id + '/reply>;rel="reply"'
          });
          if(!msg.error){
            mq.publish('api.merge', {"id": id, "update": {children: [msg.id]}, "key": key}, {"type": "merge", "mode": "pass_through"});
          }
          res.write(str);
          res.end();
          return next();
        });
      },

      unclog: function(req, res, next){
        var id = req.params[0];
        var key = uuid.v4();
        mq.publish('api.unclog', {"id": id, "key": key}, {"type": "unclog", "mode": "pass_through"});
        res.send(204);
      },

      stream: function(req, res, next){
        if(req.isKeepAlive())
        {
          var _this = this,
              id = req.params[0],
              payload = req.body,
              body = {
                _links: {
                  self: {href: "/clogs/stream"},
                }
              },
              key = uuid.v4();

          mq.publish('api.stream', {"filter": payload, "key": key}, {"type": "stream"});
          //use a dedicated queue
          mq.subscribe('', key);
          mq.on(key, function(msg, headers, info){
            _.extend(body, msg);
            var status = (msg.error && msg.status) ? msg.status : 200;
            var str = JSON.stringify(body);
            res.writeHead(status, {
              'Content-Length': str.length, 
              'Content-Type': 'application/hal+json',
              'Link': '<' + config.api.url + '/clogs/stream>;rel="self"'
            });
            res.write(str);
          });
          mq.once(key + '.exit', function(){
            mq.removeAllListeners(key);
            res.end();
            return next();
          });
        }
        else
        {
          res.end;
          return next();
        }
      }
    }

    return API;
  })();

  module.exports = new API({version: config.api.version});
}).call(this);