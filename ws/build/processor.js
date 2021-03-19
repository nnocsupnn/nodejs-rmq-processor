const config = require('../config.json')
const moment = require('moment-timezone');
const redis = require('redis')
const bluebird = require('bluebird')
const _ = require('lodash')
const fs = require('fs')
const sportPeriods = require('./files/sports_periods.json')
const { marketGroup, jsonValidator, toFixed, failJob, getRedisBrokers, roundTo3, isArray, processBets } = require('./kernel/functions')
const telegramNotification = require('../build/plugin/TelegramBot/TelegramBot');
const tz = 'Asia/Seoul';

Object.prototype.delete = function(key = '') {
    if (typeof this !== 'object') console.error('Not an object.')
    delete this[key];
    return this;
}

// Promisify redis client
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);



/**
 * 
 * Create Redis instances
 */
const Brokers = getRedisBrokers(redis, config);
Array.from(Brokers, (instance, k) => instance.on('error', console.info));


(['uncaughtException', 'unhandledRejection', 'uncaughtExceptionMonitor', 'unhandledRejection'])
.map(evt => {
    process.on(evt, (err, origin) => {
        console.log(`${err} \n\n`)
    });
})
/**
 * 
 * Processor:
 * 
 * All processes by the workers goes here.
 */
const Processor = {
    processReturnRate: async function (fixtureid, odds, marketId, spid) {
        try 
        {
			let leagueId = await Brokers.broker.getAsync(`league:id:${fixtureid}`);
            let results = await Processor.getKeys([
                `returnrate:${marketId}:${spid}:${leagueId}`,
                `returnratesf:${marketId}:${spid}:${leagueId}`,
                `returnrate:mode`,
            ]);

            let returnRate = (results[0] == null ? 0 : results[0]);
            let returnRateSf = (results[1] == null ? 0 : results[1]);
            let returnRateMode = (results[2] == null ? 0 : results[2]);

            if (!isNaN(returnRate)) {
                returnRate = parseFloat(returnRate);
            } else {
                returnRate = 0
            }
            
            if (!isNaN(returnRateSf)) {
                returnRateSf = parseFloat(returnRateSf);
            } else {
                returnRateSf = 0
            }

            // Home Draw Away
            let baselines = _.groupBy(odds, 'baselineUncomputed');

            let hda_converted = [];
            // undefined key is for non baseline odds or for 1x2 or 1v2 odds
            if (_.has(baselines, 'undefined')) {
                hda_converted = await Processor.computeReturnRates(baselines['undefined'], returnRate, returnRateSf, returnRateMode)
                delete baselines['undefined']
            }

            // Baselines
            let baseline_converted = [];
            if (baselines) {
                for (let x in baselines)
                {
                    if (x !== 'undefined')
                    {
                        if (baselines[x].length) 
                        {
                            baseline_converted = [...baseline_converted, ...await Processor.computeReturnRates(baselines[x], returnRate, returnRateSf, returnRateMode)]
                        }
                    }
                }
            }

            return [...hda_converted, ...baseline_converted]
        }
        catch (e)
        {
            telegramNotification.prepare(`Error on computing return rates. ${marketId}`);
            return odds;
        }
    },

    computeReturnRates: async function (betsx, returnRate, returnRateSf, returnRateMode) {
        try
        {
            let converted = [], totalOdds = 0, refundRate = 0;
            betsx.map((odd, idx) => {
                // Probability
                let probability = 1 / parseFloat(odd.price_orig);
                totalOdds += probability;
                return odd;
            })

            refundRate = 1 / totalOdds;
            /* refundRate = parseFloat(toFixed(refundRate, 4)); */

            // Multi Folder
            converted = betsx.map((odd, idx) => {
                if (refundRate !== 0) {
                    odd.refund_rate = refundRate;
                    let multiFolderComputed = odd.price_orig;
                    if (returnRate) {
                        // Conversion
                        multiFolderComputed = parseFloat(odd.price_orig) / refundRate * returnRate;
                        odd.price = String(multiFolderComputed);
                    } else {
                        odd.price = odd.price_orig;
                    }
                }

                return odd;
            })

            // Single Folder
            let totalOddsSf = 0, refundRateSf = 0;

            converted.map((oddsf, idx) => {
                // Probability
                let probabilitySf = 1 / parseFloat(oddsf.price);
                totalOddsSf += probabilitySf;

                return oddsf;
            })

            refundRateSf = 1 / totalOddsSf;
            /* refundRateSf = parseFloat(toFixed(refundRateSf, 4)); */

            converted = converted.map((oddsf, idx) => {
                if (refundRateSf !== 0) {
                    oddsf.refund_rate_sf = refundRateSf;
                    // Conversion Sing Folder
                    oddsf.price_sf = oddsf.price_orig;
                    if (returnRateSf && (returnRateMode == 'manual' || returnRateMode == '5%'))
                    {
                        let singleFolderComputed = parseFloat(oddsf.price) / refundRateSf * returnRateSf;
                        oddsf.price_sf = singleFolderComputed;
                    } else {
                        /* if (returnRateMode == 'multifolder') {
                            oddsf.price_sf = oddsf.price;
                        } else {
                            oddsf.price_sf = oddsf.price_orig;
                        } */

                        oddsf.price_sf = oddsf.price;
                    }
                }

                return oddsf;
            })


            return converted;
        } 
        catch (e)
        {
            console.log(e)
            return betsx
        }
    },

    /**
     * Markets
     * @param {*} job 
     * @param {*} done 
     */
    markets: async function (job, done) {
        let data = job.data;
        let marketId = data.Body.Events[0].Markets[0].Id;
        let providerName = data.Body.Events[0].Markets[0].Providers[0].Name;
        let providerId = data.Body.Events[0].Markets[0].Providers[0].Id;
        let providerBets = data.Body.Events[0].Markets[0].Providers[0].Bets;

        const fid = data.Body.Events[0].FixtureId;
        const eventKey = `${data.prefix}${fid}.markets.${marketId}.${providerId}`;

        // Get saved data
        return Brokers.broker.getAsync(eventKey).then(parseData).catch(err => {
            console.info(err)
        })

        async function parseData(marketSaved, error) {
            if (error) {
                failJob(job, `OLD Record not exists. [MARKETS]`);
            };

            /**
             * 
             * Data initialization starts here
             */
            let oldBets = JSON.parse(marketSaved),
                marketUpdate = {},
                spid = false,
                provider_sport_id = null,
                processBetOpt = {
                    settled: true
                };


            /**
             * Check sport id
             */
            if (_.has(oldBets, 'sport_id')) {
                spid = oldBets.sport_id
            } else {
                let sportIdSaved = await Brokers.broker.getAsync(`sport:id:${fid}`).then((reply, error) => {
                    if (error) throw error
                    return reply
                }).catch(err => {
                    job.log(`MARKETS: Market id ${marketId} did not found sportid in db.`);
                })

                if (sportIdSaved) {
                    spid = sportIdSaved;
                    provider_sport_id = sportIdSaved;
                } else {
                    job.moveToFailed({
                        message: `MARKETS: No sport id found on query. [${fid}][${marketId}]`
                    }, true)
                    done(null);
                    return;
                }
            }

            if (spid !== false) {
                marketUpdate.sport_id = parseInt(spid)
            } else {
                job.log(`This fixture (${fid}) has no sportid.. Ignoring.. [MARKETS]`)
                job.moveToFailed({
                    message: `MARKETS: No sport id found on query. [${fid}][${marketId}]`
                }, true)
                done(null);
                return;
            }
            

            let market = await Brokers.broker.getAsync(`market:${spid}:${marketId}`).then((reply, error) => {
                if (error) return null;
                let obj = JSON.parse(reply)
                return obj
            })

            if (!market) {
				job.log(`Verify markets on redis. market:{sportid}:{marketId} [${fid}, ${marketId}]`)
                job.moveToFailed({
                    message: `Market is not marketable (Market Id: ${marketId}) from Fixture Id: ${fid}`
                }, true);
                done(null);
                job.progress(0);

                return;
            }
            /**
             * Data initialization ends here
             */

            /**
             * 
             * Data mutation starts here
             * 
             */
            if (market) {
                marketUpdate = Object.assign(marketUpdate, market)
                if (provider_sport_id) marketUpdate.provider_sports_id = provider_sport_id || null
                marketUpdate.sport_id = Number(spid);
            } else if (_.has(oldBets, 'market_id')) {
                marketUpdate = Object.assign(market, oldBets)
            }

            marketUpdate.market_id = Number(marketId);

            if (marketSaved !== null) {

                let updatebets = processBets(providerBets, spid, processBetOpt);
                /**
                 * Settlement could be sent per baseline batch. 
                 * it will set to true when the first result/settlement was recieved
                 */
                marketUpdate.is_settled = processBetOpt.settled;
                updatebets.map((obj, idx) => {
                    let prevOddIdx = _.findIndex(oldBets.bets, { id: obj.id })

                    if (prevOddIdx >= 0) {
                        let prevObj = oldBets.bets[prevOddIdx]
                        let prevPrice = prevObj.price;
                        if (prevPrice !== obj.price) {
                            obj.prevPrice = prevPrice
                        }

                        obj.amount = prevObj.amount;

                        // Overriding status if provider sent status 2 with settlement.
                        if (
                            // New update has settlement but status is 2
                            (_.has(obj, 'settlement') && obj.status == 2) 
                            // Previous update has already status 3 and has settlement prop
                            || (prevObj.status == 3 && _.has(prevObj, 'settlement'))
                        ) {
                            obj.status = 3;
                        }

						oldBets.bets[prevOddIdx] = Object.assign(oldBets.bets[prevOddIdx], obj);
                    } else {
                        oldBets.bets.push(obj)
                    }
                })

                marketUpdate.bets = await Processor.processReturnRate(fid, oldBets.bets, marketId, spid);

                job.progress(100);

            } else {
                if (market) {
                    marketUpdate = {...market }
                }

                marketUpdate.bets = await Processor.processReturnRate(fid, processBets(providerBets, spid, processBetOpt), marketId, spid);

                /**
                 * Settlement could be sent per baseline batch. 
                 * it will set to true when the first result/settlement was recieved
                 */
                marketUpdate.is_settled = processBetOpt.settled;
                job.progress(100);
            }

            /**
             * 
             * NEW RULE, Locked the odd line if price less than 1.2 dec
             */
            let oddBaselineLock = false, oddNormalLineLock = false, baselinesToLock = [];
            marketUpdate.bets.map(bet => {
                if (_.has(bet, 'name')) {
                    if (_.has(bet, 'baselineUncomputed')) {
                        if (bet.price < 1.2 && bet.status != 3) {
                            oddBaselineLock = true;
                            baselinesToLock.push(bet.baselineUncomputed)
                        }
                    } else {
                        if (bet.price < 1.2 && bet.status != 3) oddNormalLineLock = true;
                    }
                }
                
                return bet;
            })

            marketUpdate.bets.map(bet => {
                if (oddBaselineLock) {
                    if (baselinesToLock.includes(bet.baselineUncomputed)) {
                        bet.status = 2;
                        bet.rule_locked = true;
                    }
                }

                if (oddNormalLineLock) {
                    bet.status = 2;
                    bet.rule_locked = true;
                }

                return bet;
            })
            /** */

            marketUpdate.fixture_id = fid;
            marketUpdate.provider = { 
                id: providerId,
                name: providerName
            }


            await Brokers.broker.setAsync(eventKey, JSON.stringify(marketUpdate), 'EX', config.redis.expire_types.markets);

            /**
             * Finished
             * Check if is valid market to send update
             */
            let dataFormatted = {
                type: "markets",
                fixture_id: fid,
                markets: [marketGroup(marketUpdate)]
            };

            
            done(null, dataFormatted);
            return dataFormatted;
            /**
             * Finished
             */
        }
    },



    /**
     * 
     * @param {*} key 
     * Function getting key value on redis
     */
    fetchRedisData: async function (key) {
        let result = await Brokers.broker.getAsync(key)
        .then((reply, error) => {
            if (error) return null;
            return JSON.parse(reply)
        })

        return result
    },


     /**
     * 
     * @param {*} keys 
     * @param {*} returnType 
     * Multi getter for redis.
     */
    getKeys: async (keys = [], returnType = null) => {
        let result = await Brokers.broker.mgetAsync(keys)
        .then((res, error) => {
            if (error) return keys.map(x => null)
            if (returnType == 'object') {
                return res.map(obj => JSON.parse(obj));
            } else {
                return res;
            }
        }).catch(e => {
            return [];
        })

        return result
    },

    /**
     * Fixture parser
     * @param {*} job 
     * @param {*} done 
     */
    fixture: async function (job, done) {

        let data = job.data
        if (_.has(data, 'Body') === false || _.has(data.Body, 'Events') === false) {
            failJob(job, `Data has no events object. [FIXTURES]`);
            done(`Data has no events object. [FIXTURES]`);
        };

        let events = data.Body.Events;
        let msgId = data.Header.MsgGuid;
        let isManual = _.has(data.Header, 'IsManual') ? data.Header.IsManual : false;
        let isLocked = _.has(data.Header, 'IsLocked') ? data.Header.isLocked : null;
        let fixtureObject = {},
            statuses = {
                1: 'Not started yet',
                2: 'In progress',
                3: 'Finished',
                4: 'Cancelled',
                5: 'Postponed',
                6: 'Interrupted',
                7: 'Abandoned',
                8: 'Coverage lost',
                9: 'About to start'
            };

        let eventKey = `${data.prefix}${data.Body.Events[0].FixtureId}.fixture`;
        return Brokers.broker.getAsync(eventKey).then(parseFixture).catch(err => done(err))

        async function parseFixture(dataObject, error) {
            if (error) {
                failJob(job, `OLD Record not exists. [FIXTURES]`);
                done(`OLD Record not exists. [FIXTURES]`);
            };
            const fxObject = JSON.parse(dataObject)

            for (let i in events) {
                if (_.has(events[i], 'Fixture')) {
                    let fixture = events[i].Fixture;
                    fixtureObject.fixture_id = events[i].FixtureId;
                    fixtureObject.is_manual = isManual;
                    fixtureObject.dateupdated = Number(moment().tz(tz).format('x'))
                    fixtureObject.status = fixture.Status;

                    fixtureObject.status_desc = statuses[fixtureObject.status] || fixtureObject.status

                    let lockedResult = false;
                    if (data.Header['IsLocked'] !== undefined) {
                        lockedResult = data.Header['IsLocked'];
                    } else {
                        if (_.has(fxObject, 'is_locked')) {
                            lockedResult = fxObject.is_locked
                        } else {
                            lockedResult = false;
                        }
                    }

                    fixtureObject.is_locked = lockedResult

                    fixtureObject.startdate = String(fixture.StartDate)
                    // korean time convertion from UTC - KST
                    fixtureObject.startdatekr = moment.utc(fixtureObject.startdate).tz(tz).format() || null

                    fixtureObject.location = {
                        id: fixture.Location.Id,
                        name: fixture.Location.Name
                    }

                    fixtureObject.sport = {
                        id: fixture.Sport.Id,
                        name: fixture.Sport.Name,
                        league: {
                            id: fixture.League.Id,
                            name: fixture.League.Name,
                            league_icon: ''
                        }
                    }

                    fixtureObject.participants = {
                        home: {},
                        away: {}
                    }

                    if (_.has(fixture, 'Participants')) {
                        Array.from(fixture.Participants, async ({ Position, Id, Name }, i) => {
                            switch (Position) {
                                case '1':
                                    fixtureObject.participants.home = {
                                        id: Id,
                                        name: Name 
                                    }
                                    break;

                                case '2':
                                    fixtureObject.participants.away = {
                                        id: Id,
                                        name: Name 
                                    }
                                    break;
                            }
                        })
                    }

                    /**
                     * Match information
                     */
                    try 
                    {
                        // Returned is associated by the order of the parameter array.
                        let getData = await Processor.getKeys([
                            `team:${fixture.Participants[0].Id}`,
                            `team:${fixture.Participants[1].Id}`,
                            `sport:${fixture.Sport.Id}`,
                            `league:${fixture.League.Id}`
                        ], 'object');

                        let homeTeam = (getData[0] == null ? null : getData[0]), 
                        awayTeam = (getData[1] == null ? null : getData[1]), 
                        sportSave = (getData[2] == null ? null : getData[2]),  
                        leagueSave = (getData[3] == null ? null : getData[3]);
    
                        if (homeTeam !== null)
                        {
                            fixtureObject.participants.home.name = homeTeam.name_kr
                        }
    
                        if (awayTeam !== null)
                        {
                            fixtureObject.participants.away.name = awayTeam.name_kr
                        }
    
                        if (sportSave !== null)
                        {
                            fixtureObject.sport.name = sportSave.name_kr
                        }
    
                        if (leagueSave !== null)
                        {
                            fixtureObject.sport.league.name = leagueSave.name_kr;
                            fixtureObject.sport.league.league_icon = leagueSave.icon ?? ''
                            if (leagueSave.location_name_kr && leagueSave.location_name_kr !== '') fixtureObject.location.name = leagueSave.location_name_kr; 
                        }
                    }
                    catch (e)
                    {
                        telegramNotification.prepare(`*Match information fetching error. (Team, League and Sport)*`)
                    }

                    /**
                     * KOR Names from redis - END
                     */

                    let prefixKey = `livedata.${fixtureObject.fixture_id}`
                    let objReturn = {
                        isInplay: {},
                        update: {}
                    }
                    

                    await Brokers.broker.multi([
                        // SET key value EX expiration
                        [
                            'SET', `sport:id:${fixtureObject.fixture_id}`, fixtureObject.sport.id, 'EX', 86400
                        ],
                        [
                            'SET', `league:id:${fixtureObject.fixture_id}`, fixtureObject.sport.league.id, 'EX', 86400
                        ],
                        // Save fixture
                        [
                            'SET', `${prefixKey}.fixture`,  JSON.stringify(Object.assign({}, fixtureObject)), 'EX', config.redis.expire_types.fixture
                        ]
                    ]).exec(() => {
                        // executed after command is done.
                    });

                    // Remove from inplay list if match finished or other status
                    // Other than inprogress and about to start.
                    if (![2, 9].includes(fixtureObject.status)) {
                        Brokers.broker.lrem(config.inplayKey, 0, prefixKey);
                    }

                    /**
                     * Notify if fixture has changed.
                     * Not started yet, Finished, Cancelled, Postponed, Interrupted, Abandoned, Coverage lost
                     */
                    if ([3, 4, 5, 6, 7, 8].includes(Number(fixtureObject.status))) {
                        telegramNotification.prepare(`*FIXTURE STATUS CHANGED*:\n\n*MsgId:* _${msgId}_\n\n*Sport:* ${fixtureObject.sport.name} (${fixtureObject.sport.league.name})\n*FixtureId:* ${fixtureObject.fixture_id}\n*Match:* ${fixtureObject.participants.home.name} vs ${fixtureObject.participants.away.name}\n*Status:* ${fixtureObject.status_desc}\n*MatchStartDate:* ${fixtureObject.startdatekr}`)
                    }

                    // If update is for newly added match and became inprogress
                    if ([2, 9].includes(fixtureObject.status)) {
                        Brokers.broker.lrem(config.inplayKey, 0, prefixKey);
                        Brokers.broker.lpush(config.inplayKey, prefixKey);

                        objReturn.inplay = true;

                        // Get snapshot if it is a newly match changing status to 2
                        objReturn.isInplay = await Processor.getSnapshot(prefixKey, fixtureObject.fixture_id);
                    } else {
                        objReturn.inplay = false;
                        objReturn.update = fixtureObject;
                    }

                    /**
                     * Finished
                     */
                    job.progress(100);

                    if (Number(fixtureObject.status) == 1) {
                        job.log('Fixture not inprogress. ' + fixtureObject.fixture_id);
                        done(null);
                        return;
                    }

                    let dataFormatted = {
                        isInplay: objReturn.isInplay,
                        update: {
                            type: "fixture",
                            fixture_id: objReturn.update.fixture_id,
                            fixture: objReturn.update
                        }
                    }


                    done(null, dataFormatted)

                    return dataFormatted;
                    /**
                     * Finished
                     */
                }
            }
        };
    },





    /**
     * Livescore parser
     * @param {*} job 
     * @param {*} done 
     */
    livescore: async function (job, done) {

        let data = job.data
        if (_.has(data, 'Body') === false || _.has(data.Body, 'Events') === false) {
            failJob(job, 'Data has no events object. [LIVESCORES]');
        };

        fs.readFile('./files/sports_periods.json', 'utf8', (err, result) => {
            if (err) return;
            sportPeriods = JSON.parse(result);
        });

        let eventKey = `${data.prefix}${data.Body.Events[0].FixtureId}.livescore`;
        let statNames = {
                1: 'Corners',
                6: 'Yellow cards',
                7: 'Red cards',
                8: 'Penalties',
                9: 'Goal',
                10: 'Substitutions',
                24: 'Own goal',
                25: 'Penalty goal',
                40: 'Missed penalty',
                20: 'Aces',
                21: 'Double faults',
                34: 'First serve wins',
                12: 'Fouls',
                28: 'Two points',
                30: 'Three points',
                31: 'Time outs',
                32: 'Free throws',
                8: 'Penalties',
                33: 'Hits'
            },
            livescore = {
                fixture_id: null,
                lastupdate: moment().tz(tz).format(),
                current: {},
                periods: [],
                statistics: [],
                extra_data: []
            }

        let event = data.Body.Events[0]
        if (_.has(event, 'FixtureId')) {
            let livescoreSaved = await Brokers.broker.getAsync(eventKey).then((reply, error) => {
                if (error) return null;
                return JSON.parse(reply)
            }).catch(e => {})
            /**
             * Check sport id
             */
            livescore.fixture_id = event.FixtureId;
            let spid = await Brokers.broker.getAsync(`sport:id:${event.FixtureId}`).then((reply, error) => {
                if (error) throw error;
                return reply
            }).catch(err => {
                failJob(job, `Fixture sportid not found on redis. ${event.FixtureId}`);
            })

            /**
             * Scoreboard
             */
            if (event.Livescore.Scoreboard) {
                let currentPeriodObj = event.Livescore.Scoreboard;
                let obj = {}

                if (spid !== null) {
                    livescore.sport_id = spid;
                    let period_info = _.findIndex(sportPeriods, { SP_TYPE: String(currentPeriodObj.CurrentPeriod), SP_SID: String(spid) })
                    if (period_info >= 0) {
                        obj = sportPeriods[period_info];
                    }
                }

                obj.status = currentPeriodObj.Status
                obj.type = currentPeriodObj.CurrentPeriod
                obj.time = currentPeriodObj.Time

                obj.scores = {
                    home: '',
                    away: ''
                }


                if (livescoreSaved) {
                    /**
                     * 
                     * @description
                     * 
                     * Add breaktime field on basketball
                     */
                    if (livescoreSaved.current.type !== 80 && obj.type === 80 && Number(spid) == 48242) {
                        obj.breaktime_at = Number(moment().tz(tz).format('x'))
                    }
                }

                /**
                 * @description
                 * 
                 * Score parsing
                 */
                if (currentPeriodObj.Results) {
                    currentPeriodObj.Results.map((scorePeriod, idx) => {
                        if (scorePeriod.Position === "1" || scorePeriod.Position == 1) {
                            obj.scores.home = scorePeriod.Value !== null ? scorePeriod.Value : 0
                        } else {
                            obj.scores.away = scorePeriod.Value !== null ? scorePeriod.Value : 0
                        }
                    })
                    
                    livescore.current = obj

                    job.progress(50)
                }
            }

            /**
             * @description
             * 
             * Statistics parsing
             */
            if (_.has(event.Livescore, 'Statistics')) {
                const statistics = event.Livescore.Statistics
                if (livescoreSaved) {
                    livescore.statistics = [...livescoreSaved.statistics]
                    livescore.statistics = _.uniqBy(livescore.statistics, e => e.type)
                }

                statistics.map((stat, idx) => {
                    let statObj = {}
                    statObj.type = stat.Type
                    if (statNames[stat.Type]) {
                        statObj.name = statNames[stat.Type]
                    }
                    statObj.result = {
                        home: {},
                        away: {}
                    }

                    if (_.has(stat, 'Results')) {
                        stat.Results.map((objResult, idxx) => {
                            statObj.result[(objResult.Position == '1' ? 'home' : 'away')] = objResult.Value
                        })
                    }

                    let lvIdx = livescore.statistics.findIndex(obj => obj.type === statObj.type)
                    if (lvIdx >= 0) {
                        livescore.statistics[lvIdx] = statObj
                    } else {
                        livescore.statistics.push(statObj)
                    }
                })
            }


            /**
             * @description
             * 
             * Extradata parsing
             * Includes: Turn, Ball Position etc.
             */
            if (_.has(event.Livescore, 'LivescoreExtraData')) {
                let extraData = event.Livescore.LivescoreExtraData
                if (livescoreSaved) {

                    livescore.extra_data = [...livescoreSaved.extra_data]
                    livescore.extra_data = _.uniqBy(livescore.extra_data, e => e.name)
                }

                extraData.map((xtraData, idx) => {
                    let xtraDataObj = {}
                    
                    xtraDataObj.name = xtraData.Name;
                    xtraDataObj.value = xtraData.Value

                    let lvIdx = livescore.extra_data.findIndex(obj => obj.name === xtraDataObj.name)
                    if (lvIdx >= 0) {
                        livescore.extra_data[lvIdx] = xtraDataObj
                    } else {
                        livescore.extra_data.push(xtraDataObj)
                    }
                })
            }

            if ((spid == '154830' || spid == 154830) && livescore.extra_data.findIndex(obj => obj.name === 'LastPointSequence') < 0) livescore.extra_data.push({
                name: 'LastPointSequence',
                value: []
            })

            /**
             * Periods
             */
            if (event.Livescore.Periods) {
                let periods = event.Livescore.Periods;

                for (let index in periods) {
                    const periodObject = periods[index]
                    let objPeriods = {}


                    if (spid !== null) {
                        let period_info = _.findIndex(sportPeriods, { SP_TYPE: String(periodObject.Type), SP_SID: String(spid) })
                        if (period_info >= 0) {
                            objPeriods = sportPeriods[period_info];
                        }
                    }

                    objPeriods.type = periodObject.Type
                    objPeriods.is_finished = periodObject.IsFinished
                    objPeriods.is_confirmed = periodObject.IsConfirmed

                    objPeriods.scores = {
                        home: '',
                        away: ''
                    }

                    if (periodObject.Results) {
                        periodObject.Results.map((scorePeriod, idx) => {
                            if (scorePeriod.Position === "1" || scorePeriod.Position == 1) {
                                objPeriods.scores.home = scorePeriod.Value !== null ? scorePeriod.Value : 0
                            } else {
                                objPeriods.scores.away = scorePeriod.Value !== null ? scorePeriod.Value : 0
                            }
                        })

                        // Add current statistics to old periods
                        if (periodObject.Type === livescore.current.type)
                        {
                            objPeriods.statistics = livescore.statistics;
                        }

                        livescore.periods.push(objPeriods)

                        job.progress(100)
                    }
                }
            }

            // If Volleyball add this extra data field
            if (spid == '154830' || spid == 154830) 
            {
                var resetPointSequence = false;
                let lastUpdatedScore = await Brokers.broker.getAsync(`scored_sequence:${livescore.fixture_id}`).then((reply, error) => {
                    if (error) return null
                    return JSON.parse(reply)
                }).catch(e => {})
    
                let oldScores = lastUpdatedScore || { home: 0, away: 0 };
                let lastPointSeqIdx = livescore.extra_data.findIndex(obj => obj.name === 'LastPointSequence')
                let oldSixPointIdxData = _.has(livescoreSaved, 'extra_data') ? livescoreSaved.extra_data.findIndex(obj => obj.name === 'LastPointSequence') : -1
                if (oldSixPointIdxData >= 0) {
                    livescore.extra_data[lastPointSeqIdx].value = livescoreSaved.extra_data[oldSixPointIdxData].value || []
                }
    
                // Check which participant changed
                if (!_.isEqual(oldScores, livescore.current.scores)) {
                    var ch = null;
                    Array.from([livescore.current.scores], ({home, away}, idx) => {
                        if (away !== oldScores.away) {
                            ch = 2
                        }
    
                        if (home !== oldScores.home) {
                            ch = 1
                        }

                       
                    })
                    
                    if (livescore.extra_data[lastPointSeqIdx].value.length >= 6) livescore.extra_data[lastPointSeqIdx].value.shift();
                    if (ch !== null) livescore.extra_data[lastPointSeqIdx].value.push(ch)
                }

                if (
                    (parseInt(livescore.current.scores.home) === 0 && parseInt(livescore.current.scores.away) === 0)
                ) {
                    resetPointSequence = true;
                }

                if (resetPointSequence) livescore.extra_data[lastPointSeqIdx].value = []
            }

            let output = JSON.parse(JSON.stringify(livescore));

            await Brokers.broker.multi([
                // SET key value EX expiration
                [
                    'SET', eventKey, JSON.stringify(livescore), 'EX', config.redis.expire_types.livescore
                ],
                // Save fixture
                [
                    'SET', `scored_sequence:${livescore.fixture_id}`, JSON.stringify(livescore.current.scores), 'EX', 1000
                ]
            ]).exec(() => {
                // executed after command is done.
            });
            
            /**
             * Finished
             */
            let returnObj = {
                type: "livescore",
                fixture_id: livescore.fixture_id,
                livescore: output
            }

            /**
             * @description
             * 
             * Applies only on football, force it to finished if the current halftime is 20 - 2HT
             */
            if ((spid === '6046' || spid === 6046) && livescore.current.type === 20) {
                returnObj = await Processor.sendStatus(eventKey.replace('.livescore', '.fixture'), 3)
            }

            if (
                // Check if status of current livescore became 3
				[3].includes(Number(livescore.current.status))
                // Check if livescore type is 100 or 101
                && [100, 101].includes(Number(livescore.current.type))
			) {
                returnObj = await Processor.sendStatus(eventKey.replace('.livescore', '.fixture'), 3)
            }

            done(null, returnObj)
            return returnObj;
        }
    },



    /**
     * 
     * @param {*} prefixKey 
     * Multi getting of snapshot data.
     */
    getSnapshot: async (prefixKey, fid) => {
        return await Brokers.broker.keysAsync(`${prefixKey}.*`).then(async (keys, error) => {
            if (keys.length >= 1) {
                let snapshot = await Brokers.broker.mgetAsync(keys).then((res, error) => {
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
                    
                    return fxObject;
                }).catch(e => {
                    telegramNotification.prepare(`Error getting snapshot data on processor.js`)
                })

                return snapshot;
            }
        }).catch(err => {
            telegramNotification.prepare(`Failed getting snapshot. ${prefixKey}`)
        })
    },

    sendStatus: async(key, status = 3) => {
        const fxSaved = await Brokers.broker.getAsync(key).then((fixture, error) => {
            if (fixture) {
                return JSON.parse(fixture)
            }
        }).catch(err => {
            failJob(job, `Error thrown while getting fixture data to throw finished status for soccer.`);
        })

        if (fxSaved && fxSaved.status === 2) {
            fxSaved.status = status;
            fxSaved.status_desc = 'Finished';

            /**
             * Notify if fixture has changed.
             * Not started yet, Finished, Cancelled, Postponed, Interrupted, Abandoned, Coverage lost
             */
            if ([3, 4, 5, 6, 7, 8].indexOf(fxSaved.status) >= 0) {
                try {
                    telegramNotification.prepare(`*FIXTURE STATUS CHANGED [F]*:\n\n*Sport:* ${fxSaved.sport.name} (${fxSaved.sport.league.name})\n*FixtureId:* ${fxSaved.fixture_id}\n*Match:* ${fxSaved.participants.home.name} vs ${fxSaved.participants.away.name}\n*Status:* ${fxSaved.status_desc}\n*MatchStartDate:* ${fxSaved.startdatekr}`)
                } catch (e) {
                    // Ignore
                }
            }

            // Remove fixtureid on inplay key
            Brokers.broker.lrem(config.inplayKey, 0, key.toString().replace('.fixture', ''));

            // Update data on redis.
            await Brokers.broker.setAsync(key, JSON.stringify(fxSaved), 'EX', config.redis.expire_types.fixture);

            return {
                type: "fixture",
                fixture_id: fxSaved.fixture_id,
                fixture: fxSaved
            }
        }
    }
}


module.exports = Processor