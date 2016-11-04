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

// ===============================================
// == Connect to external dataSrc via WebSocket ==
// ===============================================
// * Connect as client
var DataSrcIP = '10.5.162.79';
var DataSrcPort = 8072;
var dataSrcUrl = "ws://" + DataSrcIP + ":" + DataSrcPort;
var WebSocketClient = require('websocket').client;
var g_dataSrc = new WebSocketClient();

g_dataSrc.on('connect', function(conn) {
  console.log('Connected to DataSrc');
  conn.on('error', function(err) {
    console.log("dataSrc on error ");
  });
  conn.on('close', function() {
    console.log("dataSrc on close ");
  });
  conn.on('message', function(msg) {
    //console.log("dataSrc on message :");
    if (msg.type === 'utf8') {
      dataReceiveHandler(msg.utf8Data);
    }
  });
});
g_dataSrc.connect(dataSrcUrl,'');

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
  console.log('ws.on:connection');
  g_ws = ws;

  // for connecting to outside data source
  g_ws.on('message', function(message) {
    var obj = JSON.parse(message);
    console.log("ws.on:message: obj= " + message);
    console.log("  :action=" + obj.action);

    // for 'get'
    if (obj.action === "get") {
      var reqId = obj.requestId;
      var path = obj.path;
      var ret = g_reqTable.addReqToTable(obj, null, null);
      if (ret == false) {
        console.log("  :Failed to add 'get' info to requestTable.");
      }
      console.log("  :get request registered. reqId=" + reqId + ", path=" + path);

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

  g_ws.on('close', function() {
    console.log('ws.on:closed');
    g_reqTable.clearReqTable();
    g_ws = null;
  });
});

// ============================
// == Data Source Connection ==
// ============================
//TODO:
// - dataはWSで別ホストから送付される前提。
// - on.message でJSONを受け取り中身を解析すると取得データが分かる
// - on.message でリクエストキュー内のリクエストの要求パスとマッチングする
// - まずは、data sourceのモックをタイマ駆動で作り
// - on.message 代わりのハンドラで受ける仕組みを作る

// dataSrcからのWebSocketメッセージ受信は以下で処理する想定

// WebSocketで外部のdataSrcからデータを受信する代わりに
// タイマーでダミーdataSrcからの受信イベントを発生させる
function dummySrc_ReceiveData() {
  setInterval(function() {
    // receive data Json
    var msg = receiveDataSrcJson();
    dataReceiveHandler(msg);
  }, 1000);
}

function receiveDataSrcJson() {
  var speed = getValueByPath("Signal.Drivetrain.Transmission.Speed");
  var rpm   = getValueByPath("Signal.Drivetrain.InternalCombustionEngine.RPM");
  var steer = getValueByPath("Signal.Chassis.SteeringWheel.Angle");
  var timestamp = new Date().getTime().toString(10);

  //TODO: ここで返すデータの形式はどういうのが良い？
  //ハッカソンサーバからはZMP形式のJSONが来るが..
  //- 一番簡単なのは、以下のように単純に文字列として扱うこと。
  //  とりあえず、これでいく
  //- 他の方法は？。。ツリー構造を意識した方法？
  //- 後のマッチングがやりやすい方法がよいが..
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
  var msg = JSON.stringify(obj);
  return msg;
}

function matchPath(path, dataObj) {
  //console.log("matchPath: path=" + path);
  //TODO: 効率の良いマッチング方法を考える
  //    :とりあえずは一番簡単な方法でやる
  for (var i in dataObj) {
    if (dataObj[i].path === path) {
      //console.log("  :data found. path="+path);
      return dataObj[i];
    }
  }
}

function dataReceiveHandler(message) {
  console.log("dataReceiveHandler: ");
  //ここのmessageは、ZMPのJSONフォーマットで来る想定
  var obj = JSON.parse(message);
  var dataObj;
  var retObj, reqObj;
  // 複数のデータの変更が通知される

  // get, subscribe等のリクエストキューのエントリの
  // 各データpathとマッチング。マッチしたらイベント発火となる
  //TODO: 遅くならないマッチング方法は？
  //      g_reqTableの構造を変える？
  //      pathを与えると、該当するrequestがパッと取れるような。。
  for (var i in g_reqTable.requestHash) {
    reqObj = g_reqTable.requestHash[i];
    dataObj = null;
    retObj = null;
    console.log("  :reqObj="+JSON.stringify(reqObj));
    if ((dataObj = matchPath(reqObj.path, obj)) != null) {
      if (reqObj.action === "get") {
        // getSuccessResponse を送り返す
        retObj = createGetSuccessResponseJson(reqObj.requestId, dataObj.value, dataObj.timestamp);
        if (g_ws != null)
          g_ws.send(JSON.stringify(retObj));
        // Queからこのrequestを削除する
        g_reqTable.delReqByReqId(reqObj.requestId);

      } else if (reqObj.action === "subscribe") {
        // subscribeSuccessResponseを送り返す
        retObj = createSubscribeNotificationJson(reqObj.requestId, reqObj.subscriptionId,
                    reqObj.action, reqObj.path, dataObj.value, dataObj.timestamp);
        //console.log("  :subscribe: retObj="+JSON.stringify(retObj));
        if (g_ws != null)
          g_ws.send(JSON.stringify(retObj));
      } else {
        // ここには来ないはず
      }
    }
  }
}

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

// Run dummy data source
//dummySrc_ReceiveData();

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

//====================
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

