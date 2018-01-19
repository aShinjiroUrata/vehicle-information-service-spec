// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// Vehicle Information Server prototype implementation
//
// - data source to connect ( only EXT_MOCK_SERVER is supported for now)
//   - LOCAL_MOCK_DATA : to use hard coded data source driven by timer
//   - EXT_MOCK_SERVER : to use external websocket mock server 'mockDataSvr.js'
//   - EXT_SIP_SERVER  : to use websocket server which hosts actual vehicle data
//                       developed for SIP hackathon.
//
// Note:
//  - hackathonServerで使われてきたZMP定義のデータ形式を便宜的にSIP形式と記載する
// TODO:
//  - dataSrc, clientの切断、再接続に対応する。今は手順どおりに起動しないと接続できなかったりする
//  - どうも、dataSrcは 1インスタンスの前提で書いているコードが結構あるような
//    一通り洗い出して、修正したい
//  - データ項目の形式について
//    - SIP形式: SIP Prj/ハッカソン向けに作成した車両データ形式
//    - VSS形式: W3C Autotive WGで採用された、GeNIVI Vehicle Signal Specで定義された車両データ形式
//
"use strict"

var sockIoClient = require('socket.io-client');

// == Server IP and Port Number ==
var svr_config = require('./svr_config');
// AWS上でVISSを使う場合、以下にはAWSのPrivIPを設定すると動作した。PubIPではNGだった。
var VISS_IP = svr_config.VISS_IP_PRV;
var VISS_PORT = svr_config.VISS_PORT;
var SUBPROTOCOL = "wvss1.0";

var TOKEN_VALID = svr_config.TOKEN_VALID;
var TOKEN_INVALID = svr_config.TOKEN_INVALID;

var EXT_MOCKSVR_IP = svr_config.DATASRC_IP;
var EXT_MOCKSVR_PORT = svr_config.DATASRC_PORT;

var EXT_SIPSVR_IP     = svr_config.HKSV_SRC_IP;
var EXT_SIPSVR_PORT   = svr_config.HKSV_SRC_PORT;
var EXT_SIPSVR_ROOMID = svr_config.HKSV_ROOMID;

// == data source selection ==
var LOCAL_MOCK_DATA = 0;
var EXT_MOCK_SERVER = 1;
var EXT_SIP_SERVER = 2;
// Please select dataSrc from above options
//var dataSrc = LOCAL_MOCK_DATA;
//var dataSrc = EXT_MOCK_SERVER;
var dataSrc = EXT_SIP_SERVER;

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

// [ urata ] : VISS Server's WebSocket URL( wait with PrivIP )
printLog(LOG_DEFAULT, "VISS WSSVR = ws://" + VISS_IP + ":" + VISS_PORT);
var WebSocketServer = require('ws').Server;
var vissvr = new WebSocketServer({
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
      var retObj = {"action": "getMetadata", "data": {
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
printLog(LOG_DEFAULT, "EXT_SIPSVR_ROOMID = " + EXT_SIPSVR_ROOMID);
printLog(LOG_DEFAULT, "EXT_SIPSVR_IP : EXT_SIPSVR_PORT = " + EXT_SIPSVR_IP + ":" + EXT_SIPSVR_PORT);

var g_extSIPDataSrc = {
  roomID: EXT_SIPSVR_ROOMID,  // def in 'svr_config.js'
  svrUrl: "ws://" + EXT_SIPSVR_IP + ":" + EXT_SIPSVR_PORT,  //def in 'svr_config.js'

  // Convert data from SIP's format(hackathon format) to VSS format
  // TODO: re-write in better way
  // (first version is ad-hoc lazy implementation)
  // TODO:
  //  - SIPからVSSへのデータ変換。外部にテーブルを定義してそれを元に変換する
  /* 心配事:
    - この関数は、SIP形式のデータをVSS形式のデータの配列に変換する
    - データ項目数が増えると、配列の要素数が増える
    - 想定最大データ項目数は cartomo=30 + senso=61 = 91
    - 全部のデータが揃って一度に来る場合はほぼ無い
    - 発生頻度が非常に低いデータも結構ある
    - データ間引くことも可能(0.5sec単位とか)
    - このnodeアプリAWS上で稼働。1プロセスで全利用者の処理をさばく
  */

  // SIP形式PathをVSS形式に置き換えるためのHash
  // ただし、SIP形式のPathと言っても、Zoneの部分を無理やりPathに入れ込む一時対応をしてある
  // TODO: 本来はこういう部分は外部ファイルからのロードにしたい
  convertHash : {
    // == Vehicle Data ==
     'Smartphone.Gps.LocationInf.latitude'        : 'Signal.Cabin.Infortainment.Navigation.Currentlocation.Latitude'    //lat
    ,'Smartphone.Gps.LocationInf.longitude'       : 'Signal.Cabin.Infortainment.Navigation.Currentlocation.Longitude'   //lng
    ,'Smartphone.Gps.LocationInf.altitude'        : 'Signal.Cabin.Infortainment.Navigation.Currentlocation.Altitude'    //alt
    ,'Smartphone.Gps.LocationInf.heading'         : 'Signal.Cabin.Infortainment.Navigation.Currentlocation.Heading'     //head
    ,'Smartphone.Gps.LocationInf.speed'           : 'Signal.Cabin.Infortainment.Navigation.Currentlocation.Speed'       //speed
    ,'Vehicle.RunningStatus.VehicleSpeed.speed'   : 'Signal.Drivetrain.Transmission.Speed'
    ,'Vehicle.RunningStatus.EngineSpeed.speed'    : 'Signal.Drivetrain.InternalCombustionEngine.RPM'
    ,'Vehicle.RunningStatus.SteeringWheel.angle'  : 'Signal.Chassis.SteeringWheel.Angle'
    ,'Vehicle.RunningStatus.AcceleratorPedalPosition.value'     :'Signal.Chassis.Accelerator.PedalPosition' //AccelPedal
    ,'Vehicle.RunningStatus.BrakeOperation.brakePedalDepressed' :'Signal.Chassis.Brake.PedalPosition'       //BrakePedal
    ,'Vehicle.VisionAndParking.ParkingBrake.status'             :'Signal.Chassis.ParkingBrake.IsEngaged'    //ParkingBrake
    ,'CarAdapter.SensorData.Acceleration.x'       : 'Signal.Vehicle.Acceleration.X'    //Accel-x
    ,'CarAdapter.SensorData.Acceleration.y'       : 'Signal.Vehicle.Acceleration.Y'    //Accel-y
    ,'CarAdapter.SensorData.Acceleration.z'       : 'Signal.Vehicle.Acceleration.Z'    //Acdel-z

    ,'CarAdapter.SensorData.Gyro.x'               : 'Signal.Vehicle.Acceleration.Pitch'   //Gyro-x
    ,'CarAdapter.SensorData.Gyro.y'               : 'Signal.Vehicle.Acceleration.Roll'    //Gyro-y
    ,'CarAdapter.SensorData.Gyro.z'               : 'Signal.Vehicle.Acceleration.Yaw'     //Gyro-z

    ,'Vehicle.RunningStatus.Transmission.mode'        :'Signal.Drivetrain.Transmission.Gear'              //Gear
    ,'Vehicle.RunningStatus.Fuel.Level'               :'Signal.Drivetrain.FuelSystem.Level'               //FuelLevel
    ,'Vehicle.RunningStatus.Fuel.instantConsumption'  :'Signal.Drivetrain.FuelSystem.instantConsumption'  //instantFuelConsum
    //,'Vehicle.RunningStatus.VehiclePowerModetype.value' :'??'  //VehiclePowerMode e.g. 'running'
    ,'Vehicle.Maintainance.Odometer.distanceTotal'    :'Signal.OBD.DistanceWithMIL'             //distanceTotal
    ,'Vehicle.DrivingSafety.Door.Front.Right.status'  :'Signal.Cabin.Door.Row1.Right.IsOpen'    //Door(f-r)     //Zone項目
    ,'Vehicle.DrivingSafety.Door.Front.Left.status'   :'Signal.Cabin.Door.Row1.Left.IsOpen'     //Door(f-l)     //Zone項目
    ,'Vehicle.DrivintSafety.Seat.Front.Right.seatbelt':'Signal.Cabin.Seat.Row1.Pos1.IsBelted'   //Seatbelt(f-r) //Zone項目

    //,'Vehicle.DrivingSafety.Seat.Front.Right.identificationType'    :''   //不使用
    //,'Vehicle.DrivingSafety.Seat.Front.Right.occupantName'          :''
    //,'Vehicle.DrivingSafety.Seat.Front.Right.occupant'              :''

    ,'Vehicle.RunningStatus.LightStatus.head'     :'Signal.Body.Light.IsLowBeamOn'  //HeadLight
    ,'Vehicle.RunningStatus.LightStatus.highbeam' :'Signal.Body.Light.IsLowBeamOn'  //HeadLight
    ,'Vehicle.RunningStatus.LightStatus.brake'    :'Signal.Body.Light.IsBrakeOn'    //BrakeLight
    ,'Vehicle.RunningStatus.LightStatus.parking'  :'Signal.Body.Light.IsParkingOn'  //ParkingLight

    // == ika kisai more ? ==

    //,'Vehicle.Climate.Temperature.interiorTemperature':''   //旧データに存在するが使用せず、h2018データ用項目とする
    //,'Vehicle.RunningStatus.Acceleration.x'  //こちらはなんだったか？いずれにしても不使用
    //,'Vehicle.RunningStatus.Acceleration.y'
    //,'Vehicle.RunningStatus.Acceleration.z'
    //,'Vehicle.RunningStatus.EngineCoolant.temperature'

    // == Sensor 2017 ==
    // = vital =
    //,'Sensor.Vital.Data.beat'     // NoUse: heartrate
    //,'Sensor.Vital.Data.cluster'  // NoUse: emotion
    // = JINS MEME =
    /*
    'Sensor.Meme.Raw.eMvU'    // NoUse: eyeMoveUp
    'Sensor.Meme.Raw.eMvD'    // NoUse: eyeMoveDown
    'Sensor.Meme.Raw.eMvR'    // NoUse: eyeMoveRight
    'Sensor.Meme.Raw.eMvL'    // NoUse: eyeMoveLeft
    'Sensor.Meme.Raw.blkSp'    // NoUse: blinkSpeed
    'Sensor.Meme.Raw.blkSt'    // NoUse: blinkStrength
    'Sensor.Meme.Raw.pch'    // NoUse: pitch
    'Sensor.Meme.Raw.rol'    // NoUse: roll
    'Sensor.Meme.Raw.yaw'    // NoUse: yaw
    'Sensor.Meme.Raw.acX'    // NoUse: accX
    'Sensor.Meme.Raw.acY'    // NoUse: accY
    'Sensor.Meme.Raw.acZ'    // NoUse: accZ
    // NoUse: tilt
    */

    // == Sensor 2018 ==
    // TODO: 以下に追加していく
    // = JINS
    ,'Sensor.Meme.Proc.awk': 'Private.Signal.Driver.Awakeness'// driver awakeness
    ,'Sensor.Meme.Proc.att': 'Private.Signal.Driver.Attentiveness'// driver attentiveness
    ,'Sensor.Meme.Proc.awk_pas': 'Private.Signal.Passenger.Awakeness'// driver awakeness
    ,'Sensor.Meme.Proc.att_pas': 'Private.Signal.Passenger.Attentiveness'// driver attentiveness
    ,'Sensor.Meme.Proc.awk_bck': 'Private.Signal.Backseat.Awakeness'// driver awakeness
    ,'Sensor.Meme.Proc.att_bck': 'Private.Signal.Backseat.Attentiveness'// driver attentiveness

    // = iPhone/iWatch/Sdtech
    ,'Sensor.Ios.Data.altitude': 'Private.Signal.Driver.Altitude' // Altitude of driver device
    ,'Sensor.Ios.Data.atompressure': 'Signal.OBD.BarometricPressure'
    // iwatch heartrate
    ,'Sensor.Vital.Data.beat': 'Private.Signal.Driver.Heartrate'
    // sdtech concentrate
    ,'Sensor.Vital.Data.concent': 'Private.Signal.Driver.Concentration'

    // = MESH
    ,'Sensor.Mesh.Data.temperature': 'Signal.Cabin.HVAC.AmbientTemperture'
    ,'Sensor.Mesh.Data.humidity': 'Signal.Cabin.HVAC.AmbientAirTemperature'
    ,'Sensor.Mesh.Data.trunk': 'Signal.Body.Trunk.IsOpen'

    // = Bocco
    ,'Sensor.Bocco.Data.aircon': 'Signal.Cabin.HVAC.IsAirConditioningActive'
    ,'Sensor.Bocco.Data.window': 'Signal.Cabin.Door.Row1.Right.Window.Position'
  },

  // TODO: sipDataSrc と mockDataSrcの使い分けはどうする？
  connectToDataSrc : function(_sessObj) {
    printLog(LOG_DEFAULT , "  :connectToDataSrc");
    printLog(LOG_DEFAULT, "extSIPDataSrc.svrUrl = " + g_extSIPDataSrc.svrUrl);
    // connect to sipDataSrc
    var wsSipDataSrc = sockIoClient.connect(g_extSIPDataSrc.svrUrl);
    _sessObj.wsDataSrc = wsSipDataSrc;  //session Obj に dataSrc向けwsを保存

    // data received from sipDataSrc
    wsSipDataSrc.on("vehicle data", function(sipData) {
      // sipDataSrcからのSIP形式データをVSS形式に変換する
      var vssData = g_extSIPDataSrc.convertFromSIPToVSS(sipData);
      if (vssData != undefined) {
        dataReceiveHandler(_sessObj, vssData);
      }
    });
    // connection to sipDataSrc established !
    wsSipDataSrc.on('connect',function(){
        printLog(LOG_DEFAULT , "  :extSIPDataSrc: on.connect");
        _sessObj.dataSrcConnected = true;
        // Next step is 'joinRoom' after receive roomId from client
    });
  },

  // SIP JSON obj を json objのArrayに変換する。結果データは以下のイメージ
  // resArry = [
  //   {'path':'Vehicle.RunningStatus.Fuel.Level', 'value':'60', 'timestamp':'999999'},
  //   {'path':'Vehicle.RunningStatus.VehicleSpeed.speed', 'value':'60', 'timestamp':'999999'},
  // ]
  convertSIPObjToSIPArry: function(_obj) {
    var resArry = [];

    //再帰で見ていく
    for ( var key in _obj) {
      var path = key;
      findLeaf(key, path, _obj[key]);
    }
    return resArry;

    function findLeaf (_key, _path, _obj) {
      // もし末端に到達したら、末端のobjを返す
      // 末端であるかの判断は'timeStamp'の有無による(多分大丈夫)
      if (_obj.timeStamp) {
        // objがtimeStampを持つので、このobjは末端のLeaf objである
        var ts = _obj.timeStamp;

        // Zone情報があったら、pathに front, right などを追加する
        // e.g. 'Vehicle.DrivingSafety.Door.Front.Left.status'
        // TODO: Zone関連動作 要確認 (Door, Seatbelt程度)
        if (_obj.zone !== undefined) {
          var zone = _obj.zone.value;
          var row = 'Middle';
          var col = 'Center';
          for (var i in zone) {
            if (zone[i] === 'Front' || zone[i] === 'Rear')      row = zone[i];
            else if (zone[i] === 'Right' || zone[i] === 'Left') col = zone[i];
          }
          _path = _path + '.' + row + '.' + col;
        }

        // さらにLeafのObjを個別のproperty毎にばらして配列要素とする
        for ( var key in _obj ) {
          if (key === 'timeStamp') continue;
          if (key === 'zone') continue;
          var path = _path + '.' + key;
          var val = _obj[key];
          var item = {'path':path, 'value':val, 'timestamp':ts};
          resArry.push(item);
        }
      } else if (Object.keys(_obj) < 1) {
        // timeStampがなく、他のkeyも無い場合、空のobjなので何もせず上位に戻る
        return;
      } else {
        // まだ末端でなければ、そのレベルのkeyすべてについて中を見ていく
        for (var key in _obj) {
          var path = _path + '.' + key;
          findLeaf(key, path, _obj[key]);
        }
      }
    }
  },

  // SIP形式の走行データObjを、VSS形式データ項目毎のobjに分割、Hashにまとめる
  convertFromSIPToVSS: function(sipData) {
    /* 処理方法：
      - 1) SIP json obj を SIP jsonのarray に変換
      - 2) SIPのarray を、VSSのHash に変換
    */

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

    // SIP形式のObjを、SIPデータ項目別のObjの配列に変換
    // SIP形式Obj配列の要素はこんなイメージ
    // {'path': 'Vehicle.RunningStatus.VehicleSpeed.speed', 'value':'100', 'timestamp':'9999999999'};
    var sipArry = this.convertSIPObjToSIPArry(sipObj);

    // SIPデータ形式Objの配列 => VSS形式のHashに変換
    // (以降のmatching処理で、ループによる照合の無駄排除のためHash形式にする)
    var arryLen = sipArry.length;
    var vssHash = {};
    for (var i = 0; i < arryLen; i++) {
      console.log("commingPath = " + sipArry[i].path);
      var vssPath = this.convertHash[sipArry[i].path];
      if (vssPath === undefined) continue;
      var item = {'path'      : vssPath,
                  'value'     : sipArry[i].value,
                  'timestamp' : sipArry[i].timestamp};
      // ArrayでなくHashにする。Pathがキー
      vssHash[vssPath] = item;
    }

    var len = Object.keys(vssHash).length;
    if (len > 1) {
      var obj = {'action':'data', "data": vssHash};
      var vssStr = JSON.stringify(obj);
      return vssStr;
    } else {
      return undefined;
    }
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

// [ urata ] : clientからのconnect受付部分
// - clientが接続に来たときに、dataSrcへの接続が失敗した場合は
//   sessionの情報は残す？=> 残さない。clientには接続失敗と通知、
//   その場合、vissvrとのconnectionは、disconenct状態にする
// - clientは vissvrへのconn/disconnは自由に可能。
// - clientは、一度disconnして、roomIDを変更して再接続することも可能
// - ただし接続手順は普通、hkServer側で、roomIDを登録して起動、
//   あとからclient側でroomIDを指定して接続に行く
// - clientを先に起動しておいて、後からhkserverでroomIDを指定して起動すると
//   待っていたclientのconnectionが繋がる、という手順は多分やらない。
// - それ以外の順序は、考慮してもあまり意味がない
//
// - sipDataSrc に roomIDを通知するタイミングは？
//   => connectあと、client から joinRoom actionを受け取った時
//
vissvr.on('connection', function(_wsCli) {
  // userAppから接続された

  // session情報の作成、格納
  var _sessId = createNewSessID();
  var _reqTable = new ReqTable();
  var _authHash = new AuthHash();

  printLog(LOG_DEFAULT,"  :wsCli.on:connection: sessId= " + _sessId);

  // store sessID, reqTable, _wsCli in a global hash
  var _sessObj = {'wsClient': _wsCli, 'reqTable': _reqTable, 'authHash': _authHash
                 // added for h2018
                 ,'wsDataSrc': undefined, 'dataSrcConnected' : false
                 ,'roomId': undefined, 'joined': false};
  g_sessionHash[_sessId] = _sessObj;

  // userAppからの接続された契機で sipDataSrcに接続しに行く
  g_extSIPDataSrc.connectToDataSrc(_sessObj);

  // for connecting to outside data source
  _wsCli.on('message', function(message) {
    var obj;
    try {
      obj = JSON.parse(message);
    } catch (e) {
      printLog(LOG_DEFAULT,"  :received irregular Json messaged. ignored. msg = "+message);
      printLog(LOG_DEFAULT,"  :Error = "+e);
      return;
    }
    printLog(LOG_DEFAULT,"  :wsCli.on:message: obj= " + message);

    // NOTE: assuming 1 message contains only 1 method.
    // for 'get'

    // urata: added for h2018
    if (obj.action === 'joinRoom'
        // if receive 'joinRoom' after already joined, ignore it.
        && _sessObj.joined === false) {

      var rmId = obj.roomId;
      printLog(LOG_QUIET,"  :action:joinRoom: " + rmId);
      _sessObj.roomId = rmId;
      var msg = JSON.stringify({"roomID": rmId, "data":"NOT REQUIRED"});

      // sipDataSrc に roomIdを通知してjoinRoom
      sendJoinRoom(msg);

      function sendJoinRoom(_msg) {
        // client から action:joinRoom が来たときに
        // sipDataSrc との接続が確立している保証がない。
        // - 未接続なら、接続を待つためタイマー発行
        // - 接続済みなら、すぐに sipDataSrcに joinRoom送信
        if (_sessObj.dataSrcConnected === false) {
          printLog(LOG_DEFAULT,"  :sendJoinRoom(): try again later");
          setTimeout( function(){sendJoinRoom(_msg);}, 1000);
        } else {
          printLog(LOG_DEFAULT,"  :sendJoinRoom(): join now!");
          _sessObj.wsDataSrc.emit('joinRoom', _msg);
          // 'joined' フラグを立てる
          //  roomが存在しない可能性もあるが、joinは可能なので true とする
          _sessObj.joined = true;
          printLog(LOG_DEFAULT,"  :--joined!! ");
        }
      }
    }
    // roomに未joinの場合は、clientからのget, subscribeのリクエスト来てもスルー
    if (_sessObj.joined === false) {
      printLog(LOG_DEFAULT,"  :Not yet joined to room of HackathonServer");
      printLog(LOG_DEFAULT,"  :wsCli.on:message: obj= " + message);
      return;
    }

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
        _wsCli.send(JSON.stringify(resObj));
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
      _wsCli.send(JSON.stringify(resObj));

    } else if (obj.action === "getMetadata") {
      // - VSS json is retrieved from dataSrc
      // TODO:
      // - how to extract sub-tree by 'path'? extract in VISS or dataSrc side?
      var reqId = obj.requestId;
      var path = obj.path;
      var ret = _reqTable.addReqToTable(obj, null, null);
      g_extMockDataSrc.sendVSSRequest(obj, reqId, _sessId);
      printLog(LOG_VERBOSE,"  :getMetadata request registered. reqId=" + reqId + ", path=" + path);

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
      _wsCli.send(JSON.stringify(resObj));

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
      _wsCli.send(JSON.stringify(resObj));

    } else if (obj.action === "unsubscribeAll") {
      for (var i in _reqTable.subIdHash) {
        var reqId = _reqTable.subIdHash[i];
        delete _reqTable.requestHash[reqId];
        delete _reqTable.subIdHash[i];
      }
      printLog(LOG_DEFAULT,"  :Success to unsubscribe all subscription.");

      var timestamp = new Date().getTime().toString(10);
      resObj = createUnsubscribeAllSuccessResponse(obj.action, obj.requestId, timestamp);
      _wsCli.send(JSON.stringify(resObj));

    } else {
      //Do nothing
    }
  });

  // clientとの接続closeイベント
  // - dataSrc への接続をcloseする
  // - requestは全部クリアする
  // TODO:
  // - sipDataSrcとの接続が意図せずcloseした場合、clientとの接続もcloseするべき
  _wsCli.on('close', function() {
    printLog(LOG_QUIET,'  :wsCli.on:closed');

    // delete a session
    var sess = g_sessionHash[_sessId];
    sess.wsClient = null;
    sess.wsDataSrc.disconnect(); // sipDataSrc との接続をcloseする
    _reqTable.clearReqTable();

    delete sess.reqTable;
    delete sess.authHash;
    delete g_sessionHash[_sessId];
  });
});

// Handle data received from data source
function dataReceiveHandler(_sessObj, _msg) {
  var obj;
  try {
    obj = JSON.parse(_msg);
  } catch(e) {
    //irregurlar Json case
    printLog(LOG_QUIET,"  :received irregular Json message. ignored. msg : "+_msg);
    printLog(LOG_QUIET,"  :Error = "+e);
    return;
  }
  //console.log("dataReceiveHandler data= " + _msg.substr(0,500));

  var dataObj = null;
  var setObj  = null;
  var vssObj  = null;
  if (obj.action === "data") {
    dataObj = obj.data;
  } else if (obj.action === "set") {
    setObj = obj.data; //TODO: sync with acs vehicle data I/F document
  } else if (obj.action === "getMetadata") {
    vssObj = obj.data;
  } else {
    // irregular data. exit
    return;
  }

  var resObj;
  var matchObj;
  var retObj, reqObj;

  // if 'getMetadata' or 'set' response exists..
  if (vssObj || setObj) {
    //printLog(LOG_DEFAULT,"  :getMetadata msg=" + JSON.stringify(vssObj).substr(0,200));

    //[TODO] vssObj setObj 両方あるケースはなかったか？
    var _dataSrcReqId = null;
    if (vssObj) {
      _dataSrcReqId = vssObj.requestId;
    } else {
      _dataSrcReqId = setObj.requestId;
    }

    do { // for exitting by 'break'

      // ここは extMockDataSrc専用コードになっている
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
      var _ws = _sessObj.wsClient;
      var _reqObj = _reqTable.requestHash[_reqId];

      // for getMetadata response
      if (vssObj) {
        if (vssObj.error != undefined) {
          //TODO: test this case
          retObj = createVSSErrorResponse(_reqObj.requestId, vssObj.error);
        } else {
          printLog(LOG_DEFAULT, "  :> > > Entering extractPartialVSS");
          var targetVSS = extractPartialVSS(vssObj.vss, _reqObj.path);
          retObj = createVSSSuccessResponse(_reqObj.requestId, targetVSS);
        }
        printLog(LOG_VERBOSE,"  :getMetadata response="+JSON.stringify(retObj).substr(0,3000));

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
    //printLog(LOG_DEFAULT,"  :dataObj=" + JSON.stringify(dataObj).substr(0,200));

    // TODO:
    //  - h2018向けに、一つのdataSrcからのデータを全Client sessionに行き渡らせる処理を削除した
    //  - sipDataSrc向けにはこれでよいが、mockDataSrc向けにも処理が正しく流れるようにすること
    //  - mockDataSrc向けにもsipDataSrcの場合と同じく、1client sessionが一つのdataSrc接続を
    //    専有するように変更するのがよさそう

    {
      var _reqTable = _sessObj.reqTable;
      var _ws = _sessObj.wsClient;
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
            retObj = createSubscriptionNotificationJson(reqObj.subscriptionId, matchObj.value,
                                                        matchObj.timestamp);

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

// _dataObj: mockDataSrcからのJson Obj
// _reqObj : get, subscribeなどのrequest情報のObj
function matchPathJson (_reqObj, _dataObj) {
  // 流れてくるdataObjの形式が違うため、
  // sipDataSrc向け、mockDataSrc向けで処理を分けた
  if (dataSrc === EXT_SIP_SERVER  ) {
    // getting data from Hackathon Server case
    return matchPathJson_SIPDataSrc(_reqObj, _dataObj);
  } else {
    // getting data from mockDataSrc case
    return matchPathJson_mockDataSrc(_reqObj, _dataObj);
  }
}

function matchPathJson_mockDataSrc(_reqObj, _dataObj) {
  var reqPath = _reqObj.path;
  var arrPath = reqPath.split("."); //一つの文字列であるPathを分割して配列にする
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

// Hackathon Serverからデータを取得した場合
// _dataObj は、VSS 形式のpathを持つ jsonの配列
function matchPathJson_SIPDataSrc(_reqObj, _dataHash) {
  var reqPath = _reqObj.path;
  var obj;
  // sipDataSrcの場合、dataObjがHashになっているので、ループで照合は不要になった
  if (_dataHash[reqPath] !== undefined) {
    obj = _dataHash[reqPath];
    console.log('matchPathJson_Hash: matched!!: obj = ' + JSON.stringify(obj));
    return obj;
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
  // #getMetadataは wildcard 非サポート

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

// == getMetadata ==
function createVSSSuccessResponse(reqId, vss) {
  var retObj = {"action": "getMetadata", "requestId":reqId, "vss":vss};
  return retObj;
}
function createVSSErrorResponse(reqId, error, timestamp) {
  var retObj = {"action": "getMetadata", "requestId":reqId, "error":error};
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

