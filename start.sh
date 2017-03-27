#!/bin/bash

forever start mockDataSrc.js &

sleep 2s

forever start  visSvr.js &

forever start ./httpsvr_start.js

sleep 2s

ps aux | grep node &

