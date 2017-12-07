// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// == Config VIS Server IP and Port Number here ==
// For NAT using servers, separate IP to public and private
var VISS_IP_PUB = '127.0.0.1';  // used from test-ui.html
var VISS_IP_PRV = '127.0.0.1';  // used in visSvr.js to start WebSocket server
var VISS_IP = VISS_IP_PUB;

var VISS_PORT = '3000';
var VISS_SUBPROTO = 'wvss1.0';

var DATASRC_IP = '127.0.0.1';
var DATASRC_PORT = '3001';

var TOKEN_VALID = 'token_valid';
var TOKEN_INVALID = 'token_invalid';

try {
  // node require()
  module.exports = {
    VISS_IP   : VISS_IP, // VISS's host IP
    VISS_PORT : VISS_PORT,
    VISS_SUBPROTO : VISS_SUBPROTO,
    DATASRC_IP    : DATASRC_IP,
    DATASRC_PORT  : DATASRC_PORT,
    TOKEN_VALID   : TOKEN_VALID,
    TOKEN_INVALID : TOKEN_INVALID
  }
} catch(e) {

}
