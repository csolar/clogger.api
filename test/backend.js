(function(){
  var config, amqp, _, Backend, Database;

  config = require('../config');
  amqp   = require('amqp');
  _      = require('underscore');

  //a simple in-memory database 
  Database = (function(){
    function Database(){
      this.db = {};
      this.nextId = 0;
    }

    Database.prototype = {
       /* CRUD functions */
      create: function(obj){
        //create unique id
        var id = '' + this.nextId++;
        //add record to database
        _.extend(obj, {id: id});
        this.db[id] = obj;
        return obj;
      },
      read: function(id){
        return this.db[id] || {};
      },
      update: function(id, update){
        this.db[id] = update;
        return update;
      },
      clear: function(){
        this.db = {};
        return this;
      },
      del: function(id){
        var obj = this.db[id];
        this.db = _.omit(this.db, id);
        return obj;
      },
      /*-----------------*/
      all: function(){
        return _.toArray(this.db);
      },
      since: function(timestamp){
        return _.filter(this.db, function(obj){
          return obj.timestamp >= timestamp;
        });
      }
    }
    return Database;
  })();

  Backend = (function(){
    function Backend(){}

    Backend.prototype = {
      connect: function(cb){
        var _this = this;
        this.database = new Database();
        this.connection = {};
        //connect to message queue
        this.connection.producer = new amqp.createConnection({url: config.amqp.url.producer});
        this.connection.consumer = new amqp.createConnection({url: config.amqp.url.consumer});
        this.connection.producer.on('ready', function(){
          //get the response exchange
          _this.connection.producer.exchange(config.amqp.resexchange, {type: 'direct', durable: true, autoDelete: false
          }, function(x){
            _this.resx = x;
          });
        });
        this.connection.consumer.on('ready', function(){
          //get the request exchange
          _this.connection.consumer.exchange(config.amqp.reqexchange, {type: 'direct', durable: true, autoDelete: false
          }, function(x){
            //establish the queue
            _this.connection.consumer.queue('', {exclusive: true}, function(q){
              _(['clog', 'clogs', 'reply', 'merge', 'unclog', 'create']).each(function(req){
                q.bind(x, 'api.' + req);
              });
              q.subscribe(function(payload, headers, info){
                var key = payload.key;
                var result = _this[info.type].call(_this, payload);
                //publish the result to the response exchange
                _this.resx.publish(key, result);
              });
              if(_.isFunction(cb)){
                cb.call(_this);
              }
            });
          });
        });
      },
      clog: function(params){
        return this.database.read(params.id);
      },
      unclog: function(params){
        return this.database.del(params.id);
      },
      clogs: function(params){
        if(params.since)
          return this.database.since(params.since);
        return this.database.all();
      },
      create: function(params){
        var clog = params.clog;
        return this.database.create(clog);
      },
      reply: function(params){
        return this.create(params);
      },
      merge: function(params){
        var id = params.id,
            update = params.update,
            target = this.database.read(id);
        if(target.children && update.children){
          _.extend(update, {children: _.union(target.children, update.children)});
        }
        _.extend(target, update);
        this.database.update(id, target);
        return target;
      },
      close: function(){
        this.connection.consumer.end();
        this.connection.producer.end();
      }
    }
    return Backend;
  })();

  module.exports = new Backend();
}).call(this);