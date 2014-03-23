(function(){
  var amqp, config, emitter, util, _, MQ;

  amqp    = require('amqp');
  config  = require('../config');
  emitter = require('events').EventEmitter;
  util    = require('util');
  _       = require('underscore');

  MQ = (function(){
    function MQ(){
      emitter.call(this);
      this.timeouts = {};
      this.req = {
        event: 'request', 
        xname: config.amqp.reqexchange,
        xconfig: {
          type: 'direct',
          durable: true,
          autoDelete: false
        } 
      };
      this.res = {
        event: 'response', 
        xname: config.amqp.resexchange, 
        xconfig: {
          type: 'direct', 
          durable: true, 
          autoDelete: false
        },
        qname: config.amqp.resqueue,
        queues: {},
        qconfig: {
          durable:true, 
          exclusive: true,
          autoDelete: true
        }
      };
    }

    util.inherits(MQ, emitter);

    MQ.prototype.connect = function(){
      var _this = this;
      this.connection = {};
      //establish the "producer" connection
      this.connection.producer = new amqp.createConnection({url: config.amqp.url.producer});
      this.connection.producer.on('ready', function(){
        _this.connection.producer.exchange(_this.req.xname, _this.req.xconfig, function(x){
          _this.req.exchange = x;
          _this.emit(_this.req.xname + '.ready');
        });
      });
      //establish the "consumer" connection
      this.connection.consumer = new amqp.createConnection({url: config.amqp.url.consumer});
      this.connection.consumer.on('ready', function(){
        _this.connection.consumer.exchange(_this.res.xname, _this.res.xconfig, function(x){
          _this.res.exchange = x;
          _this.emit(_this.res.xname + '.ready');
        });
      });        
      //let MQ be a proxy for other amqp connection events
      _(['close', 'error', 'end', 'timeout']).each(function(event){
        _this.connection.producer.on(event, _this.emit.bind(_this, event));
        _this.connection.consumer.on(event, _this.emit.bind(_this, event));
      });
      return this;
    };

    MQ.prototype.publish = function(routing, payload, options){
      var _this = this;
      if(options.mode && options.mode == 'pass_through'){
        this.req.exchange.publish(routing, payload, options);
      }
      else{
        this.once(routing, function(key){
          _.extend(payload, {'key': key});
          _this.req.exchange.publish(routing, payload, options);
        });
      }        
    };

    MQ.prototype.subscribe = function(qname, key){
      var _this = this;

      this.connection.consumer.queue(qname, this.res.qconfig, function(q){
        q.bind(_this.res.xname, key);
        
        //don't wait forever for an answer
        _this.timeouts[key] = setTimeout(function(){
          _this.emit('error', {'error': 'timeout on ' + qname, 'key': key, 'status': 500});
        }, config.amqp.timeout);

        q.subscribe(function(payload, headers, info){
          _this.emit(info.routingKey, payload, headers, info);
          clearTimeout(_this.timeouts[info.routingKey]);
          delete _this.timeouts[info.routingKey];
        });
        _this.emit('api.' + qname, key);
      });
    }

    MQ.prototype.end = function(){
      var _this = this;
      _([this.connection.producer, this.connection.consumer]).each(function(connection){
        //from: https://github.com/rabbitmq/rabbitmq-tutorials/blob/master/javascript-nodejs/amqp-hacks.js
        connection.queue('tmp-' + Math.random(), {exclusive: true}, function(){
          connection.end();
          // `connection.end` in 0.1.3 raises a ECONNRESET error, silence it:
          connection.once('error', function(e){
            if (e.code !== 'ECONNRESET' || e.syscall !== 'write')
              throw e;
          });
        });
      });
    };

    return MQ;        
  })();

  module.exports = MQ;
}).call(this);