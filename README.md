# vehicle-signal-server-spec

#### W3C Automotive WG Vehicle Information Service Specification
#### prototype implementation by access

Tested with:
* ubuntu14.04 LTS
* node v4.5.0  / npm 2.15.9

To use:

1.Install npm packages
- `$npm install fs http ws websocket socket.io socket.io-client http-server`
- or just
- `$npm install`
-  install http-server in global
- `$npm install -g http-server`

2.Edit svr_config.js
- update `VISS_IP` with your server's IP
- update `VISS_PORT` with port no you want to use
- VISS's websocket server opens with this IP and port<br>
  (following port numbers are already in use. please select another one<br>
   3001: mockDataSrc.js<br>
   8000: simple web server)

3.start VISS server
- `$./start.sh`<br>
  (The script starts 'mock data source', 'VISServer', 'node's http-server'.<br>
   node's web server uses port:8000 by default.)

4.Open test-ui app by browser with url = http://{VISS_IP}:8081/test-ui.html

5.stop VISS server, mock data source server, simple web server
- `$./stop.sh`

