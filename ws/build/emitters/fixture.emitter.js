const { jsonValidator } = require('../kernel/functions')
const _ = require('lodash');

module.exports = (Queues, socketEmit, findEmit, liveDataClients, redis) => {
    Queues.fixturesQueue.on('global:completed', (jobId, result) => {
        if (typeof result === 'string') {
            var fxObject = jsonValidator(result);
            var fid = (fxObject.update.fixture_id || fxObject.isInplay.fixture_id);
    
            // Send newly added inplay
            if (_.has(fxObject.isInplay, 'fixture_id')) {
                liveDataClients.local.emit('live_events', [{
                    fid: fxObject.isInplay.fixture_id,
                    key: `livedata.${fxObject.isInplay.fixture_id}`
                }]);


                liveDataClients.local.emit('liveEvents', {
                    type: 'snapshot',
                    data: fxObject.isInplay
                })
    
                socketEmit(`livedata.${fxObject.isInplay.fixture_id}`, fxObject.isInplay);
            }
    
            if (_.has(fxObject.update, 'fixture_id')) {

                liveDataClients.local.emit('liveEvents', {
                    type: 'update',
                    data: fxObject.update
                })

                socketEmit(`livedata.update.${fxObject.update.fixture_id}`, fxObject.update);
            }
        }
    });
}