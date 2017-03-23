#!/bin/bash

#node mockDataSrc.js &
forever start mockDataSrc.js &

sleep 2s

#node visSvr.js &
forever start  visSvr.js &

#http-server -p 8081 -d false &
forever start ./httpsvr_start.js

sleep 2s

ps aux | grep node &

