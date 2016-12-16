# vehicle-signal-server-spec

w3c automotive vehicle signal erver specification prototype

Vehicle Signal Server Specification prototype implementation

Tested with:
* node v4.5.0  / npm 2.15.9
* node v0.12.9 / npm 2.14.9

To use:

1.Install packages
- $npm install fs http ws websocket socket.io socket.io-client

2.Edit Vsss.js code
- Vsss.js is prototype implementation of VSSS server
- edit Vsss's IP address by change VsssIP value.(change port if you like)
- select data source to connect
  - LOCAL_MOCK_DATA : to use hard coded data source driven by timer
  - EXT_MOCK_SERVER : to use external websocket mock server 'mockDataSrc.js'
  - EXT_SIP_SERVER  : to use websocket server which hosts actual vehicle data
                      developed for SIP hackathon.

3.If EXT_MOCK_SERVER data source is selected, start external mock data source
- edit IP, port in mockDataSrc.js to match with Vsss.js
- $node mockDataSrc.js

4.If EXT_SIP_SERVER data source is selected, start SIP hackathon server
- Open SIP hackathon server app by google chrome (#URL is not public)
- enter roomID='room01' and submit
- select drive data and start to play the data

5.Start Vehicle Signal Server
- $node Vsss.js

6.Open client app by browser via url= http://{VsssIP}:{HttpSvrPort}
  e.g. http://xx.xx.xx.xx:3000/
