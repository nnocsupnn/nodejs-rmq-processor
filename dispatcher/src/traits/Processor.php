<?php


declare(strict_types=1);

namespace RMQ\Traits;


trait Processor {

    use Pusher;
    use TelegramBot;

    protected $previouslyDisconnected;

    /**
     * Consumer 
     */
    protected function rmqConsumer($connection, $redis, $package) {
        dump('Consuming Inplay..');
        $channel = $connection->channel();
        $channel->basic_qos(null, 1000, false);
        $channel->basic_consume($package, 'consumer', false, true, false, false, function ($msg) use ($redis) {
            $this->addToQueues($redis, $msg);
        });

        dump('Connected ..');
        if ($this->previouslyDisconnected) {
            $this->sendNotification($this->generateMessageFormat("⚙️ Service has been recovered.", 'info', [
                'STATUS' => ' 🟢 Succesfuly Reconnected!'
            ]));
        }

        while (count($channel->callbacks)) {
            try {
                $channel->wait();
            } catch (\Exception $e) {
                // Suppose $e is \ErrorException with "errno=32" or "Broken pipe" in message
                $connection->reconnect();

                $this->previouslyDisconnected = true;

                $this->sendNotification($this->generateMessageFormat('🛠 ' . $e->getMessage(), 'error', [
                    'STATUS' => '🟠 Reconnecting'
                ]));

                // through all of this, $this->amqpConnection->isConnected() remains true
                // Errors with PhpAmqpLib\Exception\AMQPProtocolConnectionException: CHANNEL_ERROR - expected 'channel.open'
                $this->rmqConsumer($connection, $redis, $package);

                $this->previouslyDisconnected = false;
            }
        }
    }

    private function addToQueues($redis, $msg) {
        try {
            $bodyMsg = preg_replace('/\WId\W{2}(\d{10,})/i', '"Id":"$2${1}"', $msg->body);

            $decodedJson = \json_decode($bodyMsg);
            $hType = $decodedJson->Header->Type ?? 0;
            $decodedJson->is_auto = true;
            $bodyMsg = json_encode($decodedJson);

            $isPushed = false;
            $method = env_vars('METHOD');
            $keys = explode(",", env_vars('KEYS'));
            switch ($method) 
            {
                case 'publish':
                    foreach ($keys as $x => $list) $redis->publish($list, $bodyMsg);
                    $isPushed = true;
                    break;

                case 'push':
                    foreach ($keys as $x => $list) $redis->lPush($list, $bodyMsg);
                    $isPushed = true;
                    break;

                default:
                    foreach ($keys as $x => $list) $redis->lPush($list, $bodyMsg);
                    $isPushed = true;
                    break;
            }

            if ($isPushed) dump("Queue added (Type: $hType)");

            if (env_vars('DEBUG') === 'true') {
                if (!$this->checkJson($bodyMsg)) {
                    throw new \Exception($bodyMsg);
                }
            }
        } catch (\Exception $e) {
            $this->sendNotification($this->generateMessageFormat('🛠 ' . $e->getMessage(), 'error'));
            return;
        }
    }


    private function checkJson ($string) {
        json_decode($string);
        return (json_last_error() === JSON_ERROR_NONE);
    }
}