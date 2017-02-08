# vehicle-signal-server-spec

w3c automotive vehicle signal erver specification prototype

Vehicle Signal Server Specification prototype implementation

Tested with:
* node v4.5.0  / npm 2.15.9

To use:

1.Install npm packages
- $npm install fs http ws websocket socket.io socket.io-client http-server
-  or just
- $npm install

2.Edit svr_config.js
- update VISS_IP with your server's IP
- update VISS_PORT with port no you want to use
- VISS's websocket server opens with this IP and port
  #do not used following port since they are already used.
   3001: mockDataSrc.js
   8000: simple web server

3. start VISS server, mock data source server, simple web server
- #web server is opened with port:8000.
- $./start.sh

6.Open client app by browser via url= http://{VISS_IP}:8000

7. stop VISS server, mock data source server, simple web server
- $./stop.sh

