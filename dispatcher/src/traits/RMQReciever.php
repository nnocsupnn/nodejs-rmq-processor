<?php

declare(strict_types=1);

namespace RMQ\Traits;

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;
use DB;

trait RMQReciever 
{
    use Processor;
    use TelegramBot;

    protected function connectRmq($redis, $type = 'inplay') 
    {   
        dump("Connecting ..");
        try {
            switch ($type) {
                case 'inplay':
                    dump("Connecting to $type");
                    $connection = new AMQPStreamConnection(env_vars('RMQ_HOST'), env_vars('RMQ_PORT'), env_vars('RMQ_USER'), env_vars('RMQ_PASS'), "Customers", false, 'AMQPLAIN', null, env_vars('RMQ_LOCALE'), 1160, 1160, null, false, 580);
                    $this->rmqConsumer($connection, $redis, env_vars('RMQ_PACKAGE')); 
                    break;

                default:
                    throw new \Exception('Invalid type.');
                    break;
            }
        } catch (\Exception $e) {
            $this->sendNotification($this->generateMessageFormat('🛠 ' . $e->getMessage(), 'error'));
            dd($e->getMessage());
        }
    }
}