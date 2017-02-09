// Copyright (c) 2017 ACCESS CO., LTD. All rights reserved.
//
// == Config VIS Server IP and Port Number here ==
var VISS_IP = '10.5.162.71';
var VISS_PORT = '3000';

try {
  // node require()
  module.exports = {
    VISS_IP   : VISS_IP, // VSSS's host IP
    VISS_PORT : VISS_PORT
  }
} catch(e) {

}
