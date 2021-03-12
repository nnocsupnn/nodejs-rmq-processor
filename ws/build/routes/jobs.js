const moment = require('moment');

module.exports = (router, Queues) => {
    router.use(function(req, res, next) {
        next()
    })

    router.get('/', async(req, res, next) => {
        const { type, queueType, limit, inputValue } = req.query

        let jobs = []
        let error = '';
        if (inputValue) {
            const job = await Queues[(queueType || 'marketsQueue')].getJob((inputValue.toString().trim() || ''));
            if (job == null) {
                jobs = await Queues[(queueType || 'marketsQueue')].getJobs(['completed', 'failed'], 0, (limit || 10), false);
                error = `MsgGuid not found.`
            } else {
                jobs = [job]
            }
        } else {
            jobs = await Queues[(queueType || 'fixturesQueue')].getJobs(['completed', 'failed'], 0, (limit || 10), false);
        }

        res.render('index', {
            jobs: jobs,
            error: error,
            old: req.body,
            from: queueType,
            calculateDiff: (tmstmpStart, tmstmpEnd) => {
                let startTime = moment(tmstmpStart)
                let end = moment(tmstmpEnd)
                let duration = moment.duration(end.diff(startTime));

                return duration.milliseconds()
            },
            prettyfy: (json) => {
                json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
                    var cls = 'number';
                    if (/^"/.test(match)) {
                        if (/:$/.test(match)) {
                            cls = 'key';
                        } else {
                            cls = 'string';
                        }
                    } else if (/true|false/.test(match)) {
                        cls = 'boolean';
                    } else if (/null/.test(match)) {
                        cls = 'null';
                    }
                    return '<span class="' + cls + '">' + match + '</span>';
                });
            }
        })
    })

    router.get('/getData', async(req, res) => {
        const dataType = req.query.dataType || 'parsed'

        switch (dataType) {
            case 'logs':
                const jobF = await Queues[(req.query.type || 'marketsQueue')].getJob((req.query.guid.toString().trim() || ''));
                const logs = await Queues[(req.query.type || 'marketsQueue')].getJobLogs(jobF.id, 0, -1);

                if (logs) {
                    if (jobF.failedReason) {
                        logs.logs.push(jobF.failedReason)
                    }
                    res.status(200).json({
                        id: (req.query.guid.toString().trim() || ''),
                        time: moment().format('LLLL'),
                        type: 'logs',
                        logs: logs || [],
                    })
                } else {
                    res.status(500).json({
                        message: `No data.`
                    })
                }
                break;

            case 'parsed':
            case 'raw':
                const job = await Queues[(req.query.type || 'marketsQueue')].getJob((req.query.guid.toString().trim() || ''));
                if (job) {
                    res.status(200).json({
                        id: job.id,
                        time: moment(job.timestamp).format('LLLL'),
                        type: dataType,
                        data: (dataType == 'raw') ? job.data : job.returnvalue
                    })
                } else {
                    res.status(500).json({
                        message: `No data.`
                    })
                }
                break;
        }
    })

    return router;
}