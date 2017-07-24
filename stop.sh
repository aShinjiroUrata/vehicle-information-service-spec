#!/bin/bash

pgrep -f 'visSvr' | xargs kill
echo "visSvr killed"
#sleep 1s
pgrep -f 'mockData' | xargs kill
echo "mockData killed"
#sleep 1s

#pgrep -f 'httpsvr_start' | xargs kill
#echo "httpsvr_start killed"
#sleep 1s

pgrep -f 'http-server' | xargs kill
echo "http-server killed"

#sleep 1s
#echo -e "\n"

ps aux | grep node &
#echo -e "\n"

