## INPLAY/PREMATCH SERVER
***
## Repo:
https://bitbucket.vavasoftware.com/scm/rby/sports-socket.git

***
## Services on Node Server:

**inplay-pub.service**
- PHP Application the push data to redis (on the same repo above named rmq-feeder) 
- OZ , LSPORT Supported

**inplay-sub.service**

- **NodeJS (Bull Queues, Socket, Express)**, parsed data from redis using **brpoplpush** method. (lm.queues)
- Dashboards - dashmode.mydicegame.net/main and /sub
- configurations - can be tweaked based on server specs. 
   - 2 concurrency per worker 15 jobs per worker. (fixture, livescore, markets)
   - See [config](app/config.json)

**prematch-pub.service**
- PHP Application the push data to redis (on the same repo above named rmq-feeder) 
- OZ , LSPORT Supported

**prematch-pub.service**

- **NodeJS (Bull Queues, Express)**, parsed data from redis using **brpoplpush** method. (pm.queues)
- Dashboards - dashmode.mydicegame.net/main and /sub
- No socket server. Redis saving only.
- configurations - can be tweaked based on server specs. 
   - 2 concurrency per worker 15 jobs per worker. (fixture, livescore, markets)
   - See [config](prematch/config.json)

***
## Redis
Restarting redis. 
```bash
sudo /etc/init.d/redis-server restart
```
Master and Slave Replication, master used port 6379 slave uses port 6380
by default entering redis-cli will go to master. passing port 6380 will enter you to slave. (READ ONLY)
   - redis-cli -p 6380 to enter redis slave. you need to run:
```bash
redis-server /etc/redis/redis_slave.conf
```

## Redis - Rolling BGSAVE
There is a bash script that runs every 12 hours - 4 am PH Time. that creates dump of data from current data on redis, this method is used to persist the data on redis and to optimize the speed of read replicas and master instance. both slave and master are included on rolling bgsave.
https://tech.trivago.com/2017/01/25/learn-redis-the-hard-way-in-production/

### Main Script
```bash
#!/bin/bash

# Check if the 2nd argument was passed. (Seconds in between last save)
[ -z "$2" ]  && echo "[x] Pass the 'seconds' argument to compare last bgsave." && exit 1

betweenSeconds=$2
if [ -n "$1" ]; then
    lastSave=$(redis-cli -p $1 -a vhupP*5H*sWent9Uh4-x LASTSAVE)
    lastSaveToTime=$(date -d @$lastSave +"%s")

    currentTime=$(date +"%s")
    diff=$(($currentTime - $lastSaveToTime))

    if [ $diff -gt $betweenSeconds ]; then
        echo "[*] Script running .."
        out=$(redis-cli -p $1 -a vhupP*5H*sWent9Uh4-x BGSAVE)
        echo "[*] $out"
        echo "[*] Script runned on background redis .."
    fi
else
    echo "[x] Please specify the port to be run."
    exit 1
fi
```

### Checking last BGSAVE
```bash
date --date=@$(redis-cli -a PASSPHRASE LASTSAVE) +%c
```

### Contab
```bash
# Master
0 */4 * * * /bin/bash path/rolling-bgsave.sh 6379 43200
# Slave
0 */4 * * * /bin/bash path/rolling-bgsave.sh 6380 43200
```

### Deleting data using patterns
- Basically, it will delete all the result came from keys and execute the del.
- DEL key1 key2
```bash
redis-cli -h HOST_IP -a AUTHPASS KEYS inplayLogs* | xargs redis-cli -h HOST_IP -a AUTHPASS DEL
```