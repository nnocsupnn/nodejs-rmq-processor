
/**
 * 
 * @name Job-Dispatcher 
 * 
 * 
 * @author Nino Casupanan
 * @memberof Vavasoftware, Inc.
 * @description Handling data job processing.
 */
var config = require('../config.json');
const { jsonValidator, queueConfigs } = require('./kernel/functions')
const fs = require('fs')
const Queue = require('bull');
const _ = require('lodash');
const redis = require('redis')
const bluebird = require('bluebird')
const telegramNotification = require('./plugin/TelegramBot/TelegramBot');


bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);



(['uncaughtException', 'unhandledRejection', 'uncaughtExceptionMonitor', 'unhandledRejection'])
.map(evt => {
    process.on(evt, (err, origin) => {
        console.log(`${err} \n\n`)
    });
});

/**
 * 
 * Redis instances
 */
const redisInstances = {
    blocking: redis.createClient(config.redis.port, config.redis.host, {
        password: config.redis.password,
        db: config.redis.db
    }),

    redisClient: redis.createClient(config.redis.port_slave, config.redis.host, {
        password: config.redis.password,
        db: config.redis.db
    }),

    redisMaster: redis.createClient(config.redis.port, config.redis.host, {
        password: config.redis.password,
        db: config.redis.db
    })
}


// Create / Connect to a named work queue
const Queues = {
    fixturesQueue: new Queue('FixturesQueues', queueConfigs.fixtureQueueOpts),
    livescoreQueue: new Queue('LivescoreQueues', queueConfigs.livescoreQueueOpts),
    marketsQueue: new Queue('MarketsQueues', queueConfigs.marketQueueOpts)
}

const jobOption = {
    lifo: false,
    removeOnComplete: 5000,
    removeOnFail: 5000,
    timeout: 3000
};


async function parseData(data) {
    try {
        let jmsg = jsonValidator(data);

        // Read file every update. so changes will reflect
        fs.readFile('../config.json', 'utf8', (err, result) => {
            if (err) return;
            config = JSON.parse(result);
        });

        if (jmsg instanceof Error) {
            throw new Error(`JSON String is not parsed correctly.`);
        }

        let prefix = 'livedata.', dbody;
        dbody = jmsg;

        if (!_.has(jmsg.Header, 'Type')) {
            throw new Error(`JSON String is not parsed correctly.`);
        }

        dbody.prefix = prefix;

        const dataType = dbody.Header.Type;
        var msgGuid;
        let priorityKeys = config.providers;

        /**
         * 
         * @types
         * 1 - Fixture
         * 2 - Livescore
         * 3 - Markets / odds
         * 35 - Settlement
         * 36 - Fixture - inprogress
         */
        if (dataType == 32 || dataType == '32') return; 
        switch (dataType) {
            case 1 || '1':
            case 36 || '36':
                msgGuid = dbody.Body.Events[0].FixtureId + '-' +  dbody.Header.MsgGuid;

                Queues.fixturesQueue.add(dbody, {...jobOption, jobId: msgGuid });
                break;

            case 2 || '2':
                msgGuid = dbody.Body.Events[0].FixtureId + '-' +  dbody.Header.MsgGuid;

                Queues.livescoreQueue.add(dbody, {...jobOption, jobId: msgGuid });
                break;

            case 3 || '3':
            case 35 || '35':
                msgGuid = dbody.Body.Events[0].FixtureId + '-' +  dbody.Header.MsgGuid;

                let availableProviders = await redisInstances.redisMaster.lrangeAsync(`provider:${dbody.Body.Events[0].FixtureId}`, 0, -1).catch(e => {
                    throw e;
                })
                

                if (availableProviders.length) {
                    availableProviders = availableProviders.map(idx => Number(idx))
                }
                
                for (let x = 0; x < dbody.Body.Events[0].Markets[0].Providers.length; x++) {
                    let provId = dbody.Body.Events[0].Markets[0].Providers[x].Id;
                    // Add to Queue
                    if (availableProviders.includes(provId)) {
                        Queues.marketsQueue.add(dbody, {...jobOption, jobId: msgGuid });
                    }
                }
                break;

            /**
             * Keep Alive
             * 
             * Priority
             * 
             * 8
             * 74
             * 145
             * 
             * {"Header":{"Type":31,"MsgGuid":"b91ad4d3-3fb6-40b3-8a21-20905a67defa","ServerTimestamp":1612117613},"Body":{"KeepAlive":{"ActiveEvents":[6450729,6436190,6445365],"ExtraData":null,"ProviderId":75}},"is_auto":true}
             */
            case 31 || '31':
                let liveEvents = dbody.Body.KeepAlive.ActiveEvents || [];
                let providerId = dbody.Body.KeepAlive.ProviderId || null;
                

                for (let i = 0;i < liveEvents.length; i++)
                {
                    let evt = liveEvents[i];
                    let rkey = `provider:${evt}`;

                    if (priorityKeys.includes(providerId)) {
                        let availableProviders = await redisInstances.redisMaster.lrangeAsync(rkey, 0, -1).catch(e => {
                            return []
                        });

                        if (availableProviders.length) {
                            availableProviders = availableProviders.map(idx => Number(idx))
                        }

                        if (availableProviders.includes(providerId) && providerId === 8 && availableProviders.length === 1) continue;

                        // If provider id is first priority. skip and remove the other provider id.
                        if (Number(providerId) === 8) {
                            // Remove first provider entried,
                            let toRemove = priorityKeys.filter(id => id !== Number(providerId));

                            for (let xx = 0; xx < toRemove.length; xx++) {
                                let rProviderId = toRemove[xx];
                                redisInstances.redisClient.lrem(rkey, 0, rProviderId);

                                // Remove data using pattern, if priority became available.
                                redisInstances.redisClient.keys(`livedata.${evt}.markets.*.${rProviderId}`, (error, reply) => {
                                    if (reply.length) redisInstances.redisClient.del(reply);
                                });
                            }

                            redisInstances.redisClient.lrem(rkey, 0, providerId);
                            redisInstances.redisClient.lpush(rkey, providerId);

                            continue;
                        }

                        // Second priority
                        if (
                            Number(providerId) === 74 
                            && !availableProviders.includes(providerId)
                            && !availableProviders.includes(8)
                            && !availableProviders.includes(145)
                        ) {
                            redisInstances.redisClient.lrem(rkey, 0, providerId);
                            redisInstances.redisClient.lpush(rkey, providerId);

                            continue;
                        }

                        // Third priority
                        if (
                            Number(providerId) === 145 
                            && !availableProviders.includes(providerId)
                            && !availableProviders.includes(8)
                            && !availableProviders.includes(74)
                        ) {
                            redisInstances.redisClient.lrem(rkey, 0, providerId);
                            redisInstances.redisClient.lpush(rkey, providerId);

                            continue;
                        }
                    }

                    // Set expiry on provider to 12hrs
                    redisInstances.redisClient.expire(rkey, 43200);
                }
                break;

            default:
                // ..
                break;
        }
    } catch (e) {
        telegramNotification.prepare("GOT AN ERROR FROM THIS DATA:\n\n\n`" + data + "`\n\n" + e)
        console.info(`THROWN: ${e}`)
        return;
    }
}



/**
 * 
 * Queue Consumer
 * 
 */
const masterFn = {
    push: () => {
        redisInstances.blocking.brpop(config.redis_list, 0, (error, data) => {
            if (data.length) parseData(data[1]);
            process.nextTick(masterFn.push);
        })
    },

    publish: () => {
        redisInstances.blocking.on('message', (channel, message) => {
            if (message) {
                parseData([channel, message]);
            }
        })

        redisInstances.blocking.subscribe(config.redis_list)
    }
}



/**
 * 
 * Start processing
 */
masterFn[config.method]();