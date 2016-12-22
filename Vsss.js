//
// Vehicle Signal Server prototype implementation
//
// to use:
// 1.Install packages
//   $npm install ws socket.io
// 2.Edit Vsss.js code
// - edit Vsss's IP address by change VSSS_IP value.(change port if you like)
// - select data source to connect
//   - LOCAL_MOCK_DATA : to use hard coded data source driven by timer
//   - EXT_MOCK_SERVER : to use external websocket mock server 'mockDataSvr.js'
//   - EXT_SIP_SERVER  : to use websocket server which hosts actual vehicle data
//                       developed for SIP hackathon.
// 3.Start Vehicle Signal Server
//   $node Vsss.js
// 4 Open test-ui app by browser via url= http://{VSSS_IP}:{HTTP_SVR_PORT}
// 5.If EXT_MOCK_SERVER data source is selected, start external mock data source
//   (*Edit IP, port in mockDataSvr.js to match with Vsss.js)
//   $node mockDataSrc.js
// 6.If EXT_SIP_SERVER data source is selected, start SIP hackathon server
// - Open SIP hackathon server app by google chrome (*URL is not public)
// - enter roomID='room01' and submit
// - select drive data and start to play the data

"use strict"

// == data source selection ==
var LOCAL_MOCK_DATA = 0;
var EXT_MOCK_SERVER = 1;
var EXT_SIP_SERVER = 2;
// Please select dataSrc from above options
//var dataSrc = LOCAL_MOCK_DATA;
var dataSrc = EXT_MOCK_SERVER;
//var dataSrc = EXT_SIP_SERVER;

// == Config this Vehicle Singal Server IP and Port Number here ==
var VSSS_IP = '10.5.162.79'; // VSSS's host IP
var HTTP_SVR_PORT = 8081;
var VSSS_PORT = 3000;

var EXT_MOCKSVR_IP = '127.0.0.1';
var EXT_MOCKSVR_PORT = 3001;

// =========================
// == Publish test-ui.html ==
// =========================
var fs = require('fs');
var httpsvr = require('http').createServer(function(req, res) {
  var output;
  console.log("httpsvr: req.url = "+req.url);
  switch (req.url) {
    case '/vss.json':
      output = fs.readFileSync("./vss.json", "utf-8");
      res.writeHead(200, {"Content-Type":"application/json"});
      break;
    default:
      output = fs.readFileSync("./test-ui.html", "utf-8");
      res.writeHead(200, {"Content-Type":"text/html"});
      break;
  }
  res.end(output);
}).listen(HTTP_SVR_PORT);

// ===========================
// == Start WebSocketServer ==
// ===========================
var WebSocketServer = require('ws').Server;
var wssvr = new WebSocketServer({
  host : VSSS_IP,
  port : VSSS_PORT
});

// =========================================
// == dataSrc connection: local mock data ==
// =========================================
// TODO: this is very adhoc. better to brush up.
// need dynamic configuration with vss meta data?
var g_localMockDataSrc = {

  speed: 60,
  rpm: 1500,
  steer: -60,

  generateMockData: function() {
    var thiz = this;
    setInterval(function() {
      var msg = thiz.getMockDataJson();
      dataReceiveHandler(msg);
    }, 1000);
  },

  getMockDataJson: function() {
    var speed = this.getMockValueByPath("Signal.Drivetrain.Transmission.Speed");
    var rpm   = this.getMockValueByPath("Signal.Drivetrain.InternalCombustionEngine.RPM");
    var steer = this.getMockValueByPath("Signal.Chassis.SteeringWheel.Angle");
    var timestamp = new Date().getTime().toString(10);

    var dataObj = [
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
    var obj = {"data": dataObj};
    var msg = JSON.stringify(obj);
    return msg;
  },

  getMockValueByPath: function(path) {
    // Vehicle Speed
    if (path === "Signal.Drivetrain.Transmission.Speed") {
      this.speed += 5;
      if (this.speed > 120) this.speed = 60;
      return this.speed
    // Engine RPM
    } else if (path === "Signal.Drivetrain.InternalCombustionEngine.RPM") {
      this.rpm += 10;
      if (this.rpm > 2000) this.rpm = 1500;
      return this.rpm;
    // SteeringWheel Angle
    } else if (path === "Signal.Chassis.SteeringWheel.Angle") {
      this.steer += 5;
      if (this.steer > 60) this.steer = -60;
      return this.steer;
    // others
    } else {
    }
    return 0;
  }
};

// Run dummy data source
if (dataSrc === LOCAL_MOCK_DATA) {
  g_localMockDataSrc.generateMockData();
}

// ===================================================
// == dataSrc connection: external mock data server ==
// ===================================================
// * Connect as client

var g_extMockDataSrc = (function() {

  var m_svrUrl = "ws://"+EXT_MOCKSVR_IP+":"+EXT_MOCKSVR_PORT;
  var m_conn = null;

  var obj = {
    svrUrl: m_svrUrl,

    connectHandler:  function(conn) {
      m_conn = conn;
      console.log('connectHandler: ');
      console.log('  :Connected to DataSrc');

      conn.on('error', function(err) {
        console.log("  :dataSrc on error ");
      });
      conn.on('close', function() {
        console.log("  :dataSrc on close ");
        m_conn = null;
      });
      conn.on('message', function(msg) {
        if (msg.type === 'utf8') {
          dataReceiveHandler(msg.utf8Data);
        }
      });
    },

    //send set request to mockDataSrc
    sendSetRequest: function(obj) {
      if (m_conn != null) {
        console.log("sendSetRequest: ");
        console.log("  :obj="+JSON.stringify(obj));
        m_conn.sendUTF(JSON.stringify(obj));
      }
    }
  }
  return obj;
})();

if (dataSrc === EXT_MOCK_SERVER) {
  var modWsClient= require('websocket').client;
  var wsClient = new modWsClient();
  wsClient.on('connect', g_extMockDataSrc.connectHandler);
  console.log("g_extMockDataSrc.svrUrl= " + g_extMockDataSrc.svrUrl);
  wsClient.connect(g_extMockDataSrc.svrUrl,'');
}

// ======================================================
// == dataSrc connection: SIP project Hackathon Server ==
// ======================================================
// #use socket.io by requirement of Hackathon server
var g_extSIPDataSrc = {
  roomID: 'room01',
  //svrUrl: "ws://xx.xx.xx.xx:xxxx",
  svrUrl: "ws://52.193.60.25:3000",

  // Convert data from SIP's format(hackathon format) to VSS format
  // TODO: re-write in better way
  // (first version is ad-hoc lazy implementation)
  convertFormatFromSIPToVSS: function(sipData) {
    //console.log("convertFormatFromSIPToVSS: sipData = " + sipData);
    //console.log("convertFormatFromSIPToVSS: ");
    var vssData;
    var sipObj;
    try {
      sipObj = JSON.parse(sipData);
    } catch(e) {
      //iregurlar Json case
      console.log("  :received irregular Json messaged. ignored.");
      console.log("  :Error = "+e);
      return;
    }
    var vehicleSpeed = this.getValueFromSIPObj(sipObj,"Vehicle.RunningStatus.VehicleSpeed.speed");
    var engineSpeed = this.getValueFromSIPObj(sipObj,"Vehicle.RunningStatus.EngineSpeed.speed");
    var steeringWheel = this.getValueFromSIPObj(sipObj,"Vehicle.RunningStatus.SteeringWheel.angle");

    // Create VSS format JSON
    // TODO: need brush up.
    var vssObj = new Array();
    if (vehicleSpeed != undefined) {
      console.log("  :vehicleSpeed.value=" + vehicleSpeed.value);
      console.log("  :vehicleSpeed.timestamp=" + vehicleSpeed.timestamp);
      var obj =
      { "path": "Signal.Drivetrain.Transmission.Speed",
        "value": vehicleSpeed.value,
        "timestamp":vehicleSpeed.timestamp};
      vssObj.push(obj);
    }
    if (engineSpeed != undefined) {
      //console.log("  :engineSpeed.value=" + engineSpeed.value);
      //console.log("  :engineSpeed.timestamp=" + engineSpeed.timestamp);
      var obj =
      { "path": "Signal.Drivetrain.InternalCombustionEngine.RPM",
        "value": engineSpeed.value,
        "timestamp":engineSpeed.timestamp};
      vssObj.push(obj);
    }
    if (steeringWheel != undefined) {
      //console.log("  :steeringWheel.value=" + steeringWheel.value);
      //console.log("  :steeringWheel.timestamp=" + steeringWheel.timestamp);
      var obj =
      { "path": "Signal.Chassis.SteeringWheel.Angle",
        "value": steeringWheel.value,
        "timestamp":steeringWheel.timestamp};
      vssObj.push(obj);
    }
    if (vssObj.length > 1) {
      var obj = {"data": vssObj};
      //var vssStr = JSON.stringify(vssObj);
      var vssStr = JSON.stringify(obj);
      return vssStr;
    } else {
      return undefined;
    }
  },

  // SIP形式のJSONからpath指定で欲しい値を取り出す
  // return value format: {value, timestamp}
  getValueFromSIPObj: function(origObj, path) {
    var pathElem = path.split(".");
    var len = pathElem.length;
    var obj = origObj;
    var retObj = undefined;
    for (var i=0; i<len; i++) {
      if(obj[pathElem[i]]==undefined) {
        return undefined;
      } else if (i<(len-1) && obj[pathElem[i]]!=undefined) {
        obj = obj[pathElem[i]];
      } else if (i==(len-1) && obj[pathElem[i]]!=undefined) {
        retObj = {};
        retObj.value = obj[pathElem[i]];
        retObj.timestamp = obj['timeStamp']; //SIP's timestamp is 'timeStamp'.
      }
    }
    return retObj;
  }
}

if (dataSrc === EXT_SIP_SERVER) {
  var modSioClient = require('socket.io-client');
  var sioClient = modSioClient.connect(g_extSIPDataSrc.svrUrl);

  if (sioClient != undefined) {
    sioClient.on("vehicle data", function(sipData) {
      //console.log("on.vehicle_data:");
      var vssData = g_extSIPDataSrc.convertFormatFromSIPToVSS(sipData);
      if (vssData != undefined) {
        //console.log("  :vssData= "+ vssData);
        dataReceiveHandler(vssData);
      }
    });
    sioClient.on('connect',function(){
        console.log("on.connect");
        var msg = {"roomID":g_extSIPDataSrc.roomID, "data":"NOT REQUIRED"};
        sioClient.emit('joinRoom', JSON.stringify(msg));
    });
  }
}

//TODO: One WebSocket connection should have one IdTable. Currently only one global IdTable.

// =========================
// == define RequestTable ==
// =========================
var g_reqTable = {
  requestHash: {},
  subIdHash: {},

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
        this.requestHash[reqId].subscriptionId = subId;
        this.subIdHash[subId] = reqId;
      } else {
        console.log("  :action="+reqObj.action+". not adding subId="+subId);
      }
      // timerIdは、setIntervalでイベントを発生させるデモ実装の場合。
      // dataSrcからデータ通知を受ける場合はタイマは使わない
      if (timerId != undefined) {
        console.log("  :action="+reqObj.action+". adding timerId="+subId);
        this.requestHash[reqId].timerId = timerId;
      }
    }

    console.log("  :EntryNum=" + Object.keys(this.requestHash).length);
    //this.dispReqIdHash();

    return true;
  },
  delReqByReqId: function(reqId) {
    //console.log("delReqByReqId: reqId = " + reqId);
    if (this.requestHash[reqId] == undefined) {
      //console.log("  :delReqByReqId: entry is not found. reqId = " + reqId);
      return false;
    }
    var subId = this.requestHash[reqId].subscriptionId;
    delete this.requestHash[reqId];
    if (subId != undefined)
      delete this.subIdHash[subId];
    console.log("  :EntryNum=" + Object.keys(this.requestHash).length);
    return true;
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

  // for debug
  dispReqIdHash: function() {
    console.log("dispReqIdHash:");
    for (var rid in this.requestHash) {
      var obj = this.requestHash[rid];
      console.log("  :reqid=" + obj.requestId + " , subid="+obj.subscriptionId
                  +", path="+obj.path+", timerid="+obj.timerid);
    }
  }
};

var g_ws = null;

wssvr.on('connection', function(ws) {
  //console.log('ws.on:connection');
  g_ws = ws;

  // for connecting to outside data source
  g_ws.on('message', function(message) {
    var obj;
    try {
      obj = JSON.parse(message);
    } catch (e) {
      console.log("  :received irregular Json messaged. ignored.");
      console.log("  :Error = "+e);
      return;
    }
    console.log("ws.on:message: obj= " + message);
    //console.log("  :action=" + obj.action);

    // for 'get'
    if (obj.action === "get") {
      var reqId = obj.requestId;
      var path = obj.path;
      var ret = g_reqTable.addReqToTable(obj, null, null);
      if (ret == false) {
        console.log("  :Failed to add 'get' info to requestTable.");
      }
      console.log("  :get request registered. reqId=" + reqId + ", path=" + path);

    } else if (obj.action === "set") {
      //console.log("  :action=" + obj.action);
      var reqId = obj.requestId;
      var path = obj.path;
      var value = obj.value;
      var ret = g_reqTable.addReqToTable(obj, null, null);

      // TODO:
      // 次に dataSrcにset要求を送る。
      // dataSrc==extMockDataSrcの場合は送るが、それ以外は送らない？
      // とりあえずはextMockDataSrcの場合だけ考える
      g_extMockDataSrc.sendSetRequest(obj);

    } else if (obj.action === "authorize") {
      // TODO:
      // パケットを分解
      // Authorize Success Response を返送する
      // Vsss内にAuthorize状態を持っておく？
      // Authorize状態はdataSrc側で持つべきものではない

    } else if (obj.action === "getVSS") {
      // TODO:
      // 機械的にVSSを送り返せばよい？
      // 形式はJSONで？
      // VSSは本来は車両が持っている情報
      // とすると、mockDataSrcに問い合わせて取得してもよい気がする
      // が、単純化のために、Vsss内で固定のJSONを返すことにする
      // VSSを受けてクライアント側は何に使うのが正しい？
      // 本来は、クライアントは車両からVSSを受け取り、利用可能なデータ項目を知るはず
      // とすると、clientの実装はVSS受信して、それにあった状態になるべき
      // が、それは先の課題としておく_

    // for 'subscribe'
    } else if (obj.action === "subscribe") {

      var resObj = null;
      var reqId = obj.requestId;
      var path = obj.path;
      var action = obj.action;
      var subId = getUniqueSubId();

      var ret = g_reqTable.addReqToTable(obj, subId, null);
      var timestamp = new Date().getTime().toString(10);
      if (ret == false) {
        console.log("  :Failed to add subscribe info to IdTable. Cancel the timer.");
        var error = -1; //TODO: select correct error code
        resObj = createSubscribeErrorResponseJson(action, reqId, path, error, timestamp);
      } else {
        console.log("  :subscribe started. reqId=" + reqId + ", subId=" + subId + ", path=" + path);
        resObj = createSubscribeSuccessResponseJson(action, reqId, subId, timestamp);
      }
      g_ws.send(JSON.stringify(resObj));

    } else if (obj.action === "unsubscribe") {
      var reqId = obj.requestId; // unsub requestのreqId
      var targ_subId = obj.subscriptionId; // subscribe のsubId
      var targ_reqId = g_reqTable.getReqIdBySubId(targ_subId); // subscribeのreqId
      var resObj;
      var ret = g_reqTable.delReqByReqId(targ_reqId); // subscribeのentryを削除
      var timestamp = new Date().getTime().toString(10);
      if (ret == true) {
        resObj = createUnsubscribeSuccessResponseJson(obj.action, reqId, targ_subId, timestamp);
      } else {
        var err = -1; //TODO: select correct error value
        resObj = createUnsubscribeErrorResponseJson(obj.action, reqId, targ_subId, err, timestamp);
      }
      g_ws.send(JSON.stringify(resObj));

    } else {
      //Do nothing
    }
  });

  g_ws.on('close', function() {
    console.log('ws.on:closed');
    g_reqTable.clearReqTable();
    g_ws = null;
  });
});

// dataSrcから受信したデータを処理する
function dataReceiveHandler(message) {
  //console.log("dataReceiveHandler: ");
  //console.log("  :message=" + message);
  var obj;
  try {
    obj = JSON.parse(message);
  } catch(e) {
    //irregurlar Json case
    console.log("  :received irregular Json messaged. ignored.");
    console.log("  :Error = "+e);
    return;
  }
  var dataObj = obj.data;
  var setObj = obj.set;

  var matchObj;
  var retObj, reqObj;

  if (setObj != undefined) {
    // handler for 'set' response
    console.log("  :set message=" + JSON.stringify(setObj));

    for (var i in g_reqTable.requestHash) {
      reqObj = g_reqTable.requestHash[i];
      if (reqObj.action != 'set') {
        console.log("  :skip data: action="+ reqObj.action);
        continue;
      }
      matchObj = null;
      retObj = null;
      //console.log("  :reqObj="+JSON.stringify(reqObj));

      if ((matchObj = matchPathforSet(reqObj, setObj)) != undefined) {
        if (setObj.error != undefined) {
          retObj = createSetErrorResponseJson(reqObj.requestId, setObj.error, setObj.timestamp);
        } else {
          retObj = createSetSuccessResponseJson(reqObj.requestId, setObj.timestamp);
        }
        if (g_ws != null)
          g_ws.send(JSON.stringify(retObj));
        // delete this request from queue
        g_reqTable.delReqByReqId(reqObj.requestId);
      }
    }
  } else if (dataObj != undefined) {
    // handler for 'data' notification from data source
    // handle 'get' and 'subscribe' at here

    //console.log("  :data message=" + JSON.stringify(dataObj));
    for (var i in g_reqTable.requestHash) {
      reqObj = g_reqTable.requestHash[i];
      if (reqObj.action != 'get' && reqObj.action != 'subscribe') {
        console.log("  :skip data: action="+ reqObj.action);
        continue;
      }
      matchObj = null;
      retObj = null;
      //console.log("  :reqObj="+JSON.stringify(reqObj));

      // do matching between received data path and client's request.
      // TODO: find faster efficient mathcing method.
      //       for now, treat path just as simple string.
      //       there should be better way to handle VSS tree structure.
      //       use hash or index or something.
      if ((matchObj = matchPath(reqObj, dataObj)) != undefined) {
        if (reqObj.action === "get") {
          // send back 'getSuccessResponse'
          retObj = createGetSuccessResponseJson(reqObj.requestId, matchObj.value, matchObj.timestamp);
          if (g_ws != null)
            g_ws.send(JSON.stringify(retObj));
          // delete this request from queue
          g_reqTable.delReqByReqId(reqObj.requestId);

        } else if (reqObj.action === "subscribe") {
          // send back 'subscribeSuccessResponse'
          retObj = createSubscribeNotificationJson(reqObj.requestId, reqObj.subscriptionId,
                      reqObj.action, reqObj.path, matchObj.value, matchObj.timestamp);
          if (g_ws != null)
            g_ws.send(JSON.stringify(retObj));
        /*
        } else if (reqObj.action === "set") {
        } else if (reqObj.action === "authorize") {
        } else if (reqObj.action === "getVSS") {
        */
        } else {
          // nothing to do
        }
      }
    }
  }
}

function matchPath(reqObj, dataObj) {
  //TODO: find more efficient matching method
  //    : as 1st version, take simplest way
  for (var i in dataObj) {
    if (dataObj[i].path === reqObj.path) {
      return dataObj[i];
    }
  }
  return undefined;
}

function matchPathforSet(reqObj, dataObj) {
  if (reqObj.path === dataObj.path) {
    return dataObj;
  } else {
    return undefined;
  }
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

// ===================
// == JSON Creation ==
// ===================
function createGetSuccessResponseJson(reqId, value, timestamp) {
  var retObj = {"requestId": reqId, "value": value, "timestamp":timestamp};
  return retObj;
}

function createSubscribeSuccessResponseJson(action, reqId, subId, timestamp) {
  var retObj = {"action":action, "requestId":reqId, "subscriptionId":subId, 
                "timestamp":timestamp};
  return retObj;
}
function createSubscribeErrorResponseJson(action, reqId, path, error, timestamp) {
  //TODO: fix format later
  var retObj = {"requestId":reqId, "path":path, "error":error,
                "timestamp":timestamp};
  return retObj;
}

function createSubscribeNotificationJson(reqId, subId, action, path, val, timestamp) {
  var retObj = {'subscriptionId':subId, 'path':path, 'value':val, 'timestamp':timestamp};
  return retObj;
}

function createUnsubscribeSuccessResponseJson(action, reqId, subId, timestamp) {
  var retObj = {"action": action, "requestId":reqId, "subscriptionId":subId,
                "timestamp":timestamp};
  return retObj;
}
function createUnsubscribeErrorResponseJson(action, reqId, subId, error, timestamp) {
  var retObj = {"action": action, "requestId":reqId, "subscriptionId":subId,
                "error":error, "timestamp":timestamp};
  return retObj;
}

function createSetSuccessResponseJson(reqId, timestamp) {
  console.log("createSetSuccessResponseJson");
  var retObj = {"action": "set", "requestId":reqId, "timestamp":timestamp};
  return retObj;
}
function createSetErrorResponseJson(reqId, error, timestamp) {
  console.log("createSetErrorResponseJson");
  var retObj = {"action": "set", "requestId":reqId, "error":error, "timestamp":timestamp};
  return retObj;
}

