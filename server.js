var restify = require('restify'),
    api = require('./api'),
    config = require('./config'),
    server = restify.createServer();

console.log = config.api.debug ? console.log : function(){}

/* Routes start here 
--------------------- */
var version = new RegExp('^/version$'),
    stream  = new RegExp('^/clogs/stream$'),
    clog    = new RegExp('^/clogs/([a-zA-Z0-9_-]+)$'),
    clogs   = new RegExp('^/clogs(?:\\?since=(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z))?$'),
    reply   = new RegExp('^/clogs/([a-zA-Z0-9_-]+)/reply');


server.use(restify.queryParser());
server.use(restify.bodyParser());
server.get(version, api.version.bind(api));
server.post(stream, api.stream.bind(api));
server.get(clog, api.clog.bind(api));
server.get(clogs, api.clogs.bind(api));
server.post(clogs, api.create.bind(api));
server.post(reply, api.reply.bind(api));
server.del(clog, api.unclog.bind(api));

/* Routes end here 
--------------------- */

server.listen(8080, function(){
  console.log('%s listening at %s', server.name, server.url);
});