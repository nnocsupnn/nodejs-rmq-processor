/**
 * 
 * @name SocketServer
 * 
 * 
 * @author Nino Casupanan
 * @memberof Vavasoftware, Inc.
 * @description Handling socket clients.
 */




const config = require('../config.json');
const cluster = require("cluster");
const { setupMaster, setupWorker } = require("@socket.io/sticky");

/**
 * 
 * Master process node
 */
if (cluster.isMaster) {
    const httpServer = require('http').createServer();

    setupMaster(httpServer, {
        loadBalancingMethod: "least-connection", // either "random", "round-robin" or "least-connection"
    });

    /**
     * Server Start
     * 
     * Force listen to ipv4 0.0.0.0
     */
    httpServer.listen(config.port, '0.0.0.0', () => console.log(`Main Socket server started @ ${config.port}`));

    
    /**
     * 
     * Create child processes
     * based on config concurrency or fork it depends on how many cpus your server have.
     */
    for (let i = 0; i < config.concurrency; i++) {
        cluster.fork();
    }
  
    cluster.on("exit", worker => {
        console.log(`[MASTER] NodeWorker ${worker.process.pid} died`);

        // Revive the died worker.
        cluster.fork();
    });
    
} else {
    console.log(`Socket Server has been started, Running on pid: ${process.pid}`);

    const { jsonValidator, json_to_buffer, marketGroup, queueConfigs, isArray, getSnapshot } = require('./kernel/functions');
    const Queue = require('bull');
    const _ = require('lodash');
    const redis = require('redis')
    const bluebird = require('bluebird');
    const socketParser = require('socket.io-msgpack-parser');
    const { Server } = require('socket.io')
    const redisAdapter = require('socket.io-redis');
    
    bluebird.promisifyAll(redis.RedisClient.prototype);
    bluebird.promisifyAll(redis.Multi.prototype);

    const httpServer = require('http').createServer()
    const sockets = new Server(httpServer, {
        serveClient: false,
        forceNew: true,
        pingInterval: 2500,
        pingTimeout: 7.2e+6,
        upgradeTimeout: 25000,
        rememberUpgrade: true, // Recommended to turnOn if using SSL/TSL
        cookie: false,
        parser: socketParser,
        perMessageDeflate: true,
        transports: ['websocket']
    });
    
    sockets.adapter(redisAdapter({ host: config.redis.host, port: config.redis.port, password: config.redis.password }));

    setupWorker(sockets);

    const liveDataClients = sockets.of('/LiveData')

    /**
     * Redis instances
     */
    const mainClient = redis.createClient(config.redis.port, config.redis.host, {
        password: config.redis.password,
        db: config.redis.db
    });

    const redisInstances = {
        blocking: mainClient.duplicate({
            no_ready_check: true
        }),
        
        redisClient: mainClient.duplicate({
            no_ready_check: true
        }),

        redisMaster: mainClient
    }

    // Create / Connect to a named work queue
    const Queues = {
        fixturesQueue: new Queue('FixturesQueues', queueConfigs.fixtureQueueOpts),
        livescoreQueue: new Queue('LivescoreQueues', queueConfigs.livescoreQueueOpts),
        marketsQueue: new Queue('MarketsQueues', queueConfigs.marketQueueOpts)
    }


    /**
     * Socket Server Functionalities
     * events and response
     */
    var socketClients = [];

    liveDataClients.on('connection', (socket) => {
        let protocol = socket.conn.protocol;
        let clientUserId = socket.handshake.query.clientUserId ?? 'visitor';
        // console.log(`[SOCKET_NODE_${process.pid}] Socket Version used: v${protocol} [${clientUserId}]`);
        console.log(`[SOCKET_NODE_${process.pid}][CONNECTED]: ${liveDataClients.sockets.size} browser tab connected.`);

        // Join specific room based on connection query
        if (clientUserId === 'animation') {
            socket.join('animation-room')
        } else {
            socket.join('clients-room')
        }
        
        socket.clientRedis = redisInstances.redisClient;
        
        // On connect - pass all live events
        socket.clientRedis.lrange('inplay', 0, -1, (error, reply) => {
            let liveEvents = []
            if (reply) {
                reply.map(redisKey => {
                    let spread = redisKey.split('.')
                    liveEvents.push({
                        fid: spread[1],
                        key: redisKey
                    })

                    getSnapshot(socket.clientRedis, redisKey, spread[1], snapshot => {
                        socket.emit(`livedata.${spread[1]}`, snapshot);
                        socket.emit('liveEvents', {
                            type: 'snapshot',
                            data: snapshot
                        })
                    })
                })

                // Emit live events
                socket.emit('live_events', liveEvents);
                socket.emit('liveEvents', {
                    type: 'live',
                    data: liveEvents
                })
            }
        })


        // Send match information on request
        socket.on('getdata', async msg => {
            /**
             * This feature is now disabled.
             * All snapshot will not be requested anymore instead will be sent
             * when the client connects.
             * 
             * @see line 134
             */
            return;
            /**
             * 
             * Get All data on the requested fixture
             */
            (msg.fixtures ?? []).map((fx, idx) => {
                /**
                 * 
                 * Subscription method
                 */
                let xclient = _.findIndex(socketClients, { id: socket.id })
                if (xclient >= 0) {
                    if (Array.isArray(socketClients[xclient].fids)) {
                        socketClients[xclient].socket = socket;
                        socketClients[xclient].id = socket.id;
                        socketClients[xclient].fids.push(fx.fid);
                    }
                } else {
                    socketClients.push({
                        id: socket.id,
                        socket: socket,
                        fids: [fx.fid]
                    })
                }

                // Get snapshot and return
                getSnapshot(socket.clientRedis, fx.key, fx.fid, snapshot => {
                    socket.emit(`livedata.${fx.fid}`, snapshot);
                })
            })
        })


        // Locking fixture
        socket.on('lock', async body => {
            var cacheKey = `livedata.${body.fid}.fixture`;
            socket.clientRedis.get(cacheKey, (error, value) => {
                if (error) throw new Error(`Error on locking data: ${error}`)
                if (value) {
                    let jdata = JSON.parse(value);
                    jdata.is_locked = body.lock

                    // Re-set the fixture after locking.
                    socket.clientRedis.set(cacheKey, JSON.stringify(jdata));
                    socket.clientRedis.expire(cacheKey, config.redis.expires);
                        
                    let lockMsg = `[LOCKUPDATE]: (${body.fid}) *${(body.lock == true || body.lock == 'true' ? 'Unlock' : 'Lock')} -> ${(body.lock == true || body.lock == 'true' ? 'Lock' : 'Unlock')}*`;
                    console.info(lockMsg)

                    liveDataClients.local.emit(`livedata.update.${body.fid}`, json_to_buffer({
                        type: 'fixture',
                        fixture_id: body.fid,
                        fixture: jdata
                    }))
                }
            })
        });


        // Disconnection flag
        socket.on('kick_me', () => {
            socket.disconnect(true);
        })


        
        socket.on('disconnect', (reason) => {
            console.log(`[SOCKET_NODE_${process.pid}][DISCONNECTED] ${clientUserId} -> ${reason}`)
            console.log(`[SOCKET_NODE_${process.pid}][CONNECTED]: ${liveDataClients.sockets.size} browser tab connected.`)
        });
    })
    /**
     * * * * * * * * * * * * * * * * * *  * * * * * * * * * *
     */
    


    /**
     * Job Listeners, once completed it will throw an update to socket clients
     * 
     * Asigned the socket instance to the QueueWork instance,
     *  to be used on emitting updates
     */
    const socketEmit = (key, value, room = null) => {
        if (room) {
            liveDataClients.local.to(room).emit(key, json_to_buffer(value))
        } else {
            liveDataClients.local.emit(key, json_to_buffer(value))
        }
    }

    const findEmit = fid => {
        return _.filter(socketClients, (obj) => {
            if (obj.fids.indexOf(String(fid)) >= 0) return true;
            return false;
        })
    }

    /**
     * 
     * Emitters
     */
    const fixtureEmitter = require('./emitters/fixture.emitter');
    const livescoreEmitter = require('./emitters/livescore.emitter');
    const marketsEmitter = require('./emitters/markets.emitter');

    /**
     * 
     * @param Queue Parent
     * @param Emitter Fn
     * @param Emitter Subscriber
     * @param Socket Namespace
     * @param Redis Instance
     */
    
    const args = [Queues, socketEmit, findEmit, liveDataClients, redisInstances.redisMaster];
    ([fixtureEmitter, livescoreEmitter, marketsEmitter]).map(emtter => emtter(...args));
}

