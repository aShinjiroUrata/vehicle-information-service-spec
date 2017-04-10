// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// == Config VIS Server IP and Port Number here ==
//var VISS_IP = '127.0.0.1';
//var VISS_IP = '163.44.169.166';
//var VISS_IP = 'wwwivi';
//var VISS_IP = 'localhost';

//var VISS_PORT = '3000';

// for NewSky
var VISS_IP = 'auto.newskysecurity.com/echoAnnotation';
var VISS_PORT = '443';

var VISS_SUBPROTO = 'wvss1.0';

var DATASRC_IP = '127.0.0.1';
var DATASRC_PORT = '3001';

var TOKEN_VALID = 'token_valid';
var TOKEN_INVALID = 'token_invalid';

//var TLS_KEY = './tls/wwwivi.key';
var TLS_KEY = './tls/selfsigned.key';
//var TLS_CRT = './tls/wwwivi.crt';
var TLS_CRT = './tls/selfsigned.crt';

try {
  // node require()
  module.exports = {
    VISS_IP   : VISS_IP, // VISS's host IP
    VISS_PORT : VISS_PORT,
    VISS_SUBPROTO : VISS_SUBPROTO,
    DATASRC_IP    : DATASRC_IP,
    DATASRC_PORT  : DATASRC_PORT,
    TOKEN_VALID   : TOKEN_VALID,
    TOKEN_INVALID : TOKEN_INVALID,
    TLS_KEY : TLS_KEY,
    TLS_CRT : TLS_CRT
  }
} catch(e) {

}
