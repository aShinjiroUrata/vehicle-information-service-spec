# vehicle-signal-server-spec
w3c automotive vehicle signal erver specification prototype

Vehicle Signal Server Specification prototype implementation

Tested with:
* node v4.5.0  / npm 2.15.9
* node v0.12.9 / npm 2.14.9

To use:
1.Install packages
  $npm install fs http ws websocket socket.io socket.io-client
2.Edit VSSvr.js code
- edit VSSvr's IP address by change VSSvrIP value.(change port if you like)
- select data source to connect
  - LOCAL_MOCK_DATA : to use hard coded data source driven by timer
  - EXT_MOCK_SERVER : to use external websocket mock server 'mockDataSvr.js'
  - EXT_SIP_SERVER  : to use websocket server which hosts actual vehicle data
                      developed for SIP hackathon.
3.Start Vehicle Signal Server
  $node VSSvr.js
4 Open client app by browser via url= http://{VSSvrIP}:{HttpSvrPort}
5.If EXT_MOCK_SERVER data source is selected, start external mock data source
  (#Edit IP, port in mockDataSvr.js to match with VSSvr.js)
  $node mockDataSrc.js
6.If EXT_SIP_SERVER data source is selected, start SIP hackathon server
- Open SIP hackathon server app by google chrome (#URL is not public)
- enter roomID='room01' and submit
- select drive data and start to play the data

