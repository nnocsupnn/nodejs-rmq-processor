/**
 * Functions
 * 
 * 
 * Global functions defined here:
 * please define and add to export object at btm
 */

const { _extend } = require('util');
const _ = require('lodash');
const moment = require('moment');
const fs = require('fs');
const util = require('util');
const config = require('../../config.json');


const appendFile = util.promisify(fs.appendFile)

const prmsfy = (fn) => {
    // if (typeof fn !== 'function') throw new Error('Cannot be promisify. not a function.');
    return util.promisify(fn)
}

const logger = (message, color = "\x1b[32m") => {
    console.info(message)
}

const ulog = (message, lvl) => {
    switch (lvl) {
        case 0:
            console.log(message);
            break;

        case 1:
            console.warn(message);
            break;

        case 2:
            console.trace(message);
            break;

        case 3:
            console.error(message);
            break;
    }
}

const die = (msg = '') => {
    if (msg !== '') console.log(msg)
    process.exit()
}

const TJson = (str) => {
    return JSON.parse(str)
}

const TStr = (str) => {
    if (typeof str !== 'object') die('tostr parameter pass not object');
    return JSON.stringify(str)
}

// Async saving logs on file
const saveBetLog = async(bet1, bet2) => {
    let file = `../betlog.log`;

    let log = bet1

    let changes = objectChanges(bet1, bet2)

    log.changes = changes

    // the logfile will reset once it gets 1MB in size
    if (getFilesizeInMBytes(file) > 1) {
        emptyFile(file)
    }

    if (changes.length > 1) {
        appendFile(file, JSON.stringify(log) + "\n", function(err) {
            if (err) throw new Error(err)
        });
    }
}


const getFilesizeInMBytes = (filename) => {
    var stats = fs.statSync(filename)
    var fileSizeInMBytes = stats["size"] / 1000000
    return fileSizeInMBytes.toFixed(2)
}


const emptyFile = (file) => {
    fs.truncate(file, 0, () => {
        logger(`[LOG] ${file} is truncated.`)
    })
}

const objectChanges = (oldObj, newObj) => {
    return _.reduce(oldObj, function(result, value, key) {
        return _.isEqual(value, newObj[key]) ?
            result : result.concat(key);
    }, []);
}

const saveLog = (strng) => {
    fs.appendFile(`${moment().format('YYYYMMDD')}.log`, strng, function(err) {
        if (err) throw new Error(err)
    });
}


const json_to_buffer = (obj) => {
    return obj;
}


const calc = (number, times=2) => {
    if (typeof number == 'undefined') {
        return false;
    }

    if (times <= 0) { return Math.floor(number).toFixed(2); }

    return (Math.trunc(number * Math.pow(10, times)) / Math.pow(10, times)).toFixed(2);
}


const pickSelectedBaselines = (marketBaselines) => {

    if (!Object.keys(marketBaselines).length) {
        return marketBaselines;
    }

    let computed = _.map(marketBaselines, (i, key) => {

        if (!Object.keys(i.home).length || !Object.keys(i.away).length) {
            return {};
        }

        if (i.home.status != 1 || i.away.status != 1) {
            return;
        }

        let item = {baseline: key};
        let homePrice = calc(i.home.price);
        let awayPrice = calc(i.away.price);

        item.requirement = Math.abs(homePrice-1.85) + Math.abs(awayPrice-1.85);

        return item;

    });

    // let daTri = _.minBy(computed, 'requirement');
    let daTri = _.orderBy(computed, 'requirement', 'ASC').slice(0, 1);
    let newMarketBaselines = {};

    if (!daTri.length) {
        return marketBaselines;
    }

    // if (daTri.requirement > 1) {
    //  daTri.baseline = 'disable key';
    // } 

    _.forEach(Object.keys(marketBaselines), (key) => {

        newMarketBaselines[key] = marketBaselines[key];

        if (
            !Object.keys(marketBaselines[key].home).length 
            || !Object.keys(marketBaselines[key].away).length
        ) {
            return;
        }

        let baselineIndex = _.findIndex(daTri, { baseline:key });

        if (baselineIndex !== -1) {

            newMarketBaselines[key].home.chosenOne = true;
            newMarketBaselines[key].away.chosenOne = true;

        } else {

            newMarketBaselines[key].home.chosenOne = false;
            newMarketBaselines[key].away.chosenOne = false;

            if (
                marketBaselines[key].home.status == 1 
                && marketBaselines[key].away.status == 1
            ) {

                newMarketBaselines[key].home.status = 2;
                newMarketBaselines[key].away.status = 2;

            }

        }

    });

    return newMarketBaselines;

}


const groupMarkets = (fx) => {
    let markets = new Array();
    let data = {}
    for (let ii in fx.markets) {
        const marketObject = fx.markets[ii]
        let marketObj = {}
        if (_.has(marketObject, 'bets') && marketObject.bets.length > 0) {

            let home = new Array(),
                away = new Array(),
                draw = new Array(),
                baseline = new Object();

            marketObject.bets.map((bet, idx) => {
                if (_.has(bet, 'name')) {
                    if (_.has(bet, 'baseline')) {
                        let baseKey = bet.baseline;
                        if (!_.has(baseline, bet.baseline)) {
                            baseline[baseKey] = {
                                home: {},
                                away: {}
                            }
                        }

                        switch (bet.name) {
                            case 'Over':
                            case '1':
                                baseline[baseKey].home = bet
                                break;

                            case '2':
                            case 'Under':
                                baseline[baseKey].away = bet
                                break;
                        }
                    } else {
                        switch (bet.name) {
                            case 'Over':
                            case '1':
                                home.push(bet)
                                break;

                            case '2':
                            case 'Under':
                                away.push(bet)
                                break;

                            case 'X':
                                draw.push(bet)
                                break;
                        }
                    }
                }
            })

            delete marketObject.bets;
            // marketObject.fixture_id = fid
            marketObj.market_id = marketObject.market_id
            delete marketObject.market_id
            marketObj = jextend(marketObj, marketObject)
            marketObj.bets = {
                home: [],
                away: [],
                draw: [],
                baseline: {}
            }

            var orderedBaseline = {}
            Object.keys(baseline).sort().forEach(key => orderedBaseline[key] = baseline[key]);

            marketObj.bets.home = home
            marketObj.bets.away = away
            marketObj.bets.draw = draw
            marketObj.bets.baseline = orderedBaseline

            markets.push(marketObj)

        }
    }

    if (markets.length) {
        data.markets = markets
    }

    return data
}

const marketGroup = (marketsData) => {
    let markets = marketsData

    let home = new Array(),
        away = new Array(),
        draw = new Array(),
        baseline = new Object();

    let ordered = new Object();
    if (_.has(markets, 'bets')) {
        _.forEach(markets.bets, (bet, idx) => {
            if (_.has(bet, 'name')) {
                if (_.has(bet, 'baseline')) {
                    let baseKey = bet.baseline;

                    if (!_.has(baseline, bet.baseline)) {
                        baseline[baseKey] = {
                            home: {},
                            away: {}
                        }
                    }

                    switch (bet.name) {
                        case 'Over':
                        case '1':
                            baseline[baseKey].home = bet
                            break;

                        case '2':
                        case 'Under':
                            baseline[baseKey].away = bet
                            break;
                    }
                } else {
                    switch (bet.name) {
                        case 'Over':
                        case '1':
                            home.push(bet)
                            break;

                        case '2':
                        case 'Under':
                            away.push(bet)
                            break;

                        case 'X':
                        case 'x':
                            draw.push(bet)
                            break;
                    }
                }
            }
        })

        delete markets.bets;
    }

    ordered = {...markets,
        bets: {
            home: [],
            draw: [],
            away: [],
            baseline: []
        }
    }

    if (home.length) {
        ordered.bets.home = home;
    }

    if (draw.length) {
        ordered.bets.draw = draw;
    }

    if (away.length) {
        ordered.bets.away = away;
    }

    // Sort keys by baseline value
    var orderedBaseline = {}
    Object
    .keys(baseline)
    .sort()
    .map(key => orderedBaseline[key] = baseline[key]);

    ordered.bets.baseline = orderedBaseline;

    if (Object.keys(ordered.bets.baseline).length) {
        pickSelectedBaselines(ordered.bets.baseline);
    }

    return ordered;
}

const isValidJson = (str) => {
    try {
        JSON.parse(str)
    } catch (e) {
        return false;
    }

    return true;
}

const twoFixed = (value) => value.toString().match(/^\d+(?:\.\d{0,2})?/)[0];


const parseBigIntfromJson = (str) => {
    str = str.replace(/([\[:])?(\d{14,})([,\}\]])/g, "$1\"$2\"$3");
    return str
}

const jsonValidator = (jsonStr) => {
    try {
        let json = JSON.parse(jsonStr)
        while (typeof json == 'string') {
            json = JSON.parse(json);
        }

        return json;
    } catch (e) {
        return new Error(e);
    }
}

const QueueOption = {
    redis: {
        port: config.redis.port,
        host: config.redis.host,
        password: config.redis.password,
        db: config.redis.db
    }
}

const queueConfigs = {
    marketQueueOpts: {
        redis: {
            port: config.redis.port,
            host: config.redis.host,
            password: config.redis.password,
            db: config.redis.db
        },
        settings: {
            stalledInterval: config.failed_after
        }
    },

    livescoreQueueOpts: {
        redis: {
            port: config.redis.port,
            host: config.redis.host,
            password: config.redis.password,
            db: config.redis.db
        },
        settings: {
            stalledInterval: config.failed_after
        }
    },

    fixtureQueueOpts: {
        redis: {
            port: config.redis.port,
            host: config.redis.host,
            password: config.redis.password,
            db: config.redis.db
        },
        settings: {
            stalledInterval: config.failed_after
        }
    }
}


const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}


const queueStatus = (queues, ms = 10000, callback = null, pid) => {
    setInterval(() => {
        console.info("\n^");
        console.info("\n^");
        console.info(`* [${pid}] QUEUE STATUS | /10sec: (${moment().format('hh:mm:ss A')})`);
        (queues).map((queue, k) => {
            let queues = [
                'MARKETS   ',
                'LIVESCORES',
                'FIXTURES  '
            ]
            queue.getJobCounts().then(status => {
                console.info(`| [${queues[k]}]: ${JSON.stringify(status).replace(/(")/g, ' ').replace(/(:)/g, ': ').replace(/({|})/g, ' ')}`)
            })
        });

        if (typeof callback == 'function') callback()
    }, ms)
}

const scanData2 = async(redis, cursor, pattern, count = 50, results = [], callback = function() {}) => {
    try {
        redis.scan(cursor, 'MATCH', pattern, 'COUNT', count, function(err, res) {
            if (err) throw err;

            cursor = res[0]

            var keys = res[1]

            if (keys.length > 0) {
                results = [...results, ...keys]
            }

            if (cursor === '0') {
                return results
            }

            return scanData(redis, cursor, pattern, count, results, callback);
        })
    } catch (err) {
        throw err
    }
}

const scanData = async(redis, cursor, pattern, count = 50, results = [], callback = function() {}) => {
    try {
        redis.scan(cursor, 'MATCH', pattern, 'COUNT', count, function(err, res) {
            if (err) throw err;

            cursor = res[0]

            var keys = res[1]

            if (keys.length > 0) {
                results = [...results, ...keys]
            }

            if (cursor === '0') {
                return callback(results)
            }

            return scanData(redis, cursor, pattern, count, results, callback);
        })
    } catch (err) {
        throw err
    }
}

const maxValueKey = (obj) => {
    if (_.isEmpty(obj)) return;
    return Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
}

let jextend = _extend

const toFixed = (num, fixed) => {
    var re = new RegExp('^-?\\d+(?:\.\\d{0,' + (fixed || -1) + '})?');
    return num.toString().match(re)[0];
}


const failJob = (job, message) => {
    job.moveToFailed({
        message: message
    }, false).then(res => {
        job.finished().catch(err => job.log(err))
    }).catch(err => job.log(err))
}


const getRedisBrokers = (redis, config) => {
    return {
        broker: redis.createClient(config.redis.port, config.redis.host, {
            password: config.redis.password,
            db: config.redis.db
        }),

        // brokerSlave: redis.createClient(config.redis.port_slave, config.redis.host, {
        //     password: config.redis.password,
        //     db: config.redis.db
        // })
    }
}

const roundTo3 = (num, len = 3) => {
    return +(Math.round(num + `e+${len}`) + `e-${len}`)
}


const isArray = x => (!!x) && (x.constructor === Array);
const isObject = x => x => (!!x) && (x.constructor === Object);

/**
 * 
 * A non async redis call
 * 
 * @param {*} redis 
 * @param {*} prefix 
 * @param {*} fid 
 * @param {*} callback 
 */
const getSnapshot = (redis, prefix, fid, callback = () => {}) => {
    if (typeof callback !== 'function') throw new Error('callback argument must be type of function.');
    redis.keys(`${prefix}.*`, function (err, keys) {
        if (err) return;
        if (!keys.length) return; 

        if (isArray(keys)) {
            // Fetch all data and sent it as snapshot.
            redis.mget(keys, (err, res) => {
                if (err) return;

                let fxObject = {
                    fixture: {},
                    livescore: {},
                    markets: []
                };

                fxObject.fixture_id = Number(fid);
                if (isArray(res) && res.length > 0) {
                    res.map((jsonStr, idx) => {
                        let jdata = jsonValidator(jsonStr);
                        
                        if (jdata) {
                            // Identify the type of the data.
                            // Fixture, Livescore or Markets
                            let type = _.has(jdata, 'bets') ? 'markets' : _.has(jdata, 'participants') ? 'fixture' : _.has(jdata, 'statistics') ? 'livescore' : null;

                            switch (type) {
                                case 'fixture':
                                case 'livescore':
                                    fxObject[type] = jdata;
                                    break;

                                case 'markets':
                                    fxObject.markets.push(marketGroup(jdata));
                                    break;
                            }
                        }
                    })
                }
                

                callback(fxObject);
            })
        }
    })
}

module.exports = {
    toFixed,
    scanData,
    scanData2,
    logger,
    die,
    jextend,
    TJson,
    TStr,
    saveLog,
    saveBetLog,
    prmsfy,
    json_to_buffer,
    ulog,
    groupMarkets,
    objectChanges,
    marketGroup,
    jsonValidator,
    sleep,
    QueueOption,
    queueStatus,
    isValidJson,
    maxValueKey,
    twoFixed,
    queueConfigs,
    failJob,
    getRedisBrokers, 
    roundTo3,
    isArray,
    isObject,
    getSnapshot
}