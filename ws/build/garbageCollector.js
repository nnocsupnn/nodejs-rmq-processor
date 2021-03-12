const config = require('../config.json');
const Queue = require('bull')

/**
 * 
 * Queue Options defined here
 */
const queueConfigs = {
    marketQueueOpts: {
        redis: {
            port: config.redis.port,
            host: config.redis.host,
            password: config.redis.password,
            db: config.redis.db
        }
    },

    livescoreQueueOpts: {
        redis: {
            port: config.redis.port,
            host: config.redis.host,
            password: config.redis.password,
            db: config.redis.db
        }
    },

    fixtureQueueOpts: {
        redis: {
            port: config.redis.port,
            host: config.redis.host,
            password: config.redis.password,
            db: config.redis.db
        }
    }
}

// Create / Connect to a named work queue
const Queues = {
    fixturesQueue: new Queue('FixturesQueues', queueConfigs.fixtureQueueOpts),
    livescoreQueue: new Queue('LivescoreQueues', queueConfigs.livescoreQueueOpts),
    marketsQueue: new Queue('MarketsQueues', queueConfigs.marketQueueOpts)
}

// clean every 2hour(s)
setInterval(async() => {
    for (let qtype in Queues) {
        (['delayed', 'failed']).map(async type => {
            console.info(`Queue[${type}] is being clear.`);
            await Queues[qtype].clean(0, type)
            console.info(`Queue[${type}] is now cleared.`);
        })
    }
}, 7.2e+6);