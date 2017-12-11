// simple websocket client

var extDataSrc = (function() {

  var m_svrUrl = "ws://127.0.0.1:3001";

  var obj = {
    svrUrl: m_svrUrl,

    connectHandler:  function(conn) {
      console.log('connectHandler: ');
      console.log('  :Connected to DataSrc');

      conn.on('error', function(err) {
        console.log("  :dataSrc on error ");
      });
      conn.on('close', function() {
        console.log("  :dataSrc on close ");
      });
      conn.on('message', function(msg) {
        if (msg.type === 'utf8') {
          console.log( msg.utf8Data.slice(0,300));
        }
      });
    }
  }
  return obj;
})();

var WsClient= require('websocket').client;
var wsCliObj = new WsClient();

console.log("extDataSrc.svrUrl= " + extDataSrc.svrUrl);
wsCliObj.on('connect', extDataSrc.connectHandler);
wsCliObj.connect(extDataSrc.svrUrl,'');

