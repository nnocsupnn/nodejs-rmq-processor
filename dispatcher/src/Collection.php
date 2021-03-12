<?php

namespace RMQ;

use Redis;
/**
 * Collection constructor
 */
class Collection {
    use \RMQ\Traits\RMQReciever;
    use \RMQ\Traits\TelegramBot;

    public function __construct() {
        define(FIXTURES_LIST_KEY, 'fixtures' . date('_ymd'));
        define(FILES_PATH, __DIR__ . '/files/');
        define(PUBSUB_CHANNEL, env_vars('PUBSUB_CHANNEL'));
    }

    public function start() {
        try
        {
            $redisp = new Redis();

            /**
             * Initiate Connection
             */
            $redisp->connect(env_vars('REDIS_HOST'), env_vars('REDIS_PORT'));

            /**
             * Authenticate redis connection
             */
            if ($redisp->auth(env_vars('REDIS_PASS')) === false) {
                throw new \Exception('Redis authentication failed!');
            }
            /**
             * DB redis selection
             */
            $select_result = $redisp->select(env_vars('REDIS_DB'));
            if (!$select_result) {
                throw new \RuntimeException('Can not select the database');
            }
            /**
             * Start consuming
             */

            if (!$opts['type']) {
                $opts['type'] = 'inplay';
            } 

            echo "Credential Set: " . env_vars('RMQ_USER') . PHP_EOL . "Package: " . env_vars('RMQ_PACKAGE') . PHP_EOL;

            $this->connectRmq($redisp, $opts['type']);
        } catch (\Exception $e)
        {
            echo $e->getMessage() . PHP_EOL;
            $this->sendNotification($this->generateMessageFormat('🛠 ' . $e->getMessage(), 'error'));
            exit;
        }
    }
}