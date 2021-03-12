const { jsonValidator, json_to_buffer } = require('../kernel/functions')

module.exports = (Queues, socketEmit, findEmit, liveDataClients, redis) => {
    Queues.livescoreQueue.on('global:completed', (jobId, result) => {
        if (typeof result === 'string') {
            var fxObject = jsonValidator(result);

            liveDataClients.local.emit('liveEvents', {
                type: 'update',
                data: fxObject
            })

            socketEmit(`livedata.update.${fxObject.fixture_id}`, json_to_buffer(fxObject));
        }
    })
}