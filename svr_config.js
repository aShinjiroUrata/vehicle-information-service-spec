// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// == Config VIS Server IP and Port Number here ==
//var VISS_IP = '10.5.162.79';
//var VISS_IP = '192.168.43.16';
var VISS_IP = '127.0.0.1';
var VISS_PORT = '3000';
var VISS_SUBPROTO = 'wvss1.0';

try {
  // node require()
  module.exports = {
    VISS_IP   : VISS_IP, // VSSS's host IP
    VISS_PORT : VISS_PORT,
    VISS_SUBPROTO : VISS_SUBPROTO
  }
} catch(e) {

}
