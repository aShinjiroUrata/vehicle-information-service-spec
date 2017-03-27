# vehicle-information-service-spec prototype README
last update: March 22, 2017 

W3C Automotive WG Vehicle Information Service Specification<br>
prototype implementation by ACCESS

#### Tested with:
* ubuntu14.04 LTS
* node v7.3.0  / npm 3.10.10 #older version should work but not tested
* ws v2.0.3 or newer #necessary for using sub-protocol

#### To use:

0.Prerequiste
- Install node v7.3.0
- Install npm v3.10.10

1.Clone
```
git clone https://github.com/aShinjiroUrata/vehicle-information-service-spec.git`
cd vehicle-information-service-spec`
```
2.Install npm packages
```
$npm install fs http ws websocket socket.io socket.io-client
$npm install -g http-server forever
```
3.Edit `svr_config.js`
- Default IP address for VISS prototype is '127.0.0.1'. <br>
  Change the IP address by modifying `VISS_IP` in case you need (such as you put VISS on public internet).<br>
- Default IP address for mockDataSrc is '127.0.0.1'.<br>
  Change the IP address by modifying `DATASRC_IP` in case you need.<br>
  As default, should be same with `VISS_IP`.<br>
  If mockDataSrc.js or other data source resides in a different server, use its IP.<br>
- Update port number if necessary.<br>
  In default setting, below port numbers will be used.<br>
   ```
   - VISS server port number: VISS_PORT = 3000 @svr_config.js
   - mockDataSrc.js port number: DATASRC_PORT = 3001 @svr_config.js
   - http server port number: 8081 @start.sh
   ```
  If any of these are already occupied, please change to available port number<br>

4.start VISS server
```
$./start.sh`
```
(This script starts 'mock data source', 'VISS server', 'http-server'.)

5.Open test-ui WebApp by browser with below url
```
http://{VISS_IP}:8081/test-ui.html
```
6.stop VISS server, mock data source server, node's web server
```
$./stop.sh
```

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
* `*` wildcard path in `get` method
* `filter` in `subscribe` method
* Specifying path in `getVSS` method
* Data point's access control by `authorize` method
* when error occurred, returning adequate error code
* wss:// scheme not supported

