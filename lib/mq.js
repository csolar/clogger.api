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
      this.connection = new amqp.createConnection({url: config.amqp.url});
      this.connection.on('ready', function(){
        _([_this.req, _this.res]).each(function(obj){
          _this.connection.exchange(obj.xname, obj.xconfig, function(x){
            obj.exchange = x;
            _this.emit(obj.xname + '.ready');
          });
        });
      });
        
      //let MQ be a proxy for other amqp connection events
      _(['close', 'error', 'end', 'timeout']).each(function(event){
        _this.connection.on(event, _this.emit.bind(_this, event));
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

      this.connection.queue(qname, this.res.qconfig, function(q){
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
      //from: https://github.com/rabbitmq/rabbitmq-tutorials/blob/master/javascript-nodejs/amqp-hacks.js
      this.connection.queue('tmp-' + Math.random(), {exclusive: true}, function(){
        _this.connection.end();
        // `connection.end` in 0.1.3 raises a ECONNRESET error, silence it:
        _this.connection.once('error', function(e){
          if (e.code !== 'ECONNRESET' || e.syscall !== 'write')
            throw e;
        });
      });
    };

    return MQ;        
  })();

  module.exports = MQ;
}).call(this);