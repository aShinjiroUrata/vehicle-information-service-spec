
  // ===================
  // == Utility funcs ==
  // ===================
  // to get unique ID to use as requestID
  function getUniqueReqId() {
    // create semi-uniquID (for implementation easyness) as timestamp(milli sec)+random string
    // uniqueness is not 100% guaranteed.
    var strength = 1000;
    var uniq = new Date().getTime().toString(16) + Math.floor(strength*Math.random()).toString(16);
    return "reqid-"+uniq;
  }

  function showInMsgArea(msgText) {
    showInMsgAreaById(msgText, 'msg', 6000);
  }
  function showInMsgAreaById(msgText, id, size_limit) {
    var targ = document.getElementById(id);
    var oldText = targ.innerHTML;
    oldText = oldText.substring(0, size_limit);
    var newText = msgText + "\n" + oldText;
    targ.innerHTML = newText;
  }
  function showGetResMsg(value, targ_id) {
    var targ = document.getElementById(targ_id);
    targ.innerHTML = value;
  }
  function showGetMetadataResMsg(value, action, path) {
    var msgText = action + " : " + path + "\n==> value : "+value;
    showInMsgAreaById(msgText, 'msg_vss', 200);
  }

  function showConnectMsg(msgText) {
    var targ = document.getElementById('msg_connect');
    targ.innerHTML = msgText;
  }
  function clearMsgArea() {
    var targ = document.getElementById('msg');
    targ.innerHTML = "";
  }
  function clearVssMsgArea() {
    var targ = document.getElementById('msg_vss');
    targ.innerHTML = "";
  }

  function createPathArry(_vssObj) {
    var root = _vssObj;
    var dbg_depth = 0;
    var pathArry = [];

    Object.keys(root).forEach(function(key) {
      var node = root[key];
      traverse(key, node, '', leafCallback, dbg_depth);
    });

    return pathArry;

    // traverseしてleafに到達したら行う処理
    function leafCallback(_key, _node, _path) {
      var item = {'path':_path, 'node':_node};
      pathArry.push(item);
    }
  }

  // function for traversing VSS object tree
  function traverse(_key, _node, _path, _leafCallback, _depth) {
    var depth = _depth+1;
    var path = _path=='' ? _key : _path+'.'+_key;
    if (_node.type == undefined) {
      return;
    }

    if (_node.type === 'branch') {
      //console.log( Array(depth+1).join('    ')+"branch:" + _key);
      //branch case
      if (_node.children) {
        // children以下の要素についてtraverseを行う
        Object.keys(_node.children).forEach(function(key) {
            var node = _node.children[key];
            traverse(key, node, path, _leafCallback, depth);
            });
      } else {
        //no children. do nothing.
      }
    } else {
      //leaf case
      //console.log( Array(depth+1).join('    ')+"leaf:" + _key);
      _leafCallback(_key, _node, path);
    }
  }

  // get leaf from VSS object tree
  function getLeaf(_dataObj, _path) {
    var pathArry = _path.split(".");
    var obj = _dataObj;
    for (var i=0, len=pathArry.length; i<len; i++) {
      if (obj.children != undefined)
        obj = obj.children;
      if (obj[pathArry[i]] != undefined) {
        obj = obj[pathArry[i]];
      } else {
        // this case should not exist
        return undefined;
      }
    }
    return obj;
  }

