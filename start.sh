#!/bin/bash

http-server . -p 8081 -d false > log.txt 2>&1 &
echo "local http server started"

#forever start ./mockDataSrc.js &
#node ./mockDataSrc.js &
node ./manuDataSrc.js &
echo "manuDataSrc started"
sleep 2s

#forever start  ./visSvr.js &
node ./visSvr.js &
echo "visSvr started"

sleep 6s

ps aux | grep node &

