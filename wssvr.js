// to use:
// * npm install ws
// * node wssvr.js
// * open with browser: http://10.5.162.79:8070

"use strict"

// == Set Server IP and Port Number here ==
var WSSvrIP = '10.5.162.79';
var HttpSvrPort = 8070;
var WSSvrPort = 8071;

// =========================
// == Publish client.html ==
// =========================
var fs = require('fs');
var httpsvr = require('http').createServer(function(req, res) {
  res.writeHead(200, {"Content-Type":"text/html"});
  var output = fs.readFileSync("./client.html", "utf-8");
  res.end(output);
}).listen(HttpSvrPort);

// ===========================
// == Start WebSocketServer ==
// ===========================
var WebSocketServer = require('ws').Server;
var wssvr = new WebSocketServer({
  host : WSSvrIP,
  port : WSSvrPort
});

//TODO: One WebSocket connection should have one IdTable. Currently only one global IdTable.

// =========================
// == define RequestTable ==
// =========================
// memo:
// 当面はsubscribeの情報のみ格納するが
// 先々は、get, setなども格納が必要になりそう
// DataBrokerからのデータを待つ仕組みにする想定のため
var g_reqTable = {
  requestHash: {},
  subIdHash: {},

  //TODO: 要テスト
  addReqToTable: function(reqObj, subId, timerId) {
    var reqId = reqObj.requestId;
    console.log("addReqToTable: reqId="+reqId);
    if (this.requestHash[reqId] != undefined) {
      console.log("  :Error: requestId already used. reqId="+reqId);
      return false;
    }
    this.requestHash[reqId] = reqObj;

    //subscribeの場合subIdHashにも登録する
    if (reqObj.action == "subscribe") {
      if (subId != undefined && this.subIdHash[subId] == undefined) {
        console.log("  :action="+reqObj.action+". adding subId="+subId);
        this.requestHash[reqId].subcriptionId = subId;
        this.subIdHash[subId] = reqId;
      } else {
        console.log("  :action="+reqObj.action+". not adding subId="+subId);
      }
      if (timerId != undefined) {
        console.log("  :action="+reqObj.action+". adding timerId="+subId);
        this.requestHash[reqId].timerId = timerId;
      }
    }

    console.log("  :EntryNum=" + Object.keys(this.requestHash).length);
    this.dispReqIdHash();

    return true;
  },
  delReqByReqId: function(reqId) {
    console.log("delReqByReqId: reqId = " + reqId);
    if (this.requestHash[reqId] == undefined) {
      console.log("  :delReqByReqId: entry is not found. reqId = " + reqId);
      return false;
    }
    var subId = this.requestHash[reqId].subscriptionId;
    delete this.requestHash[reqId];
    if (subId != undefined)
      delete this.subIdHash[subId];
    console.log("  :EntryNum=" + Object.keys(this.requestHash).length);
  },
  clearReqTable: function() {
    console.log("clearReqTable");

    for (var rid in this.requestHash) {
      var obj = this.requestHash[rid];
      console.log("  :reqId=" + obj.requestId + " , subId="+obj.subscriptionId+", path="
                  +obj.path+", timerId="+obj.timerId);
      var timerId = obj.timerId;
      clearInterval(timerId);
    }
    for (var rid in this.requestHash) {
      delete this.requestHash[rid];
    }
    for (var sid in this.subIdHash) {
      delete this.subIdHash[sid];
    }
  },
  getReqIdBySubId: function(subId) {
    var reqId = this.subIdHash[subId];
    if (reqId == undefined) return null;
    return reqId;
  },
  getSubIdByReqId: function(reqId) {
    var obj = this.requestHash[reqId];
    if (obj == undefined) return null;
    return obj.subscriptionId;
  },
  getTimerIdByReqId: function(reqId) {
    console.log("getTimerIdByReqId: reqId="+reqId);
    var obj = this.requestHash[reqId];
    if (obj == undefined) {
      console.log("  :getTimerIdByReqId: object not found.");
      return null;
    }
    console.log("  :timerId = " + obj.timerId);
    return obj.timerId;
  },
  dispReqIdHash: function() {
    console.log("dispReqIdHash:");
    for (var rid in this.requestHash) {
      var obj = this.requestHash[rid];
      console.log("  :reqid=" + obj.requestId + " , subid="+obj.subscriptionId
                  +", path="+obj.path+", timerid="+obj.timerid);
    }
  }
};

wssvr.on('connection', function(ws) {
  console.log('ws.on:connection');
  ws.on('message', function(message) {
    var obj = JSON.parse(message);
    console.log("ws.on:message: obj= " + message);
    console.log("  :action=" + obj.action);

    // for 'get'
    if (obj.action === "get") {
      var val = getValueByPath(obj.path);
      var timestamp = new Date().getTime().toString(10);
      var resObj = {"action": obj.action, "path": obj.path, "requestId": obj.requestId,
                    "value": val, "timestamp":timestamp};
      ws.send(JSON.stringify(resObj));

    // for 'subscribe'
    } else if (obj.action === "subscribe") {
      var reqId = obj.requestId;
      var path = obj.path;
      var action = obj.action;
      //var filter = obj.filter;

      var subId = getUniqueSubId();

      // return 'subscribeSuccessResponse'
      var resObj = {"action": action, "requestId": reqId, "subscriptionId": subId};
      ws.send(JSON.stringify(resObj));

      // start interval timer for 'subscriptionNotification'
      var timerId =  setInterval(function(reqId, subId, action, path) {
                  var val = getValueByPath(path);
                  var obj = createSubscribeNotificationJsonObj(reqId, subId, action, path, val);
                  console.log("  :subscribe:send : " + JSON.stringify(obj));
                  ws.send(JSON.stringify(obj));
                }, 500, reqId, subId, obj.action, obj.path);

      var ret = g_reqTable.addReqToTable(obj, subId, timerId);
      if (ret == false) {
        console.log("  :Failed to add subscribe info to IdTable. Cancel the timer.");
        clearInterval(timerId);
      }
      console.log("  :subscribe started. reqId=" + reqId + ", subId=" + subId + ", path="
                  + path + ", timer_Id=" + timerId);

    } else if (obj.action === "unsubscribe") {
      var reqId = obj.requestId; // unsub requestのreqId
      var targ_subId = obj.subscriptionId; // subscribe のsubId
      var targ_reqId = g_reqTable.getReqIdBySubId(targ_subId); // subscribeのreqId
      var timerId = g_reqTable.getTimerIdByReqId(targ_reqId);
      var timestamp = new Date().getTime().toString(10);
      clearInterval(timerId);
      g_reqTable.delReqByReqId(targ_reqId); // subscribeのentryを削除
      var resObj = {"action": obj.action, "requestId":reqId, "subscriptionId":targ_subId,
                    "timestamp":timestamp};
      ws.send(JSON.stringify(resObj));

    } else if (obj.action === "set") {
      //TODO
    } else if (obj.action === "authorize") {
      //TODO
    } else if (obj.action === "getVSS") {
      //TODO
    } else {
      //Do nothing
    }

  });

  ws.on('close', function() {
    console.log('ws.on:closed');
    g_reqTable.clearReqTable();
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

// ===================
// == Utility funcs ==
// ===================
function dispObject(obj) {
  console.log("dispObject:");
  console.log("  :obj props:");
  for(var n in obj){
    console.log("  :==> " + n + " : " + obj[n] );
  }
}
function getUniqueSubId() {
  // create semi-uniquID (for implementation easyness) as timestamp(milli sec)+random string
  // uniqueness is not 100% guaranteed.
  var strength = 1000;
  var uniq = new Date().getTime().toString(16) + Math.floor(strength*Math.random()).toString(16);
  return "subid-"+uniq;
}
function createSubscribeNotificationJsonObj(reqId, subId, action, path, val) {
  // Adding timestamp at here is simple solution for prototype.
  // Real timestamp should be given from data source as the data's actual happening time.
  var timestamp = new Date().getTime().toString(10);
  var retObj = {'subscriptionId':subId, 'path':path, 'value':val, 'timestamp':timestamp};

  return retObj;
}


