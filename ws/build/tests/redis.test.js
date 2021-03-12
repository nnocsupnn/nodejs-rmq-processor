const assert = require('assert');
const config = require('../../config.json')
const redis = require('redis')
const bluebird = require('bluebird')

// Promisify redis client
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

/**
 * 
 * Create Redis instances
 */
const Brokers = {
        broker: redis.createClient(config.redis.port, config.redis.host, {
            password: config.redis.password,
            db: config.redis.db
        }),

        brokerSlave: redis.createClient(config.redis.port_slave, config.redis.host, {
            password: config.redis.password,
            db: config.redis.db
        })
    }

// Listen to redis errors.
Array.from(Brokers, (instance, k) => instance.on('error', console.info))

describe('Redis:', () => {
    describe(`Trying to connect to redis server. host: ${config.redis.host} port: ${config.redis.port}`, () => {
        describe('Checking all key dependencies.', () => {
            it('It should return a team.', doneTeam => {
                Brokers.broker.get(`team:3`, (error, reply) => {
                    if (error) doneTeam(new Error(error))
                    if (typeof reply == 'string') {
                        doneTeam()
                    } else {
                        doneTeam(new Error(''))
                    }
                })
            });

            it('It should return a league.', doneLeague => {
                Brokers.broker.get(`league:1`, (error, reply) => {
                    if (error) doneLeague(new Error(error))
                    if (typeof reply == 'string') {
                        doneLeague()
                    } else {
                        doneLeague(new Error(''))
                    }
                })
            });

            let sports = [
                154919,          
                48242,           
                131506,          
                154830,          
                35232,           
                154914,          
                687890,          
                6046,            
                54094,           
                35709
            ];

            it(`It should return a sport. Running ${sports.length} sport keys`, doneSport => {
                
                let hasInvalid = false;

                for (let x = 0;x < sports.length;x++) 
                {
                    let sport = sports[x]
                    Brokers.broker.get(`sport:${sport}`, (error, reply) => {
                        if (error) {
                            doneSport(new Error(error));
                        }

                        if (typeof reply !== 'string') {
                            hasInvalid = true
                        }
                    })
                }

                if (hasInvalid == false) doneSport()
            });

            it(`It should return a market`, doneMarket => {
                Brokers.broker.get(`market:48242:226`, (error, reply) => {
                    if (error) doneMarket(new Error(error))
                    if (typeof reply == 'string') {
                        doneMarket()
                    } else {
                        doneMarket(new Error(''))
                    }
                })
            });
        });
    });
});
