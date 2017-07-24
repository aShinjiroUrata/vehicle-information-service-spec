#!/bin/bash

http-server . -p 8081 -d false > log.txt 2>&1 &
echo "local http server started"

forever start ./mockDataSrc.js &
echo "mockDataSrc started"
sleep 2s

forever start  ./visSvr.js &
echo "visSvr started"

sleep 6s

ps aux | grep node &

