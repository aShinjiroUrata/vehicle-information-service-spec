#!/bin/bash

pgrep -f 'http-server' | xargs kill &
pgrep -f 'visSvr' | xargs kill &
pgrep -f 'mockData' | xargs kill &
pgrep -f 'httpsvr_start' | xargs kill &

echo -e "\n"

sleep 1s

ps aux | grep node &

