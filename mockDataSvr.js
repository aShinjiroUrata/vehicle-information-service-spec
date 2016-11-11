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
var WebSocketServer = require('ws').Server;
var dataSrcSvr = new WebSocketServer({
  host : DataSrcIP,
  port : DataSrcPort
});

dataSrcSvr.on('connection', function(ws) {
  console.log('ws.on:connection');

  //Clientが接続してきたら、timerを回してデータ送出を開始する
  var timerId = setInterval(function() {
    console.log("setInterval is working");
    var msg = generateDataJson();
    //send out via websocket
    console.log("setInterval: msg=" + JSON.stringify(msg));
    ws.send(JSON.stringify(msg));
  }, 500);

  //原則としてdataSrcはデータを流すのみでclientからの入力は
  //無視する
  ws.on('message', function(message) {
    // do nothing
  });

  ws.on('close', function() {
    // closing operation
    console.log('ws.on:close');
    clearInterval(timerId);
  });
});

var speed = 60;
var rpm = 1500;
var steer = -60;

// TODO: ad hoc code. rewrite later
function generateDataJson() {
  var speed = getValueByPath("Signal.Drivetrain.Transmission.Speed");
  var rpm   = getValueByPath("Signal.Drivetrain.InternalCombustionEngine.RPM");
  var steer = getValueByPath("Signal.Chassis.SteeringWheel.Angle");
  var timestamp = new Date().getTime().toString(10);

  var obj = [
    { "path": "Signal.Drivetrain.Transmission.Speed",
      "value": speed,
      "timestamp":timestamp},
    { "path": "Signal.Drivetrain.InternalCombustionEngine.RPM",
      "value": rpm,
      "timestamp":timestamp},
    { "path": "Signal.Chassis.SteeringWheel.Angle",
      "value": steer,
      "timestamp":timestamp}
  ];
  return obj;
}

// TODO: ad hoc code. rewrite later
function getValueByPath(path) {

  // Vehicle Speed
  if (path === "Signal.Drivetrain.Transmission.Speed") {
    speed += 5;
    if (speed > 120) speed = 60;
    return speed
  // Engine RPM
  } else if (path === "Signal.Drivetrain.InternalCombustionEngine.RPM") {
    rpm += 10;
    if (rpm > 2000) rpm = 1500;
    return rpm;
  // SteeringWheel Angle
  } else if (path === "Signal.Chassis.SteeringWheel.Angle") {
    steer += 5;
    if (steer > 60) steer = -60;
    return steer;
  // others
  } else {
    ret = 0;
  }
  return ret;
}

