
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
        let defaultConfig = {
            "6046": [70, 8, 145],                
            "35232": [8, 145, 70],               
            "35709": [8, 145, 70],               
            "48242": [70, 8, 145],               
            "54094": [8, 145, 70],               
            "131506": [8, 145, 70],              
            "154830": [70, 8, 145],              
            "154914": [70, 8, 145],              
            "154919": [8, 145, 70],              
            "687890": [8, 145, 70]
        }

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
                /**
                 * 
                 * @summary
                 * SOCCER: (Betway) and (handicap - Bet365 only) > Bet365 > 1xbet
                 */
                msgGuid = dbody.Body.Events[0].FixtureId + '-' +  dbody.Header.MsgGuid;

                let availableProviders = await redisInstances.redisMaster.lrangeAsync(`provider:${dbody.Body.Events[0].FixtureId}`, 0, -1).catch(e => {
                    throw e;
                })
                

                if (availableProviders.length) {
                    availableProviders = availableProviders.map(idx => Number(idx))
                }
                
                for (let x = 0; x < dbody.Body.Events[0].Markets[0].Providers.length; x++) {
                    let provId = dbody.Body.Events[0].Markets[0].Providers[x].Id;
                    let marketId = dbody.Body.Events[0].Markets[0].Id;

                    /**
                     * 
                     * @description
                     * 
                     * Exemption handler and job dispatcher
                     */
                    let fixtureSport = await redisInstances.redisMaster.getAsync(`sport:id:${dbody.Body.Events[0].FixtureId}`).catch(e => {
                        return null
                    });

                    let exemptions = config.market_excemption[String(fixtureSport)] || null;
                    let marketExemption = _.find(exemptions, { provider: Number(provId), market: Number(marketId) }) || null;

                    // Add to Queue
                    if (
                        availableProviders.includes(provId)
                        || (
                            /**
                             * @description
                             * Check if there is a exemption config per sport.
                             */
                            marketExemption !== null
                            && Number(provId) === marketExemption.provider
                            && Number(marketId) === marketExemption.market
                        )
                    ) {
                        Queues.marketsQueue.add(dbody, {...jobOption, jobId: msgGuid });
                    }
                }
                break;

            /**
             * Keep Alive
             * 
             * @description
             * 8 - Bet365
             * 70 - BetWay
             * 145 - 1XBet
             * 
             * <Priority rules for Inplay>
             *
             * @rule Basketball: Betway > Bet365 > 1xbet
             * @rule Basketball: Betway > Bet365 > 1xbet
             * @rule Baseball: Bet365 > 1xbet
             * @rule MMA: Bet365 > 1xbet
             * @rule AMERICAN FOOTBALL: 
             * @rule HANDBALL: Bet365 > 1xbet
             * @rule SOCCER: Betway and (handicap - Bet365 only) > Bet365 > 1xbet
             * @rule VOLLEYBALL: Betway > Bet365 > 1XBet
             * @rule E-GAMES: Bet365 > 1XBet
             */
            case 31 || '31':
                let liveEvents = dbody.Body.KeepAlive.ActiveEvents || [];
                let providerId = dbody.Body.KeepAlive.ProviderId || null;
                

                for (let i = 0;i < liveEvents.length; i++)
                {
                    let evt = liveEvents[i];
                    let rkey = `provider:${evt}`;
                    
                    // Check if fixture has sport id to identify priority provider
                    let fixtureSport = await redisInstances.redisMaster.getAsync(`sport:id:${evt}`).catch(e => {
                        return null
                    });

                    priorityKeys = config.sports_provider[String(fixtureSport)] || [8, 70, 145];

					// Exception, dont delete market that are in the exception
					let exemptions = config.market_excemption[String(fixtureSport)] || null;

                    // Start filtering
                    if (priorityKeys.includes(providerId)) {
                        let availableProviders = await redisInstances.redisMaster.lrangeAsync(rkey, 0, -1).catch(e => {
                            return []
                        });

                        if (availableProviders.length) {
                            availableProviders = availableProviders.map(idx => Number(idx))
                        }

                        if (availableProviders.includes(providerId) && providerId === priorityKeys[0] && availableProviders.length === 1) continue;

                        // If provider id is first priority. skip and remove the other provider id.
                        if (Number(providerId) === priorityKeys[0]) {
                            // Remove first provider entried,
                            let toRemove = priorityKeys.filter(id => id !== Number(providerId));

                            for (let xx = 0; xx < toRemove.length; xx++) {
                                let rProviderId = toRemove[xx];
                                redisInstances.redisClient.lrem(rkey, 0, rProviderId);

                                // Remove data using pattern, if priority became available.
                                redisInstances.redisClient.keys(`livedata.${evt}.markets.*.${rProviderId}`, (error, reply) => {
                                    if (reply.length) {
                                        /**
                                         * @description Remove all markets thats not equal to the current priority.
                                         * Exception: 
                                         * 
                                         * Soccer - Handicap (Market Id: 3)
                                         */
										let toDeleteMarkets = reply;
										let marketExemption = {}
										reply.map(cacheKey => {
											if (cacheKey.split('.').length) {
												marketExemption = _.find(exemptions, { provider: Number(providerId), market: Number(cacheKey.split('.')[3]) }) || null;
											}
										})
										
										if (marketExemption !== null && marketExemption.provider === Number(rProviderId)) {
											toDeleteMarkets = reply.filter(market => {
												return market !== `livedata.${evt}.markets.${marketExemption.market}.${rProviderId}`
											})
										}
                                        

                                        redisInstances.redisClient.del(toDeleteMarkets);
                                    }
                                });
                            }

                            redisInstances.redisClient.lrem(rkey, 0, providerId);
                            redisInstances.redisClient.lpush(rkey, providerId);

                            continue;
                        }

                        // Second priority
                        if (
                            Number(providerId) === priorityKeys[1] 
                            && !availableProviders.includes(providerId)
                            && !availableProviders.includes(priorityKeys[0])
                            && !availableProviders.includes(priorityKeys[2])
                        ) {
                            redisInstances.redisClient.lrem(rkey, 0, providerId);
                            redisInstances.redisClient.lpush(rkey, providerId);

                            continue;
                        }

                        // Third priority
                        if (
                            Number(providerId) === priorityKeys[2] 
                            && !availableProviders.includes(providerId)
                            && !availableProviders.includes(priorityKeys[0])
                            && !availableProviders.includes(priorityKeys[1])
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