#!/usr/bin/env bash
cd /home/lcc_web/web_apps/worshipchords/server
/usr/bin/node watcher.js >> /var/log/lcc/worshipchords.log 2>&1