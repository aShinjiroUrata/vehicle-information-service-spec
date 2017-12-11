// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// manuDataSrc.js
// - IVIS向けテスト用のツール
// - HTMLのUIから値をセットしてVehicleDataを発生させられる
// - ループでデータを送りつづける仕組みは止める


"use strict"

// == Set Server IP and Port Number here ==
var svr_config = require('./svr_config');
var DATASRC_PORT = svr_config.DATASRC_PORT;
var TIMER_INTERVAL = 1000;

//座席数の定義(vssには、Row5, Pos5などあり、無制限にありうるので)
//TODO: 必要以上の座席は使用しないようにしたい
var ROW_NUM = 1;
var POS_NUM = 2

//add data path you want to update in updateDataObj() 
var g_updateList = [
  "Signal.Drivetrain.Transmission.Speed",
  "Signal.Drivetrain.InternalCombustionEngine.RPM",
  "Signal.Chassis.SteeringWheel.Angle",
  "Signal.Chassis.Brake.PedalPosition",
  "Signal.Chassis.Accelerator.PedalPosition"
  // you can add data path here.
];

var g_receiveList = [
  'Signal.Cabin.HVAC.Row1.Left.Temperature',
  'Signal.Cabin.HVAC.Row1.Right.Temperature'
];


var fs = require('fs');

//TODO: json ファイル名を引数で与える
var g_vss;
try {
  g_vss = JSON.parse(fs.readFileSync('./vss.json', 'utf8'));
} catch(e) {
  console.log("Irregular format of VSS json. Exit.");
  return;
}
//var g_dataObj = initDataObj(g_vss);

// ===========================
// == Start WebSocketServer ==
// ===========================
var WebSocketServer = require('websocket').server;
var http = require('http');

var httpSvr = http.createServer(function(request, response) {
  console.log((new Date()) + ' Received request for ' + request.url);
  response.writeHead(404);
  response.end();
});
httpSvr.listen(DATASRC_PORT, function() {
  console.log((new Date()) + ' httpSvr is listening on port '+DATASRC_PORT);
});

var dataSrcSvr = new WebSocketServer({
  httpServer: httpSvr,
  autoAcceptConnections: false
});

var connarr = [];

dataSrcSvr.on('request', function(request) {
 dbgPrint('ws.on:request');

  var conn = request.accept();

  conn.on('message', function(msg) {
    dbgPrint('ws.on:message = '+ msg);

    if (msg.type === 'utf8') {
      //console.log('  :manuDS: ws.on:message = '+ msg.utf8Data);
      var reqObj;
      try {
        reqObj = JSON.parse(msg.utf8Data);
      } catch(e) {
        dbgPrint("Irregular format request. ignore.");
        return;
      }

      if (reqObj.action === 'push') {
        dbgPrint('  :push: reqObj = '+ JSON.stringify(reqObj));
        // データをDBにセットする？
        var path = reqObj.path;
        var val = reqObj.value;
        // VISSにデータを送信させる
        var msg = generatePushJsonSingle(path, val);
        connarr.forEach(function(_conn) {
          _conn.sendUTF(JSON.stringify(msg));
        });
      }
    }
  });

  conn.on('close', function() {
    // closing operation
    console.log('ws.on:close');
  });

  connarr.push(conn);

});

function generatePushJsonSingle(_path, _val) {
  //console.log(`generatePushJsonSingle: ${_path} + ${_val}`);
  //var root = _dataObj;
  var resObj  = {};
  var date = new Date();
  var ts = date.getTime();
  var timestamp = new Date().getTime().toString(10);
  var dbg_depth = 0;

  resObj.path = _path;
  resObj.value = _val;
  resObj.timestamp = timestamp;
  var sRet = {"action":"simpledata", "data":resObj};
  // VISSに送付するデータ
  return sRet;
}

function dbgPrint(_msg) {
  console.log(`[manuDS]: ${_msg}`);
}
