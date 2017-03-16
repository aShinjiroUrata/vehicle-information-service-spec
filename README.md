# vehicle-signal-server-spec

W3C Automotive WG Vehicle Information Service Specification<br>
prototype implementation by ACCESS

#### Tested with:
* ubuntu14.04 LTS
* node v7.3.0  / npm 3.10.10
* ws v2.0.3 or newer #necessary for sub-protocol

#### To use:

0.Prerequiste
- Install node v7.3.0
- Install npm v3.10.10

1.Clone
- `git clone https://github.com/aShinjiroUrata/vehicle-signal-server-spec.git`
- `cd vehicle-signal-server-spec`

2.Install npm packages
- `$npm install fs http ws websocket socket.io socket.io-client`
- `$npm install -g http-server`

3.Edit `svr_config.js`
- (mandatory) update `VISS_IP` with your host's IP 
- (mandatory) update `DATASRC_IP` with your host's IP.<br>
  (If mockDataSrc.js or other data source resides in a different server, use its IP.)  
- if necessary, update `VISS_PORT` with port No not yet in use
- if necessary, update `DATASRC_PORT` with port No not yet in use
  (In default setting, below port No will be used.<br>
   If these port No are not available, you should change port number<br>
   3000: VISS server<br>
   3001: mockDataSrc.js<br>
   8081: http-server)

4.start VISS server
- `$./start.sh`<br>
  (The script starts 'mock data source', 'VISS server', 'http-server'.)

5.Open test-ui app by browser with url = http://{VISS_IP}:8081/test-ui.html

6.stop VISS server, mock data source server, node's web server
- `$./stop.sh`

#### Support status

##### Support:
* get method basic function
* set method basic function
* subscribe method basic function
* unsubscribe method
* unsubuscribeAll method
* authorize method basic function
* getVSS method basic function
* use from multiple client

##### Not support:
* `*` wildcard path in `Get` method
* `filter` in `subscribe` method
* Specifying path in `getVSS` method
* Data point's access control by `authorize` method
* when error occurred, returning adequate error code
* wss:// scheme not supported

