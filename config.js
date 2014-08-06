(function(){
  exports.amqp = {
    url: {
      'produce': process.env.RABBITMQ_BIGWIG_TX_URL || 'amqp://guest:guest@localhost:5672',
      'consume': process.env.RABBITMQ_BIGWIG_RX_URL || 'amqp://guest:guest@localhost:5672',
    },
    testurl: 'amqp://guest:guest@localhost:5672',
    reqexchange: 'clogger.api.x.req',
    resexchange: 'clogger.api.x.res',
    reqqueue: 'clogger.api.q.req',
    resqueue: 'clogger.api.q.res',
    timeout: 10000
  };
  exports.api = {
    version: 'v0.0.1',
    url: 'http://api.clogger.com',
    test_server_prot: process.CLOGGER_API_TEST_SERVER_PROT || 'http',
    test_server_port: process.env.CLOGGER_API_TEST_SERVER_PORT || 8080,
    test_server_host: process.env.CLOGGER_API_TEST_SERVER_HOST || 'localhost',
    debug: true
  }
}).call(this);