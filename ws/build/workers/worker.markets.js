const config = require('../../config.json');
const throng = require('throng');
const Queue = require("bull");
const { QueueOption } = require('../kernel/functions');
const { markets } = require('../processor');


// Spin up multiple processes to handle jobs to take advantage of more CPU cores
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
let workers = 1;

// The maxium number of jobs each worker should process at once. This will need
// to be tuned for your application. If each job is mostly waiting on network 
// responses it can be much higher. If each job is CPU-intensive, it might need
// to be much lower.
let maxJobsPerWorker = config.maxJobsPerWorker || 1;
let QueueName = 'MarketsQueues'

/**
 * Initial function for throng
 */
async function start(workerId) {
    // Connect to the named work queue
    let workQueue = new Queue(QueueName, QueueOption);

    workQueue.on('error', err => {
        console.info(`An error has been thrown. ${err}`);
    });

    // Listen on failed jobs
    workQueue.on('global:failed', (jobId, result) => {
        console.info(`-> AUTOFAILED JOB: ${jobId}, REASON: ${result}`)
    })

    // Markets queue handler, Will process markets
    workQueue.process(maxJobsPerWorker, markets);
}

// Initialize the clustered worker process
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
throng({
    workers: workers,
    lifetime: Infinity,
    start: start
});