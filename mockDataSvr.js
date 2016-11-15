// mockDataSvr.js
// * This is data source WebSocket Server
// * to be used as replacemnt of actual vehicle.
// * Function is just to send data to Vehicle Signal Server.

"use strict"

// == Set Server IP and Port Number here ==
var DataSrcIP = '127.0.0.1';
var DataSrcPort = 3002;

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
httpSvr.listen(DataSrcPort, function() {
  console.log((new Date()) + ' httpSvr is listening on port 8080');
});

var dataSrcSvr = new WebSocketServer({
  httpServer: httpSvr,
  autoAcceptConnections: false
});

dataSrcSvr.on('request', function(request) {
  console.log('ws.on:request');

  var conn = request.accept();

  //Clientが接続してきたら、timerを回してデータ送出を開始する
  var timerId = setInterval(function() {
    //console.log("setInterval is working");
    var msg = createDataJson();
    //send out via websocket
    //console.log("setInterval: msg=" + JSON.stringify(msg));
    conn.sendUTF(JSON.stringify(msg));
  }, 500);


  //原則としてdataSrcはデータを流すのみでclientからの入力は
  //無視する
  conn.on('message', function(msg) {
    if (msg.type === 'utf8') {
      //console.log('  :ws.on:message = '+ msg.utf8Data);
      // action==setなら、対応する値を保存する
      var reqObj = JSON.parse(msg.utf8Data);
      if (reqObj.action === 'set') {
        //console.log('  :reqObj.path = '+ reqObj.path);
        //console.log('  :reqObj.value = '+ reqObj.value);
        var result = saveSetData(reqObj.path, reqObj.value);
        //console.log("  :result ="+result);
        var retObj = createSetResponse(result, reqObj.path, reqObj.value);
        //パケット返信
        conn.sendUTF(JSON.stringify(retObj));
      }
    }
  });

  conn.on('close', function() {
    // closing operation
    console.log('ws.on:close');
    clearInterval(timerId);
  });
});

function saveSetData(path, value) {
  //値チェックをシステマチックにしたい
  //エラーコードを本番向けにすること
  // - spec上のエラーコードとここで使うエラーコードは別の方がよい？
　// - とりあえず同じでやってみる
  // - err reason の方が一意に定まるのでerr reason を文字列で使ってみる
  //多数のデータ項目に対応する仕組みに変更が必要
  if (path === "Signal.Cabin.Door.Row1.Right.IsLocked") {
    if (value != "true" && value != "false")
      return 'bad_request'; //value の値が範囲外
    g_dataObj.isLocked_row1_right = value;
  } else if (path === "Signal.Cabin.HVAC.Row1.RightTemperature") {
    if (isFinite(value) == false)
      return 'bad_request';
    g_dataObj.hvacTemp_row1_right = +value;
  } else {
    return 'invalid_path'; //pathが不正
  }
  return 'ok'; //success
}

function createSetResponse(result, path, value) {
  //console.log("createSetResponse: ");
  var dataObj;
  var timestamp = new Date().getTime().toString(10);

  if (result == 'ok') {
    dataObj = {'action':'set', 'path':path, 'value':value, 'timestamp':timestamp};
  } else {
    var err = getErrorObj(result);
    dataObj = {'action':'set', 'path':path, 'error':err, 'timestamp':timestamp};
  }
  //console.log("  :dataObj="+JSON.stringify(dataObj));
  var obj = {"set": dataObj};
  return obj;
}

function getErrorObj(errValue) {
  var ret;
  if (errValue == 'bad_request') {
    ret = {'number':400, 'reason':errValue, 'message':'The server is unable to fulfil..'};
  } else if (errValue == 'invalid_path') {
    ret = {'number':404, 'reason':errValue, 'message':'The specified data path does not exist.'};
  } else {
    //unknown
    //this is not in the spec.
    ret = {'number':-1, 'reason':'unknown_error', 'message':'Error by unknown reason.'};
  }
  return ret;
}

var g_dataObj = {
  speed: 60,
  rpm: 1500,
  steer: -60,

  //Signal.Cabin.Door.Row1.Right.IsLocked
  // true, false
  isLocked_row1_right: false,

  //Signal.Cabin.HVAC.Row1.RightTemperature
  // -50 to 50
  hvacTemp_row1_right: 20,

};

function createDataJson() {
  updateData();

  var timestamp = new Date().getTime().toString(10);

  var dataObj = [
    { "path": "Signal.Drivetrain.Transmission.Speed",
      "value": g_dataObj.speed,
      "timestamp":timestamp},
    { "path": "Signal.Drivetrain.InternalCombustionEngine.RPM",
      "value": g_dataObj.rpm,
      "timestamp":timestamp},
    { "path": "Signal.Chassis.SteeringWheel.Angle",
      "value": g_dataObj.steer,
      "timestamp":timestamp},

    { "path": "Signal.Cabin.Door.Row1.Right.IsLocked",
      "value": g_dataObj.isLocked_row1_right,
      "timestamp":timestamp},

    { "path": "Signal.Cabin.HVAC.Row1.RightTemperature",
      "value": g_dataObj.hvacTemp_row1_right,
      "timestamp":timestamp},

  ];

  var obj = { "data": dataObj };
  return obj;
}

function updateData() {

  // Vehicle Speed
  g_dataObj.speed += 5;
  // Engine RPM
  g_dataObj.rpm += 10;
  // SteeringWheel Angle
  g_dataObj.steer += 5;

}

