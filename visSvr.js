// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// Vehicle Information Server prototype implementation
//
// - data source to connect ( only EXT_MOCK_SERVER is supported for now)
//   - LOCAL_MOCK_DATA : to use hard coded data source driven by timer
//   - EXT_MOCK_SERVER : to use external websocket mock server 'mockDataSvr.js'
//   - EXT_SIP_SERVER  : to use websocket server which hosts actual vehicle data
//                       developed for SIP hackathon.

"use strict"

// == Server IP and Port Number ==
var svr_config = require('./svr_config');
var VISS_IP = svr_config.VISS_IP;
var VISS_PORT = svr_config.VISS_PORT;
var SUBPROTOCOL = "wvss1.0";

var TOKEN_VALID = svr_config.TOKEN_VALID;
var TOKEN_INVALID = svr_config.TOKEN_INVALID;

var EXT_MOCKSVR_IP = svr_config.DATASRC_IP;
var EXT_MOCKSVR_PORT = svr_config.DATASRC_PORT;

// == data source selection ==
var LOCAL_MOCK_DATA = 0;
var EXT_MOCK_SERVER = 1;
var EXT_SIP_SERVER = 2;
// Please select dataSrc from above options
//var dataSrc = LOCAL_MOCK_DATA;
var dataSrc = EXT_MOCK_SERVER;
//var dataSrc = EXT_SIP_SERVER;

// == log level ==
var LOG_QUIET = 0 // only important log will shown
var LOG_DEFAULT = 1
var LOG_VERBOSE = 2; // not very important log will also shown
var LOG_CUR_LEVEL = LOG_DEFAULT;

// == Error value definition ==
// TODO: add more
var ERR_SUCCESS = 'success';
var ERR_INVALID_TOKEN = 'invalid token';

// Error from VISS spec
// (for definition, refer VISS spec)
// TODO: is this ok that these errors are indistinctive?
var ERR_USER_FORBIDDEN   = '403';
var ERR_USER_UNKNOWN     = '403';
var ERR_DEVICE_FORBIDDEN = '403';
var ERR_DEVICE_UNKNOWN   = '403';

// == static values ==
// TODO: TTL value is period?(e.g. 1000sec) or clock time(e.g. 2017/02/07-15:43:00.000)
// May be clock time is easy to use. If period, need to memorize start time.
var AUTHORIZE_TTL = 30; //sec. mock value

// ===========================
// == Start WebSocketServer ==
// ===========================

// for sub-protocol support
function selectProtocols(protocols) {
  printLog(LOG_DEFAULT, "  :incomming sub-protocol = " + protocols);
  printLog(LOG_DEFAULT, "  :granting sub-protocol = " + SUBPROTOCOL);
  return SUBPROTOCOL;
};

var WebSocketServer = require('ws').Server;
var wssvr = new WebSocketServer({
  host : VISS_IP,
  port : VISS_PORT,
  handleProtocols : selectProtocols 
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

  var dataSrcReqHash = {}; //{dataSrcReqId : {'requestId':reqId, 'sessionId':sessId}}

  var obj = {
    svrUrl: m_svrUrl,

    connectHandler:  function(conn) {
      m_conn = conn;
      printLog(LOG_DEFAULT, 'connectHandler: ');
      printLog(LOG_DEFAULT,'  :Connected to DataSrc');

      conn.on('error', function(err) {
        printLog(LOG_QUIET,"  :dataSrc on error ");
      });
      conn.on('close', function() {
        printLog(LOG_QUIET,"  :dataSrc on close ");
        m_conn = null;
      });
      conn.on('message', function(msg) {
        if (msg.type === 'utf8') {
          dataReceiveHandler(msg.utf8Data);
        }
      });
    },

    //send set request to mockDataSrc
    sendSetRequest: function(obj, _reqId, _sessId) {
      if (m_conn != null) {
        var dataSrcReqId = this.createDataSrcReqId();
        var sendObj = this.createExtMockSvrSetRequestJson(obj, dataSrcReqId);
        this.addDataSrcReqHash(dataSrcReqId, _reqId, _sessId);
        //printLog(LOG_DEFAULT,"  :sendObj="+JSON.stringify(sendObj));
        m_conn.sendUTF(JSON.stringify(sendObj));
      }
    },
    //send VSS json(full) request to mockDataSrc
    sendVSSRequest: function(obj, _reqId, _sessId) {
      if (m_conn != null) {
        var dataSrcReqId = this.createDataSrcReqId();
        var sendObj = this.createExtMockSvrVSSRequestJson(obj, dataSrcReqId);
        this.addDataSrcReqHash(dataSrcReqId, _reqId, _sessId);
        //printLog(LOG_DEFAULT,"  :sendObj="+JSON.stringify(sendObj));
        m_conn.sendUTF(JSON.stringify(sendObj));
      }
    },

    createDataSrcReqId: function() {
      var uniq = getSemiUniqueId();
      return "datasrcreqid-"+uniq;
    },

    createExtMockSvrSetRequestJson: function(_obj, _dataSrcReqId) {
      var retObj =  {"action": "set", "data":
                      {"path": _obj.path,
                       "value": _obj.value,
                       "requestId":_dataSrcReqId}
                    };

      return retObj;
    },
    createExtMockSvrVSSRequestJson: function(_obj, _dataSrcReqId) {
      // No need to specify path since, narrow down is done in visSvr side.
      var retObj = {"action": "getVSS", "data": {
                    "requestId":_dataSrcReqId}};
      return retObj;
    },

    addDataSrcReqHash: function(_dataSrcReqId, _reqId, _sessId) {
      dataSrcReqHash[_dataSrcReqId] = {'requestId':_reqId, 'sessionId':_sessId};
      printLog(LOG_VERBOSE,"addDataSrcReqHash["+_dataSrcReqId+"] = "
                  + JSON.stringify(dataSrcReqHash[_dataSrcReqId]));
    },

    delDataSrcReqHash: function(_dataSrcReqId) {
      delete dataSrcReqHash[_dataSrcReqId];
    },
    getReqIdSessIdObj: function(_dataSrcReqId) {
      return dataSrcReqHash[_dataSrcReqId];
    }
  }
  return obj;
})();

if (dataSrc === EXT_MOCK_SERVER) {
  var modWsClient= require('websocket').client;
  var wsClient = new modWsClient();
  wsClient.on('connect', g_extMockDataSrc.connectHandler);
  printLog(LOG_DEFAULT,"g_extMockDataSrc.svrUrl= " + g_extMockDataSrc.svrUrl);
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
    var vssData;
    var sipObj;
    try {
      sipObj = JSON.parse(sipData);
    } catch(e) {
      //iregurlar Json case
      printLog(LOG_DEFAULT,"  :received irregular Json messaged. ignored.");
      printLog(LOG_DEFAULT,"  :Error = "+e);
      return;
    }
    var vehicleSpeed = this.getValueFromSIPObj(sipObj,"Vehicle.RunningStatus.VehicleSpeed.speed");
    var engineSpeed = this.getValueFromSIPObj(sipObj,"Vehicle.RunningStatus.EngineSpeed.speed");
    var steeringWheel = this.getValueFromSIPObj(sipObj,"Vehicle.RunningStatus.SteeringWheel.angle");

    // Create VSS format JSON
    // TODO: need brush up.
    var vssObj = new Array();
    if (vehicleSpeed != undefined) {
      printLog(LOG_VERBOSE,"  :vehicleSpeed.value=" + vehicleSpeed.value);
      printLog(LOG_VERBOSE,"  :vehicleSpeed.timestamp=" + vehicleSpeed.timestamp);
      var obj =
      { "path": "Signal.Drivetrain.Transmission.Speed",
        "value": vehicleSpeed.value,
        "timestamp":vehicleSpeed.timestamp};
      vssObj.push(obj);
    }
    if (engineSpeed != undefined) {
      var obj =
      { "path": "Signal.Drivetrain.InternalCombustionEngine.RPM",
        "value": engineSpeed.value,
        "timestamp":engineSpeed.timestamp};
      vssObj.push(obj);
    }
    if (steeringWheel != undefined) {
      var obj =
      { "path": "Signal.Chassis.SteeringWheel.Angle",
        "value": steeringWheel.value,
        "timestamp":steeringWheel.timestamp};
      vssObj.push(obj);
    }
    if (vssObj.length > 1) {
      var obj = {"data": vssObj};
      var vssStr = JSON.stringify(obj);
      return vssStr;
    } else {
      return undefined;
    }
  },

  // pick out an object from SIP formed JSON by specifing 'path'
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
      var vssData = g_extSIPDataSrc.convertFormatFromSIPToVSS(sipData);
      if (vssData != undefined) {
        dataReceiveHandler(vssData);
      }
    });
    sioClient.on('connect',function(){
        printLog(LOG_QUIET,"on.connect");
        var msg = {"roomID":g_extSIPDataSrc.roomID, "data":"NOT REQUIRED"};
        sioClient.emit('joinRoom', JSON.stringify(msg));
    });
  }
}


// =============================
// == session Hash definition ==
// =============================
// A websocket connection is a 'session'
var g_sessionHash = {};
var g_sessID_count = 0; // no need to be unique string.
function createNewSessID() {
  g_sessID_count++;
  return g_sessID_count;
}

// ==========================
// == ReqTable Constructor ==
// ==========================
function ReqTable() {
  this.requestHash = {};
  this.subIdHash = {};
}
ReqTable.prototype.addReqToTable = function(reqObj, subId, timerId) {
  var reqId = reqObj.requestId;
  printLog(LOG_VERBOSE,"addReqToTable: reqId="+reqId);
  if (this.requestHash[reqId] != undefined) {
    printLog(LOG_QUIET,"  :Error: requestId already used. reqId="+reqId);
    return false;
  }
  this.requestHash[reqId] = reqObj;

  //subscribeの場合subIdHashにも登録する
  if (reqObj.action == "subscribe") {
    if (subId != undefined && this.subIdHash[subId] == undefined) {
      printLog(LOG_VERBOSE,"  :action="+reqObj.action+". adding subId="+subId);
      this.requestHash[reqId].subscriptionId = subId;
      this.subIdHash[subId] = reqId;
    } else {
      printLog(LOG_VERBOSE,"  :action="+reqObj.action+". not adding subId="+subId);
    }
    // timerIdは、setIntervalでイベントを発生させるデモ実装の場合。
    // dataSrcからデータ通知を受ける場合はタイマは使わない
    if (timerId != undefined) {
      printLog(LOG_VERBOSE,"  :action="+reqObj.action+". adding timerId="+subId);
      this.requestHash[reqId].timerId = timerId;
    }
  }

  printLog(LOG_DEFAULT,"  :EntryNum=" + Object.keys(this.requestHash).length);
  return true;
}
ReqTable.prototype.delReqByReqId = function(reqId) {
  printLog(LOG_VERBOSE,"delReqByReqId: reqId = " + reqId);
  if (this.requestHash[reqId] == undefined) {
    printLog(LOG_VERBOSE,"  :delReqByReqId: entry is not found. reqId = " + reqId);
    return false;
  }
  var subId = this.requestHash[reqId].subscriptionId;
  delete this.requestHash[reqId];
  if (subId != undefined)
    delete this.subIdHash[subId];
  printLog(LOG_DEFAULT,"  :EntryNum=" + Object.keys(this.requestHash).length);
  return true;
}
ReqTable.prototype.clearReqTable = function() {
  printLog(LOG_DEFAULT,"  :clearReqTable");

  for (var rid in this.requestHash) {
    var obj = this.requestHash[rid];
    printLog(LOG_DEFAULT,"  :reqId=" + obj.requestId + " , subId="+obj.subscriptionId+", path="
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
}
ReqTable.prototype.getReqIdBySubId = function(subId) {
  var reqId = this.subIdHash[subId];
  if (reqId == undefined) return null;
  return reqId;
}
ReqTable.prototype.getSubIdByReqId = function(reqId) {
  var obj = this.requestHash[reqId];
  if (obj == undefined) return null;
  return obj.subscriptionId;
}
ReqTable.prototype.getTimerIdByReqId = function(reqId) {
  printLog(LOG_VERBOSE,"getTimerIdByReqId: reqId="+reqId);
  var obj = this.requestHash[reqId];
  if (obj == undefined) {
    printLog(LOG_VERBOSE,"  :getTimerIdByReqId: object not found.");
    return null;
  }
  printLog(LOG_VERBOSE,"  :timerId = " + obj.timerId);
  return obj.timerId;
}
ReqTable.prototype.dispReqIdHash = function() {
  printLog(LOG_VERBOSE,"dispReqIdHash:");
  for (var rid in this.requestHash) {
    var obj = this.requestHash[rid];
    printLog(LOG_VERBOSE,"  :reqid=" + obj.requestId + " , subid="+obj.subscriptionId
                +", path="+obj.path+", timerid="+obj.timerid);
  }
}

// ================================
// == Authorize Hash Constructor ==
// ================================
// Very easy impl of Authorize system. TODO: change to better impl.
function AuthHash() {
  // AuthHash usage
  // - if 'path' is not found in AuthHash => the pass is accessible by any action
  // - if 'path' is found in AuthHash => the pass needs 'authorize' for access
  // - if the 'path's 'get' value is false => can not 'get' the data (need authorize)
  //   basically, if 'authorize' success, the value of 'get','set','subscribe' should set to 'true'
  //   (this access-control impl is adhoc and easy example.
  this.hash = {};
  this.hash['Signal.Cabin.Door.Row1.Right.IsLocked'] = {'get':false, 'set':false, 'subscribe':false};
  this.hash['Signal.Cabin.Door.Row1.Left.IsLocked']  = {'get':false, 'set':false, 'subscribe':false};
  this.hash['Signal.Cabin.HVAC.Row1.RightTemperature'] = {'get':false, 'set':false, 'subscribe':false};
  this.hash['Signal.Cabin.HVAC.Row1.LeftTemperature']  = {'get':false, 'set':false, 'subscribe':false};

}
AuthHash.prototype.grantAll = function() {
  printLog(LOG_DEFAULT,"  :AuthHash.grantAll()");
  for (var id in this.hash) {
    var obj = this.hash[id];
    obj.get = true;
    obj.set = true;
    obj.subscribe = true;
  }
  printLog(LOG_DEFAULT,"  :AuthHash=" + JSON.stringify(this.hash));
}
AuthHash.prototype.ungrantAll = function() {
  printLog(LOG_DEFAULT,"  :AuthHash.ungrantAll()");
  for (var id in this.hash) {
    var obj = this.hash[id];
    obj.get = false;
    obj.set = false;
    obj.subscribe = false;
  }
  printLog(LOG_DEFAULT,"  :AuthHash=" + JSON.stringify(this.hash));
}

wssvr.on('connection', function(ws) {

  var _sessId = createNewSessID();
  var _reqTable = new ReqTable();
  var _authHash = new AuthHash();
 
  printLog(LOG_DEFAULT,"  :ws.on:connection: sessId= " + _sessId);

  // store sessID, reqTable, ws in a global hash
  g_sessionHash[_sessId] = {'ws': ws, 'reqTable': _reqTable, 'authHash': _authHash};

  // for connecting to outside data source
  ws.on('message', function(message) {
    var obj;
    try {
      obj = JSON.parse(message);
    } catch (e) {
      printLog(LOG_QUIET,"  :received irregular Json messaged. ignored. msg = "+message);
      printLog(LOG_QUIET,"  :Error = "+e);
      return;
    }
    printLog(LOG_DEFAULT,"  :ws.on:message: obj= " + message);

    // NOTE: assuming 1 message contains only 1 method.
    // for 'get'
    if (obj.action === "get") {
      var reqId = obj.requestId;
      var path = obj.path;
      var ret = _reqTable.addReqToTable(obj, null, null);
      if (ret == false) {
        printLog(LOG_QUIET,"  :Failed to add 'get' info to requestTable.");
      }
      printLog(LOG_VERBOSE,"  :get request registered. reqId=" + reqId + ", path=" + path);

    } else if (obj.action === "set") {
      printLog(LOG_DEFAULT,"  :action=" + obj.action);
      var reqId = obj.requestId;
      var path = obj.path;
      var value = obj.value;
      var ret = _reqTable.addReqToTable(obj, null, null);

      var ret = accessControlCheck(path,'set', _authHash);
      printLog(LOG_DEFAULT ,"  : accessControlCheck = " + ret );

      if (ret == false) {
        printLog(LOG_DEFAULT ,"  : 'authorize' required for 'set' value to " + path );
        var ts = getUnixEpochTimestamp();
        var err = ERR_USER_FORBIDDEN; //TODO better to use detailed actual reason
        resObj = createSetErrorResponse(reqId, err, ts);
        ws.send(JSON.stringify(resObj));
      } else {
        // TODO: for now support extMockDataSrc only. support other dataSrc when needed.
        g_extMockDataSrc.sendSetRequest(obj, reqId, _sessId);
        printLog(LOG_VERBOSE,"  :set request registered. reqId=" + reqId + ", path=" + path);
      }

    } else if (obj.action === "authorize") {
      var reqId = obj.requestId;
      var token = obj.tokens;

      var err = mock_judgeAuthorizeToken(token);
      var resObj;
      if (err === ERR_SUCCESS) {
        printLog(LOG_DEFAULT,"  :authorize token check succeeded.");
        //change authorize status
        _authHash.grantAll();
        resObj = createAuthorizeSuccessResponse(reqId, AUTHORIZE_TTL);
        // Timer for 'authorize expiration'
        setTimeout(function() { _authHash.ungrantAll();}, AUTHORIZE_TTL * 1000);
      } else {
        printLog(LOG_DEFAULT,"  :authorize token check failed.");
        resObj = createAuthorizeErrorResponse(reqId, err);
      }
      ws.send(JSON.stringify(resObj));

    } else if (obj.action === "getVSS") {
      // - VSS json is retrieved from dataSrc
      // TODO:
      // - how to extract sub-tree by 'path'? extract in VISS or dataSrc side?
      var reqId = obj.requestId;
      var path = obj.path;
      var ret = _reqTable.addReqToTable(obj, null, null);
      g_extMockDataSrc.sendVSSRequest(obj, reqId, _sessId);
      printLog(LOG_VERBOSE,"  :getVSS request registered. reqId=" + reqId + ", path=" + path);

    // for 'subscribe'
    } else if (obj.action === "subscribe") {

      var resObj = null;
      var reqId = obj.requestId;
      var path = obj.path;
      var action = obj.action;
      var subId = getUniqueSubId();

      var ret = _reqTable.addReqToTable(obj, subId, null);
      var timestamp = new Date().getTime().toString(10);
      if (ret == false) {
        printLog(LOG_QUIET,"  :Failed to add subscribe info to IdTable. Cancel the timer.");
        var error = -1; //TODO: select correct error code
        resObj = createSubscribeErrorResponse(action, reqId, path, error, timestamp);
      } else {
        printLog(LOG_DEFAULT, "  :subscribe started. reqId=" + reqId + ", subId=" + subId + ", path=" + path);
        resObj = createSubscribeSuccessResponse(action, reqId, subId, timestamp);
      }
      ws.send(JSON.stringify(resObj));

    } else if (obj.action === "unsubscribe") {
      var reqId = obj.requestId; // unsub requestのreqId
      var targ_subId = obj.subscriptionId; // subscribe のsubId
      var targ_reqId = _reqTable.getReqIdBySubId(targ_subId); // subscribeのreqId
      var resObj;
      var ret = _reqTable.delReqByReqId(targ_reqId); // subscribeのentryを削除
      var timestamp = new Date().getTime().toString(10);

      if (ret == true) {
        printLog(LOG_DEFAULT,"  :Success to unsubscribe with subId = " + targ_subId);
        resObj = createUnsubscribeSuccessResponse(obj.action, reqId, targ_subId, timestamp);
      } else {
        printLog(LOG_QUIET,"  :Failed to unsubscribe with subId = " + targ_subId);
        var err = -1; //TODO: select correct error value
        resObj = createUnsubscribeErrorResponse(obj.action, reqId, targ_subId, err, timestamp);
      }
      ws.send(JSON.stringify(resObj));

    } else if (obj.action === "unsubscribeAll") {
      for (var i in _reqTable.subIdHash) {
        var reqId = _reqTable.subIdHash[i];
        delete _reqTable.requestHash[reqId];
        delete _reqTable.subIdHash[i];
      }
      printLog(LOG_DEFAULT,"  :Success to unsubscribe all subscription.");

      var timestamp = new Date().getTime().toString(10);
      resObj = createUnsubscribeAllSuccessResponse(obj.action, obj.requestId, timestamp);
      ws.send(JSON.stringify(resObj));

    } else {
      //Do nothing
    }
  });

  ws.on('close', function() {
    printLog(LOG_QUIET,'  :ws.on:closed');
    _reqTable.clearReqTable();

    // delete a session
    var sess = g_sessionHash[_sessId];
    sess.ws = null;

    delete sess.reqTable;
    delete sess.authHash;
    delete g_sessionHash[_sessId];
  });
});

// Handle data received from data source
function dataReceiveHandler(message) {
  var obj;
  try {
    obj = JSON.parse(message);
  } catch(e) {
    //irregurlar Json case
    printLog(LOG_QUIET,"  :received irregular Json messaged. ignored. msg : "+message);
    printLog(LOG_QUIET,"  :Error = "+e);
    return;
  }
  //console.log("from dataSrc= " + message.substr(0,300));

  var dataObj = null;
  var setObj  = null;
  var vssObj  = null;
  if (obj.action === "data") {
    dataObj = obj.data;
  } else if (obj.action === "set") {
    setObj = obj.data; //TODO: sync with acs vehicle data I/F document
  } else if (obj.action === "getVSS") {
    vssObj = obj.data;
  } else {
    // irregular data. exit
    return;
  }

  var resObj;
  var matchObj;
  var retObj, reqObj;

  // if 'getVSS' or 'set' response exists..
  if (vssObj || setObj) {
    //printLog(LOG_DEFAULT,"  :getVSS message=" + JSON.stringify(vssObj).substr(0,200));

    //[TODO] vssObj setObj 両方あるケースはなかったか？
    var _dataSrcReqId = null;
    if (vssObj) {
      _dataSrcReqId = vssObj.requestId;
    } else {
      _dataSrcReqId = setObj.requestId;
    }

    do { // for exitting by 'break'

      var _reqIdsessIdObj = g_extMockDataSrc.getReqIdSessIdObj(_dataSrcReqId);
      printLog(LOG_DEFAULT,"  :reqIdsessIdObj=" + JSON.stringify(_reqIdsessIdObj));
      if (_reqIdsessIdObj == undefined) {
        break;
      }
      var _sessId = _reqIdsessIdObj.sessionId;
      var _reqId = _reqIdsessIdObj.requestId;
      // As set response is returned, delete from hash.
      g_extMockDataSrc.delDataSrcReqHash[_dataSrcReqId];

      var _sessObj = g_sessionHash[_sessId];
      var _reqTable = _sessObj.reqTable;
      var _ws = _sessObj.ws;
      var _reqObj = _reqTable.requestHash[_reqId];

      // for getVSS response
      if (vssObj) {
        if (vssObj.error != undefined) {
          //TODO: test this case
          retObj = createVSSErrorResponse(_reqObj.requestId, vssObj.error);
        } else {
          printLog(LOG_DEFAULT, "  :> > > Entering extractPartialVSS");
          var targetVSS = extractPartialVSS(vssObj.vss, _reqObj.path);
          retObj = createVSSSuccessResponse(_reqObj.requestId, targetVSS);
        }
        printLog(LOG_VERBOSE,"  :getVSS response="+JSON.stringify(retObj).substr(0,3000));

      // for set response
      } else {
        if (setObj.error != undefined) {
          retObj = createSetErrorResponse(_reqObj.requestId, setObj.error, setObj.timestamp);
        } else {
          retObj = createSetSuccessResponse(_reqObj.requestId, setObj.timestamp);
        }
        printLog(LOG_VERBOSE,"  :set response="+JSON.stringify(retObj));
      }

      if (_ws != null) {
        // send back VSS json to client
        _ws.send(JSON.stringify(retObj));
      }
      // delete this request from queue
      _reqTable.delReqByReqId(_reqObj.requestId);

    } while(false);

  // handle standard pushed data
  // handler for 'data' notification from data source
  // handle 'get' and 'subscribe' at here
  } else if (dataObj != undefined) {
    for (var j in g_sessionHash) {
      var _sessObj = g_sessionHash[j];
      var _reqTable = _sessObj.reqTable;
      var _ws = _sessObj.ws;
      for (var i in _reqTable.requestHash) {
        reqObj = _reqTable.requestHash[i];
        if (reqObj.action != 'get' && reqObj.action != 'subscribe') {
          printLog(LOG_VERBOSE,"  :skip data: action="+ reqObj.action);
          continue;
        }
        matchObj = null;
        retObj = null;

        // do matching between received data path and client's request.
        // TODO: find faster efficient mathcing method.
        //       for now, treat path just as simple string.
        //       there should be better way to handle VSS tree structure.
        //       use hash or index or something.
        if ((matchObj = matchPathJson(reqObj, dataObj)) != null) {
          if (reqObj.action === "get") {
            // send back 'getSuccessResponse'
            retObj = createGetSuccessResponse(reqObj.requestId, matchObj.value, matchObj.timestamp);
            if (_ws != null)
              _ws.send(JSON.stringify(retObj));
            // delete this request from queue
            _reqTable.delReqByReqId(reqObj.requestId);

          } else if (reqObj.action === "subscribe") {
            // send back 'subscribeSuccessResponse'
            retObj = createSubscriptionNotificationJson(reqObj.subscriptionId, matchObj.value, matchObj.timestamp);

            if (_ws != null)
              _ws.send(JSON.stringify(retObj));
          } else {
            // nothing to do
          }
        }
      }
    }
  }
}

function matchPathJson(_reqObj, _dataObj) {
  var reqPath = _reqObj.path;
  var arrPath = reqPath.split(".");
  var targObj = _dataObj;

  for (var i=0; i<arrPath.length; i++) {
    //console.log("matching: key= " + arrPath[i]);
    if (targObj[arrPath[i]] == undefined) {
      //The specified path is not containted in dataObj
      printLog(LOG_DEFAULT,"  :matchPathJson fail");
      return null;
    } else {
      //printLog(LOG_DEFAULT,"  :matching: value= " + JSON.stringify(targObj[arrPath[i]]).substr(0,300) );
      targObj = targObj[arrPath[i]];
      if (i === arrPath.length-1) {
        //printLog(LOG_DEFAULT,"  :matchPath:success: data= " + JSON.stringify(targObj));
        return targObj;
      }
    }
  }
}

function accessControlCheck(_path, _action, _authHash) {
  printLog(LOG_VERBOSE,"  :accessControlCheck");
  var _obj = _authHash.hash[_path];
  printLog(LOG_VERBOSE,"  :hash=" + JSON.stringify( _authHash.hash  ));

  printLog(LOG_VERBOSE,"  :_path=" + _path);
  printLog(LOG_VERBOSE,"  :_action=" + _action);
  printLog(LOG_VERBOSE,"  :_obj=" + _obj);
  printLog(LOG_VERBOSE,"  :_obj=" + JSON.stringify(_obj));

  if (_obj == undefined) {
    return true;
  } else {
    var _status = _obj[_action];
    printLog(LOG_VERBOSE,"  :_status=" + _status);
    if (_status == undefined) {
      return false;
    } else if (_status == true) {
      return true;
    } else {
      return false;
    }
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
function getSemiUniqueId() {
  // create semi-uniquID (for implementation easyness) as timestamp(milli sec)+random string
  // uniqueness is not 100% guaranteed.
  var strength = 1000;
  var uniq = new Date().getTime().toString(16) + Math.floor(strength*Math.random()).toString(16);
  return uniq;
}

function getUniqueSubId() {
  // create semi-uniquID (for implementation easyness) as timestamp(milli sec)+random string
  // uniqueness is not 100% guaranteed.
  var strength = 1000;
  var uniq = getSemiUniqueId();
  return "subid-"+uniq;
}

function getUnixEpochTimestamp() {
  // get mili sec unix epoch string
  var ts = new Date().getTime().toString(10);
  return ts;
}

function getTimeString() {
  var date = new Date();

  var Y = date.getFullYear();
  var Mon = ("00"+(date.getMonth()+1)).substr(-2);
  var d = ("00"+date.getDate()).substr(-2);
  var h = ("00"+date.getHours()).substr(-2);
  var m = ("00"+date.getMinutes()).substr(-2);
  var s = ("00"+date.getSeconds()).substr(-2);

  var res = Y+"/"+Mon+"/"+d+"-"+h+":"+m+":"+s
    return res;
}

function printLog(lvl, msg) {
  if (lvl <= LOG_CUR_LEVEL) {
    console.log(getTimeString() + ":" + msg);
  }
}

// ==================
// == helper funcs ==
// ==================

// == extract partial vss from full-vss-tree by specifying 'path'
function extractPartialVSS(_objVSSAll, _strPath) {
  printLog(LOG_DEFAULT, "  :extractParialVSS: vss="
            + JSON.stringify(_objVSSAll).substr(0,100) + " path="+_strPath);
  //pathの分類
  // a.fullpath
  // b.途中まで
  // #getVSSは wildcard 非サポート

  // 手順
  // - _strPath を.で分割
  // - _objVSSAllをルートからたどっていく
  // - _strPathの最後までたどれたら、_objVSSAllは、_strPathを含んでいる
  // - _objVSSAllから_strPathに該当する部分ツリーを取り出す
  // - それを返す
  // - 指定した_strPathが_objVSSAllに含まれない場合、nullを返す、でよい？

  // _strPathが空文字列の場合、全ツリーを返す
  if (_strPath == '' || _strPath == undefined || _strPath == null)
    return _objVSSAll;

  // - _strPath を.で分割
  var nodeNames = _strPath.split(".");

  // - _objVSSAllをルートからたどっていく
  var pathLen = nodeNames.length;
  var allTree = _objVSSAll;
  var allTreePtr = null;  // allTreeをたどるためのポインタ
  allTreePtr = allTree;

  var resultTree = {};
  var resultTreePtr = resultTree; // resultTreeをたどるためのポインタ

  for (var i=0; i<pathLen; i++) {
    var node = nodeNames[i];
    if (allTreePtr[node] == undefined) {
      // _strPathのノードの一部がvssAll内に含まれない
      // => _strPathにマッチするVSSはなし。null を return
      printLog(LOG_DEFAULT, "  :Node:"+node+" not exists. Return null and exit.");
      return null;
    }

    // ノードはvssAllに含まれていた
    printLog(LOG_DEFAULT, "  :Node:["+node+"] exists");
    var nextNode = allTreePtr[node];
    var nextNodeCopy = Object.assign({},nextNode); // Object.assign()はobjectのコピー

    //resultTreeに現ノードを追加
    resultTreePtr[node] = nextNodeCopy;

    // ループの最終周なら、ここで結果を返して終了
    if (i == pathLen-1) {
      //カレントノードがchildrenなしなら、そのまま返す
      printLog(LOG_DEFAULT, "  :SUCCESS: reached to the end");
      printLog(LOG_DEFAULT, "  :res = " + JSON.stringify(resultTree));
      return resultTree;
    }

    // 以降、次ループ用の準備

    // allTreePtrのポインタを移動する
    if (nextNode['children'] != undefined) {
      printLog(LOG_DEFAULT, "  :children exists. Go next loop.");
      allTreePtr = nextNode['children'];
    } else {
      // childrenが無い場合は、現ノードに移動
      // ただし、この場合、これ以上の子ノードが無いので、
      // 次ループは意味が無いはずだが、そこは次ループで判定される
      printLog(LOG_DEFAULT, "  :No children. Go next loop");
      allTreePtr = nextNode;
    }

    // resultTreePtrのポインタを移動
    var tmpObj = null;
    if (resultTreePtr[node]['children']) {
      resultTreePtr[node]['children'] = {}; // childrenを空にしておく
      tmpObj = resultTreePtr[node]['children'];

    } else {
      tmpObj = resultTreePtr[node];
    }
    resultTreePtr = tmpObj;
  }
}

function mock_judgeAuthorizeToken(token) {
  //TODO: empty func. for now, return SUCCESS if token exists.
  var user_token = token['authorization'];
  var device_token = token['www-vehicle-device'];
  if (user_token == TOKEN_VALID || device_token == TOKEN_VALID)
    return ERR_SUCCESS;
  else
    return ERR_INVALID_TOKEN;
}

// ===================
// == JSON Creation ==
// ===================
function createGetSuccessResponse(reqId, value, timestamp) {
  var retObj = {"action":"get", "requestId": reqId, "value": value, "timestamp":timestamp};
  return retObj;
}
function createGetErrorResponse(reqId, error, timestamp) {
  var retObj = {"action":"get", "requestId": reqId, "error":error, "timestamp":timestamp};
  return retObj;
}

function createSubscribeSuccessResponse(action, reqId, subId, timestamp) {
  var retObj = {"action":action, "requestId":reqId, "subscriptionId":subId, 
                "timestamp":timestamp};
  return retObj;
}
function createSubscribeErrorResponse(action, reqId, path, error, timestamp) {
  //TODO: fix format later
  var retObj = {"requestId":reqId, "path":path, "error":error,
                "timestamp":timestamp};
  return retObj;
}

function createSubscriptionNotificationJson(subId, val, timestamp) {
  var retObj = {'action':'subscription', 'subscriptionId':subId, 'value':val, 'timestamp':timestamp};
  return retObj;
}
function createSubscriptionNotificationErrorJson( subId, error, timestamp) {
  var retObj = {'action':'subscription', 'subscriptionId':subId, 'error':error, 'timestamp':timestamp};
  return retObj;
}

function createUnsubscribeSuccessResponse(action, reqId, subId, timestamp) {
  var retObj = {"action": action, "requestId":reqId, "subscriptionId":subId,
                "timestamp":timestamp};
  return retObj;
}
function createUnsubscribeErrorResponse(action, reqId, subId, error, timestamp) {
  var retObj = {"action": action, "requestId":reqId, "subscriptionId":subId,
                "error":error, "timestamp":timestamp};
  return retObj;
}

function createUnsubscribeAllSuccessResponse(action, reqId, timestamp) {
  var retObj = {"action": action, "requestId":reqId, 
                "timestamp":timestamp};
  return retObj;
}
function createUnsubscribeAllErrorResponse(action, reqId, error, timestamp) {
  var retObj = {"action": action, "requestId":reqId,
                "error":error, "timestamp":timestamp};
  return retObj;
}

function createSetSuccessResponse(reqId, timestamp) {
  var retObj = {"action": "set", "requestId":reqId, "timestamp":timestamp};
  return retObj;
}
function createSetErrorResponse(reqId, error, timestamp) {
  var retObj = {"action": "set", "requestId":reqId, "error":error, "timestamp":timestamp};
  return retObj;
}

// == getVSS ==
function createVSSSuccessResponse(reqId, vss) {
  var retObj = {"action": "getVSS", "requestId":reqId, "vss":vss};
  return retObj;
}
function createVSSErrorResponse(reqId, error, timestamp) {
  var retObj = {"action": "getVSS", "requestId":reqId, "error":error};
  return retObj;
}
// == authorize ==
function createAuthorizeSuccessResponse(reqId, ttl) {
  var retObj = {"action": "authorize", "requestId":reqId, "TTL":ttl};
  return retObj;
}
function createAuthorizeErrorResponse(reqId, err) {
  var retObj = {"action": "authorize", "requestId":reqId, "error":err};
  return retObj;
}

