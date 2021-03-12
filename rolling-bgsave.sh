#!/bin/bash

# Check if the 2nd argument was passed. (Seconds in between last save)
echo "[*] Script running .."
out=$(redis-cli -p 6379 -a vhupP*5H*sWent9Uh4-x BGSAVE)
echo "[*] $out"
outSlave=$(redis-cli -p 6380 -a vhupP*5H*sWent9Uh4-x BGSAVE)
echo "[*] $outSlave"
echo "[*] Script runned on background redis .."

# [ -z "$2" ]  && echo "[x] Pass the 'seconds' argument to compare last bgsave." && exit 1

# betweenSeconds=$2
# if [ -n "$1" ]; then
#     lastSave=$(redis-cli -p $1 -a vhupP*5H*sWent9Uh4-x LASTSAVE)
#     lastSaveToTime=$(date -d @$lastSave +"%s")

#     currentTime=$(date +"%s")
#     diff=$(($currentTime - $lastSaveToTime))

#     if [ $diff -gt $betweenSeconds ]; then
#         echo "[*] Script running .."
#         out=$(redis-cli -p $1 -a vhupP*5H*sWent9Uh4-x BGSAVE)
#         echo "[*] $out"
#         echo "[*] Script runned on background redis .."
#     fi
# else
#     echo "[x] Please specify the port to be run."
#     exit 1
# fi