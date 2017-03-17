#!/bin/bash

#node mockDataSrc.js &
forever start mockDataSrc.js &

sleep 2s

#node Vsss.js &
forever start Vsss.js &

#http-server -p 8081 -d false &
forever start ./httpsvr_start.js

sleep 2s

ps aux | grep node &

