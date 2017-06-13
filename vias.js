// ========================================
// VIAS proto
// ========================================

// シンプルなコンストラクタとして作る
// ES6 class で作成
// private な property は特に作らない。当面は。
// TODO: と思ったが、一般に使ってもらう lib とするには、
// 余計なものを隠蔽することが必要

// ==============================
// == Request Dictionary Class ==
class ReqDict {
  constructor() {
    this.mainDict = {};
    this.cliSubIdDict = {};
    this.svrSubIdDict = {};
  }
  addRequest(_reqId, _obj) {
    this.dbgLog("addRequest: reqId="+ _reqId);
    if (this.mainDict[_reqId] != undefined) {
      this.dgbLog("--:Error: requestId already used. reqId="+ _reqId);
      return false;
    }
    this.mainDict[_reqId] = _obj;
    this.dbgLog("--:EntryNum=" + Object.keys(this.mainDict).length);
    return true;
  }
  deleteRequest(_reqId) {

    this.dbgLog("deleteRequest: reqId="+_reqId);
    if (this.mainDict[_reqId] == undefined)
      return false;
    // delete entry from mainDict
    var svrSubId = this.mainDict[_reqId].svrSubId;
    var cliSubId = this.mainDict[_reqId].cliSubId;
    delete this.mainDict[_reqId];

    // TODO: unsubscribeのエントリは*SubIdDictには登録しない
    // delete entry from *SubIdDict
    if (svrSubId != undefined && this.svrSubIdDict[svrSubId] != undefined)
      delete this.svrSubIdDict[svrSubId];
    if (cliSubId != undefined && this.cliSubIdDict[cliSubId] != undefined)
      delete this.cliSubIdDict[cliSubId];


    this.dbgLog("--:entry deleted. reqId="+_reqId+" ,cliSubId="+cliSubId+" ,svrSubId="+svrSubId);
    return true;
  }
  getRequestByReqId(_reqId) {
    if (this.mainDict[_reqId] == undefined) return false;
    return this.mainDict[_reqId];
  }
  getRequestBySvrSubId(_svrSubId) {
  //getRequestBySubId(_subId) {
    var reqId = this.svrSubIdDict[_svrSubId];
    if (reqId == undefined) return false;
    return this.getRequestByReqId(reqId);
  }
  addCliSubId(_reqId, _cliSubId) {
    this.dbgLog("addCliSubId: reqId="+_reqId+" cliSubId="+_cliSubId);
    // this func is only for 'subscribe' request.
    // should not be used for 'unsubscribe' request, otherwise
    // a subscriptionId may be used twice in hash array.
    if (this.mainDict[_reqId] == undefined) {
      this.dbgLog("--:Error: this requestId entry not exits. reqId="+_reqId);
      return false;
    }
    if (this.cliSubIdDict[_cliSubId] != undefined) {
      this.dbgLog("--:Error: this subscriptionId already used. subId="+_svrSubId);
      return false;
    }
    //this.mainDict[_reqId].cliSubId = _cliSubId;
    this.cliSubIdDict[_cliSubId] = _reqId; // for cross reference.
    return true;
  }
  addSvrSubId(_reqId, _svrSubId) {

    this.dbgLog("addSvrSubId: reqId="+_reqId+" svrSubId="+_svrSubId);
    // this func is only for 'subscribe' request.
    // should not be used for 'unsubscribe' request, otherwise
    // a subscriptionId may be used twice in hash array.
    if (this.mainDict[_reqId] == undefined) {
      this.dbgLog("--:Error: this requestId entry not exits. reqId="+_reqId);
      return false;
    }
    if (this.svrSubIdDict[_svrSubId] != undefined) {
      this.dbgLog("--:Error: this subscriptionId already used. subId="+_svrSubId);
      return false;
    }
    this.mainDict[_reqId].svrSubId = _svrSubId;
    this.svrSubIdDict[_svrSubId] = _reqId; // for cross reference.
    return true;

  }
  convertSvrSubIdToReqId(_subId) {
    //TODO
  }
  convertReqIdToSvrSubId(_reqId) {
    //TODO

  }
  convertCliSubIdToSvrSubId(_cliSubId) {
    //TODOTODO
    var reqId = this.cliSubIdDict[_cliSubId];
    var reqObj = this.mainDict[reqId];
    var svrSubId = reqObj.svrSubId;
    return svrSubId;
  }
  dbgLog(_msg) {
    //console.log("[VIAS:ReqDict]:"+_msg);
  }
}

// =======================
// == VISClient Class   ==
// == (= Core of VIAS ) ==
// =======================
class VISClient {

  // == public functions
  constructor(_viscOption){
    // const
    this.WS_CONNECTING = 0;
    this.WS_OPEN       = 1;
    this.WS_CLOSING    = 2;
    this.WS_CLOSED     = 3;
    this.SUBPROTOCOL = "wvss1.0";

    // important object
    this.g_reqDict = new ReqDict();

    // プロパティ初期化
    this.host = _viscOption.host;
    this.protocol = _viscOption.protocol;
    this.port = _viscOption.port;

    this.connection = null;

  }
  // public
  connect(_sucCb, _errCb) {
    // connect no shippai case toha?

    // WebSocket接続を確立
    var url = this.protocol + this.host + ':' + this.port;
    this.connection = new WebSocket(url, this.SUBPROTOCOL);
    // 成功したら _sucCbで通知(何を？
    //this.connection.onopen = function() {this.onOpen(_sucCb);};
    this.connection.onopen    = () =>       {this.onWsOpen   (this, _sucCb);};
    this.connection.onclose   = () =>       {this.onWsClose  (this);};
    //this.connection.onmessage = function(_event) { this.onWsMessage(this, _event); }
    this.connection.onmessage = (_event) => {this.onWsMessage(this, _event);}
    //this.connection.onerror = function() {this.onError(_errCb)};
    this.connection.onerror   = () =>       {this.onWsError  (this, _errCb)};

  }
  // public
  get(_path, _sucCb, _errCb) {
    this.dbgLog("get: path=" + _path);
    if (this.connection == null || this.connection.readyState != this.WS_OPEN) {
      // TODO: エラーを返す
      return;
    }

    // get用JSONを作成
    var reqId = this.issueNewReqId();
    var req = {"action": "get", "path": _path, "requestId":reqId};

    // sucCb, errCb, reqIdはハッシュに登録しておく
    var obj = {"reqObj": req, "sucCb": _sucCb, "errCb": _errCb};
    this.g_reqDict.addRequest(reqId, obj);

    // ws で送付
    var json_str = JSON.stringify(req);
    this.connection.send(json_str);

    //showInMsgArea("--: ==> " + json_str);
    this.dbgLog("--: ==> " + json_str);
  }
  // public
  subscribe(_path, _sucCb, _errCb, _filter) {
    this.dbgLog("subscribe: path=" + _path);
    if (this.connection == null || this.connection.readyState != this.WS_OPEN) {
      // TODO: エラーを返す
      return;
    }

    // subscribe用JSONを作成
    var reqId = this.issueNewReqId();
    // 同期的にsubIdを返すため、subIdを2重構造にしてみた
    // 同期で返せる clientSide subId
    // 非同期でVISSから送付される serverSide subId
    // 関連付けて使用すれば困らない想定
    var cliSubId = this.issueNewCliSubId();

    //TODO: filter not supported
    var req ={"action": "subscribe", "path": _path, "filters":"", "requestId":reqId};

    var obj = {"reqObj": req, "sucCb": _sucCb, "errCb":_errCb,
               "cliSubId": cliSubId, "svrSubId":null };
    this.g_reqDict.addRequest(reqId, obj);
    this.g_reqDict.addCliSubId(reqId, cliSubId);

    var json_str = JSON.stringify(req);
    this.connection.send(json_str);
    this.dbgLog("--: ==> " + json_str);

    // 同期的に仮のsubIdを返す
    return cliSubId;

    // このあとの流れ：
    // VISSから、subscribeSuccessResponse jsonとして、serverSide subIdが届く
    //   => clientSide subId と関連づけられるように、reqDictに格納
    // VISSから、subscriptionNotification として、pathの値が届く
    //   => serverSide subId付きで届くので、clientSide subIdに変換して
    //      呼び出し元の success Callback で通知

  }
  // public
  unsubscribe(_cliSubId, _sucCb, _errCb) {

    this.dbgLog("unsubscribe: cliSubId=" + _cliSubId);
    if (this.connection == null || this.connection.readyState != this.WS_OPEN) {
      // TODO: エラーを返す
      return;
    }

    var reqId = this.issueNewReqId(); //reqIdはunsub用に新しいものを使用
    var svrSubId = this.g_reqDict.convertCliSubIdToSvrSubId(_cliSubId);
    this.dbgLog("unsubscribe: svrSubId=" + svrSubId);

    // VISS に送付する、unsubscribeRequest json を作る
    var req = {"action": "unsubscribe", "requestId":reqId, "subscriptionId":svrSubId};
    var obj = {"reqObj": req, "sucCb": _sucCb, "errCb":_errCb,
               "cliSubId": _cliSubId, "svrSubId": svrSubId };
    // unsubscribe は、逆引き用の *SubIdDict に登録しない
    // というのは、svrSubIdはすでに登録済みなので、ダブってしまうと逆引きできなくなるので

    // reqDictに登録する
    this.g_reqDict.addRequest(reqId, obj);
    var json_str = JSON.stringify(req);
    this.connection.send(json_str);

    this.dbgLog("--: ==> " + json_str);

  }

  // == (should be) private functions

  // ===================
  // == Event handler ==
  // WebSocket用ハンドラ
  onWsOpen(_thiz, _sucCb) {
    this.dbgLog("onOpen");
    _sucCb('websocket connected');
  }
  onWsClose(_thiz) {
    this.dbgLog("onClose");
  }
  onWsMessage(_thiz, _event) {
    this.dbgLog("onMessage");
    _thiz.handleWsMessage(_event);
  }
  onWsError(_thiz, _errCb) {
    //TODO: how to get error detail?
    this.dbgLog("onError");
    _errCb('error occurred.');
  }

  // ========================
  // == WS message handler ==

  // Main process to handle message from WebSocket
  handleWsMessage(_event) {
    this.dbgLog("handleWsMessage: event.data="+_event.data);
    var msg;
    try {
      msg = JSON.parse(_event.data);
    } catch(e) {
      //showInMsgArea("Irregular Json received. Ignore.");
      dbgLog("Irregular Json received. Ignore.");
      return;
    }

    //var reqTableItem=null, reqObj=null, action=null, reqId=null, subId=null;
    var reqDictItem=null, reqObj=null;
    var sucCb=null, errCb=null;
    var action=null, reqId=null, svrSubId=null, cliSubId=null;
    if (msg.requestId != undefined) {
      reqId = msg.requestId;
      reqDictItem = this.g_reqDict.getRequestByReqId(reqId);
    } else if (msg.subscriptionId != undefined) {
      //reqIdなし、subIdあり＝subscribe notification の場合
      svrSubId = msg.subscriptionId;
      reqDictItem = this.g_reqDict.getRequestBySvrSubId(svrSubId);
    }
    reqObj = reqDictItem.reqObj;
    sucCb = reqDictItem.sucCb;
    errCb = reqDictItem.errCb;

    if (reqObj)
      action = reqObj.action;

    // case of 'get'
    if (action === "get") {
      if (this.isGetSuccessResponse(msg)) {
        this.dbgLog("Get: response success");
        // get のsuccess では value のみ返す
        sucCb(msg.value);
        //if (reqTableItem.dispId === 'msg_vss')
        //  showGetVssResMsg(msg.value, reqObj.action, reqObj.path);
        //else
        //  showGetResMsg(msg.value, reqTableItem.dispId)

      } else if (this.isGetErrorResponse(msg)) {
        this.dbgLog("Get: response fail");
        errCb(msg.error);
        //showInMsgArea("--: <== 'get' request was rejected");
      }
      // delete request from requestHash. delete even in error case
      this.g_reqDict.deleteRequest(reqId);

    // case of 'set'
    } else if (action === "set") {
    } else if (action === "subscribe") {
      // subId 通知の場合
      if (this.isSubscribeSuccessResponse(msg)) {
        // VISS発行のsubId を Dictに格納する
        this.g_reqDict.addSvrSubId(msg.requestId, msg.subscriptionId);

      } else if (this.isSubscribeErrorResponse(msg)) {
        this.dbgLog("--: <== 'subscribe' request was rejected");
        errCb(msg.error.number);
        this.g_reqDict.deleteRequest(msg.requestId);

      // value 通知の場合
      } else if (this.isSubscriptionNotification(msg)) {
        // case of subscribeNotification

        // callbackで通知
        this.dbgLog("Subscribe: notification success: val= " + msg.value);
        sucCb(msg.value);

        //if (reqDictItem.dispId === 'msg_vss')
        //  showGetVssResMsg(msg.value, reqObj.action, reqObj.path);
        //else
        //  showGetResMsg(msg.value, reqTableItem.dispId)

      } else if (isSubscriptionNotificationError(msg)) {
        // noting to do special here. continue subscribe.
        // callbackで通知
        this.dbgLog("Subscribe: notification fail" + msg.error.number);
        errCb(msg.error);

      }

    // TODO: subscriptionNotification は action=='subscription' になったらしい
    } else if (action === "subscription") {
      //       VISS は未対応なので、まだ使わない。

    } else if (action === "unsubscribe") {
      this.dbgLog("WsMsg:unSubscribe: received");
      // TODOTODO:


      // TODO:
      // unsubscribe responseをVISSから受け取った場合

      // 失敗ケース
      //  unsub request を reqDict から削除　
      if (msg.error != undefined) {
        this.dbgLog("WsMsg:unSubscribe: fail: err="+ msg.error.number);
        // unsubscribe failed
        // - delete unsubscribe request from requestTable
        this.g_reqDict.deleteRequest(reqId);

      // 成功ケース
      //  sub request を reqDictから削除
      //  unsub request を reqDict から削除　
      } else {
        this.dbgLog("WsMsg:unSubscribe: success: svrSubId="+ msg.subscriptionId);
        // unsubscribe success
        // - delete subscribe request from requestTable
        // - delete unsubscribe request from requestTable

        //var reqId = msg.requestId;
        var targ_svrSubId = msg.subscriptionId; //unsub対象のsubscribeのsubId
        var targ_reqId = this.g_reqDict.convertSvrSubIdToReqId(targ_svrSubId); //subscribeのreqId

        this.g_reqDict.deleteRequest(targ_reqId); // delete subscribe's entry in reqTable
        this.g_reqDict.deleteRequest(reqId);      // delete unsub's entry in reqTable
      }




    }

  }

  // ======================
  // == helper functions ==
  // == get helper
  isGetSuccessResponse(msg) {
    // This is getSuccessResponse if ...
    // must exist    : action, requestId, value, timestamp
    // must not exist: error
    if (msg.action === "get" && msg.requestId != undefined && 
        msg.value  != undefined && msg.timestamp != undefined &&
        msg.error == undefined)
      return true;
    else
      return false;
  }
  isGetErrorResponse(msg) {
    // This is getErrorResponse if ...
    // must exist    : action, requestId, error, timestamp
    // must not exist: value
    if (msg.action === 'get' && msg.requestId != undefined && 
        msg.error != undefined && msg.timestamp != undefined && 
        msg.value == undefined)
      return true;
    else
      return false;
  }

  // == subscribe helper
  // TODO: better to verify with json shema?
  isSubscribeSuccessResponse(msg) {
    // This is subscribeSuccessResponse if ...
    // must exist    : (action), requestId, subscriptionId, (timestamp)
    // must not exist: error, value
    if (msg.action === "subscribe" && msg.requestId != undefined && msg.subscriptionId != undefined &&
        msg.error == undefined && msg.value == undefined)
      return true;
    else
      return false;
  }
  isSubscribeErrorResponse(msg) {
    // This is subscribeErrorResponse if ...
    // must exist    : (path), requestId, error,(timestamp)
    // must not exist: (action), subscriptionId, value
    if (msg.path != undefined && msg.requestId != undefined && msg.error != undefined && 
        msg.action == undefined && msg.subscriptionId == undefined && msg.value == undefined)
      return true;
    else
      return false;

  }
  isSubscriptionNotification(msg) {
    // This is subscriptionNotification if ..
    // must exist    : subscriptionId, (path), value, (timestamp)
    // must not exist: error, (requestId), (action)
    if (msg.subscriptionId != undefined && msg.value != undefined &&
        msg.error == undefined)
      return true;
    else
      return false;
  }
  isSubscriptionNotificationError(msg) {
    // This is subscriptionNotificationError if ..
    // following members exist    : subscriptionId, (path), error, (filters), (timestamp)
    // following members not exist: value, (requestId), (action)
    if (msg.subscriptionId != undefined && msg.error != undefined &&
        msg.value == undefined)
      return true;
    else
      return false;
  }



  // ======================
  // == Utility function ==
  //TODO よりちゃんとしたuniqueIDにしたい
  issueNewReqId() {
    // create semi-uniquID (for implementation easyness) as timestamp(milli sec)+random string
    // uniqueness is not 100% guaranteed.
    var strength = 1000;
    var uniq = new Date().getTime().toString(16) + Math.floor(strength*Math.random()).toString(16);
    return "reqid-"+uniq;
  }
  issueNewCliSubId() {
    // create semi-uniquID (for implementation easyness) as timestamp(milli sec)+random string
    // uniqueness is not 100% guaranteed.
    var strength = 1000;
    var uniq = new Date().getTime().toString(16) + Math.floor(strength*Math.random()).toString(16);
    return "clisubid-"+uniq;
  }
  dbgLog(_msg) {
    //console.log("[VIAS]:"+_msg);
  }

}

