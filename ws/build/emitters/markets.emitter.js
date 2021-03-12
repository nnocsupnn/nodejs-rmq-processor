const { jsonValidator, json_to_buffer, marketGroup } = require('../kernel/functions')
const { processReturnRate } = require('../processor')
const config = require('../../config.json')

module.exports = (Queues, socketEmit, findEmit, liveDataClients, redis) => {
    Queues.marketsQueue.on('global:completed', (jobId, result) => {
        if (typeof result === 'string') {
            var fxObject = jsonValidator(result);

            liveDataClients.to('clients-room').emit('liveEvents', {
                type: 'update',
                data: fxObject
            })

            socketEmit(`livedata.update.${fxObject.fixture_id}`, json_to_buffer(fxObject), 'clients-room')
        }
    })


    
    /**
     * 
     * This part is for redis updates from the admin side.
     */
    redis.psubscribe('livedata.*.markets.*')
    let redisSetter = redis.duplicate({
        no_ready_check: true
    });
    
    redis.on(
        'pmessage', 
        async (pattern, channel, message) => {
            let fid = channel.split('.')[1] || 0;
            let market = jsonValidator(message);

            if (market) {

                market.bets = await processReturnRate(market.bets, market.market_id, market.sport_id);
                market.fixture_id = Number(fid);

                await redisSetter.setAsync(channel, JSON.stringify(market), 'EX', config.redis.expire_types.markets).catch(e => {
                    console.log(e)
                });

                let obj = {
                    type: "markets",
                    fixture_id: Number(fid),
                    markets: [marketGroup(market)]
                }

                liveDataClients.to('clients-room').emit('liveEvents', {
                    type: 'update',
                    data: obj
                })
                
                socketEmit(`livedata.update.${fid}`, json_to_buffer(obj), 'clients-room');

                console.info(`[UPDATE_ADMIN] A pattern was updated and publish. Channel: ${channel}, Pattern: ${pattern}`)
            }
        }
    );
}