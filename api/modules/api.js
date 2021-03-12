const { marketGroup } = require('../../app/build/kernel/functions')
const config = require('../config.json')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const _ = require('lodash')
const { logger, scanData } = require('./middlewares')

/**
 * @param {Router} router
 * @param {Redis} redis
 */
module.exports = function(router, redis) {
    // Middleware functions
    router.use(logger)

    router.use(async function(request, response, next) {
        response.set('X-Server-Timestamp', Date.now())

        if (/(auth|check)/g.test(request.originalUrl) == false) {
            const token = request.headers['x-access-token'];
            return jwt.verify(token, config.secret, function(err, decoded) {

                if (err) return response.status(500).json({
                    status: 500,
                    message: String(err.message).toLocaleUpperCase()
                });

                next()
            });
        }


        next()
    })


    router.param('fixture', (request, response, next, id) => {
        // Request to db validate user then attach the info to request object
        // So it can be access every request
        // response.set('X-Login-as', id)
        response.set('X-FixtureId', id)

        next()
    })


    // Check token
    router.post('/check', (request, response) => {
        const { token, user, password } = request.query

        return jwt.verify(token, config.secret, async function(err, decoded) {
            if (err) return response.status(400).send({ auth: false, message: err }).end();
            let ttl = await redis.ttlAsync(user).then((reply, error) => {
                return reply
            })

            return response.status(200).json({
                status: 200,
                message: {
                    token: token,
                    ttl: ttl
                }
            })
        });
    })


    // Request token
    router.post('/auth', async(request, response) => {
        const { user, password } = request.query

        /**
         * In the future you can set up dbmysql connection here to fetch user information
         */
        if (user !== 'rubyTest') return response.status(500).json({
            status: 500,
            message: "There was a problem registering the user."
        })

        try {
            let exists = await redis.existsAsync(`${user}`).then(function(reply, error) {
                if (reply) {
                    return true;
                } else {
                    return false;
                }
            })

            if (exists == false) {
                let token = jwt.sign({ userKey: user }, config.secret, {
                    expiresIn: Number(config.expiration)
                });

                redis.set(`${user}`, token, 'EX', config.expiration)
                return response.status(200).json({
                    expires: (config.expiration / 60) + ' min(s)',
                    token: token
                })
            } else {
                let token = await redis.getAsync(`${user}`).then(function(reply, error) {
                    if (reply) {
                        return reply;
                    } else {
                        return false;
                    }
                })

                if (token) {
                    return response.status(200).json({
                        expires: (config.expiration / 60) + ' min(s)',
                        token: token
                    })
                }
            }
        } catch (err) {
            if (err) return response.status(500).send({ auth: false, message: err }).end();
        }
    });


    /**
     * @get All markets
     */
    router.get('/:type/:fixture/markets', async(request, response) => {
        const { type, fixture } = request.params

        scanData(redis, 0, `${type}.${fixture}.markets*`, 50, [], async function(markets) {
            try {
                if (markets.length >= 1) {
                    let remaining = markets.length
                    let marketsArray = [];

                    for (let i = 0; i <= markets.length; ++i) {
                        let marketFound = await redis.getAsync(markets[i]).then(function(reply, error) {
                            return JSON.parse(reply)
                        }).catch(err => {
                            throw err
                        })

                        --remaining

                        if (remaining == 0) {
                            if (marketsArray.length) {
                                // return marketsArray
                                return response.json(marketsArray).end()
                            } else {
                                throw `No marketable markets.`
                            }
                        } else {
                            if (_.has(marketFound, 'market_name_en')) {
                                marketsArray.push(marketGroup(marketFound))
                            }
                        }
                    }

                } else {
                    throw `No market found.`
                }
            } catch (e) {
                return response.status(404).json({ status: 404, error: e }).end()
            }
        });
    })


    /**
     * @get Specific market data
     */
    router.get('/:type/:fixture/markets/:market', async(request, response) => {
        const { type, fixture, market } = request.params

        const key = `${type}.${fixture}.markets.${market}`;
        redis.existsAsync(key).then(async(isExists, error) => {

            if (isExists == 1) {
                let market = await redis.getAsync(key).then((reply, error) => {
                    return JSON.parse(reply)
                })

                return marketGroup(market)
            } else {
                throw `Market does not exists.`
            }
        }).then(res => {
            response.status(200).json(res).end()
        }).catch(err => {
            response.status(404).json({ status: 404, error: err }).end()
        })
    })


    /**
     * @get Livescore, Fixture
     */
    router.get('/:type/:fixture/:objType', async(request, response) => {
        const { type, fixture, objType } = request.params

        redis.getAsync(`${type}.${fixture}.${objType}`).then((result, error) => {
            if (error) throw error
            if (result) {
                return result
            } else {
                throw `Not found`
            }
        }).then(res => {
            response.json(JSON.parse(res)).end()
        }).catch(err => {
            response.status(404).json({ status: 404, error: err }).end()
        })
    })


    /**
     * @get Ready
     */
    router.get('/ready', async(request, response) => {
        let handleFixtures = (reply, error) => {
            let fixtureIds = [];
            if (reply) {
                reply.map(fixture => {
                    fixtureIds.push(Number(fixture.split('.')[1]))
                })
            }

            return fixtureIds
        }

        let livematches = await redis.lrangeAsync('inplay', 0, -1).then(handleFixtures).catch(err => {
            response.status(500).json({ status: 500, error: err })
        })

        let prematches = await redis.lrangeAsync('prematchLive', 0, -1).then(handleFixtures).catch(err => {
            response.status(500).json({ status: 500, error: err })
        })

        return response.status(200).json({
            prematch: prematches,
            livematch: livematches
        })
    })
}