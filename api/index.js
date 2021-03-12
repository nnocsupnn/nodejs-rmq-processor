const config = require('../app/config.json');
const express = require('express');
const redis = require('redis')
const bluebird = require('bluebird')
const configApi = require('./config.json')
const rateLimit = require('express-rate-limit');

const Router = express.Router();

// API Limiting option
const limiter = rateLimit({
    windowMs: configApi.limit.duration,
    max: configApi.limit.max,
    handler: (request, response) => {
        return response.status(429).json({
            status: 429,
            message: "Too many request. Please try again later."
        })
    }
});

// Express js instance
let server = express()

try {
    server.use(limiter)

    // Promisify redis functions
    bluebird.promisifyAll(redis.RedisClient.prototype);
    bluebird.promisifyAll(redis.Multi.prototype);

    // Create redis instance from master
    const redisClient = redis.createClient(config.redis.port, config.redis.host, {
        password: config.redis.password
    });


    // Use module routing
    require('./modules/api')(Router, redisClient)
    server.use('/api', Router)
} catch (e) {
    return console.info(e);
}


// Start api
server.listen(configApi.port, '0.0.0.0', err => console.log(`API Running on port ${configApi.port}`))