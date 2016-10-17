// to use:
// * npm install ws
// * node wssvr.js
// * open with browser: http://10.5.162.79:8070

"use strict"

// == Set Server IP and Port Number here ==
var WSSvrIP = '10.5.162.79';
var HttpSvrPort = 8070;
var WSSvrPort = 8071;

// == Publish client.html ==
var fs = require('fs');
var httpsvr = require('http').createServer(function(req, res) {
  res.writeHead(200, {"Content-Type":"text/html"});
  var output = fs.readFileSync("./client.html", "utf-8");
  res.end(output);
}).listen(HttpSvrPort);

// == Start WebSocketServer ==
var WebSocketServer = require('ws').Server;
var wssvr = new WebSocketServer({
  host : WSSvrIP,
  port : WSSvrPort
});

var msg = null;
var subId = null;

var reqIdHash = {};
var subIdHash = {};

wssvr.on('connection', function(ws) {
  console.log('ws connected');
  ws.on('message', function(message) {
    msg = JSON.parse(message);
    console.log("ws.on-message: msg= " + message);

    // for 'get'
    if (msg.action === "get") {
      var val = getValueByPath(msg.path);
      var timestamp = new Date().getTime().toString(10);
      ws.send(JSON.stringify({"action": msg.action, "path": msg.path, "value": val, "timestamp":timestamp}));

    // for 'subscribe'
    } else if (msg.action === "subscribe") {
      var reqId = msg.requestId;
      var path = msg.path;
      var action = msg.action;
      //var filter = msg.filter;

      var subId = getUniqueSubId();

      // return 'subscribeSuccessResponse'
      ws.send(JSON.stringify({"action": action, "requestId": reqId, "subscriptionId": subId}));

      // start interval timer for 'subscriptionNotification'
      var timerId =  setInterval(function(reqId, subId, action, path) {
                  var val = getValueByPath(path);
                  var obj = createSubscribeNotificationJsonObj(reqId, subId, action, path, val);
                  console.log("subscribe:send : " + JSON.stringify(obj));
                  ws.send(JSON.stringify(obj));
                }, 500, reqId, subId, msg.action, msg.path);

      var ret = addSubscribeInfoToIdTable(reqId, subId, path, timerId);
      if (ret == false) {
        console.log("Failed to add subscribe info to IdTable. Cancel the timer.");
        clearInterval(timerId);
      }
      console.log("subscribe started. reqId=" + reqId + ", subId=" + subId + ", path=" + path + ", timer_Id=" + timerId);
      //dispObject(sub_id);

    } else if (msg.action === "unsubscribe") {
      var subId = msg.subscriptionId;
      var reqId = getReqIdBySubId(subId);
      var timerId = getTimerIdByReqId(reqId);
      console.log("unsubscribe id=" + subId);

      clearInterval(timerId);
      deleteSubscribeInfoFromIdTable(subId);
      //dispObject(sub_id);

    } else if (msg.action === "set") {
      //TODO
    } else if (msg.action === "authorize") {
      //TODO
    } else if (msg.action === "getVSS") {
      //TODO
    } else {
      //Do nothing
    }

  });

  ws.on('close', function() {
    console.log('ws closed');
    clearAllSubscribe();
  });
});

var speed = 60;
var rpm = 1500;
var steer = -60;
function getValueByPath(path) {
  // * この部分をよりintelligentな仕組みにしていくことが必要
  // * VSSのメタデータを受け取って新しいVSSツリーに対応する機能も仕様にある

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

// == subscribe helper funcs ==
function addSubscribeInfoToIdTable(reqId, subId, path, timerId) {
  if (reqIdHash[reqId] != undefined) {
    console.log("Error: requestId already used. reqId="+reqId);
    return false;
  }
  if (subIdHash[subId] != undefined) {
    console.log("Error: this subscriptionId already used. subId="+subId);
    return false;
  }
  reqIdHash[reqId] = {'subId':subId, 'timerId':timerId, 'path':path};
  subIdHash[subId] = reqId; // for cross reference

  console.log("addSubscribeInfoToIdTable: EntryNum=" + Object.keys(reqIdHash).length);
  dispReqIdHash();

  return true;
}

function getReqIdBySubId(subId) {
  var id = subIdHash[subId];
  if (id == undefined) return null;
  return id;
}
function getSubIdByReqId(reqId) {
  var obj = reqIdHash[reqId];
  if (obj == undefined) return null;
  return obj.subId;
}

function getTimerIdByReqId(reqId) {
  var obj = reqIdHash[reqId];
  if (obj == undefined) return null;
  return obj.timerId;
}

function deleteSubscribeInfoFromIdTable(subId) {
  var reqId = subIdHash[subId];
  delete reqIdHash[reqId];
  delete subIdHash[subId];
  console.log("deleteSubscribeInfoFromIdTable : EntryNum=" + Object.keys(reqIdHash).length);
}

function dispReqIdHash() {
  console.log("dispReqIdHash");

  for (var rid in reqIdHash) {
    var obj = reqIdHash[rid];
    console.log("reqId=" + rid + " , subId="+obj.subId+", path="+obj.path+", timerId="+obj.timerId);
  }
}

function clearAllSubscribe() {
  console.log("clearAllSubscribe");

  for (var rid in reqIdHash) {
    //var rid = keys[k];
    var obj = reqIdHash[rid];
    console.log("reqId=" + rid + " , subId="+obj.subId+", path="+obj.path+", timerId="+obj.timerId);
    var timerId = obj.timerId;
    clearInterval(timerId);
  }
  for (var rid in reqIdHash) {
    delete reqIdHash[rid];
  }
  for (var sid in subIdHash) {
    delete subIdHash[sid];
  }
}

function createSubscribeNotificationJsonObj(reqId, subId, action, path, val) {
  // Adding timestamp at here is simple solution for prototype.
  // Real timestamp should be given from data source as the data's actual happening time.
  var timestamp = new Date().getTime().toString(10);
  //console.log("timestamp="+timestamp);
  return {'action':action, 'requestId': reqId, 'subscriptionId':subId, 'path':path, 'timestamp':timestamp, 'value':val};
}

// == Utility funcs ==
function dispObject(obj) {
  console.log("obj props:");
  for(var n in obj){
    console.log("==> " + n + " : " + obj[n] );
  }
}

function getUniqueSubId() {
  // create semi-uniquID (for implementation easyness) as timestamp(milli sec)+random string
  // uniqueness is not 100% guaranteed.
  var strength = 1000;
  var uniq = new Date().getTime().toString(16) + Math.floor(strength*Math.random()).toString(16);
  return "subid-"+uniq;
}

