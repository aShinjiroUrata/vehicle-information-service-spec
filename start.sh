#!/bin/bash

node mockDataSrc.js &

node Vsss.js &

http-server -p 8000 -d false &

