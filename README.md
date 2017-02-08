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
-  install http-server in global
- $npm install -g http-server

2.Edit svr_config.js
- update VISS_IP with your server's IP
- update VISS_PORT with port no you want to use
- VISS's websocket server opens with this IP and port
  #following ports are already in use. please select another port no
   3001: mockDataSrc.js
   8000: simple web server

3. start VISS server
- $./start.sh
- #script starts mock data source server, VIS Server, simple web server

6.Open test-ui app by browser via url= http://{VISS_IP}:8000/test-ui.html

7. stop VISS server, mock data source server, simple web server
- $./stop.sh

