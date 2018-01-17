// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// == Config VIS Server IP and Port Number here ==
// For NAT using servers, separate IP to public and private
// Configure h2018's AWS's Priv/Pub IP address, since this branch is for h2018
// AWS public IP = 52.91.85.165
// AWS privateIP = 172.31.90.184
var VISS_IP_PUB = '52.91.85.165';  // used from test-ui.html
var VISS_IP_PRV = '172.31.90.184';  // used in visSvr.js to start WebSocket server
var VISS_IP = VISS_IP_PUB;

var VISS_PORT     = '3001';
var VISS_SUBPROTO = 'wvss1.0';

// for mockDataSrc
var DATASRC_IP   = '127.0.0.1';
var DATASRC_PORT = '3002';

// for HackathonServer
var HKSV_SRC_IP   = '52.91.85.165';  // used in visSvr.js to start WebSocket server
var HKSV_SRC_PORT = '3000';
var HKSV_ROOMID   = '0100';

// for Authorize method
var TOKEN_VALID   = 'token_valid';
var TOKEN_INVALID = 'token_invalid';

try {
  // node require()
  module.exports = {
    VISS_IP_PUB   : VISS_IP_PUB,
    VISS_IP_PRV   : VISS_IP_PRV,
    VISS_IP       : VISS_IP, // VISS's host IP
    VISS_PORT     : VISS_PORT,
    VISS_SUBPROTO : VISS_SUBPROTO,

    DATASRC_IP    : DATASRC_IP,
    DATASRC_PORT  : DATASRC_PORT,

    HKSV_SRC_IP   : HKSV_SRC_IP,
    HKSV_SRC_PORT : HKSV_SRC_PORT,
    HKSV_ROOMID   : HKSV_ROOMID,

    TOKEN_VALID   : TOKEN_VALID,
    TOKEN_INVALID : TOKEN_INVALID
  }
} catch(e) {

}
