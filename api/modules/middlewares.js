/**
 * You can create middlewares here.
 * ex: database interaction, redis
 */


const logger = (req, res, next) => {
    console.log(`${req.method} [${(new Date()).toLocaleTimeString()}]: ${req.originalUrl}`)
    next()
}

module.exports = {
    logger
}