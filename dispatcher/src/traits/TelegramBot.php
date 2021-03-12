<?php

declare(strict_types=1);

namespace RMQ\Traits;

use \unreal4u\TelegramAPI\HttpClientRequestHandler;
use \unreal4u\TelegramAPI\TgLog;
use \unreal4u\TelegramAPI\Telegram\Methods\SendMessage;
use \React\EventLoop\Factory;

trait TelegramBot {
    protected function sendNotification($msg = 'Message not set.') 
    {
        try
        {
            $loop = Factory::create();
            $handler = new HttpClientRequestHandler($loop);
            $tgLog = new TgLog(env_vars('BOT_TOKEN'), $handler);

            $sendMessage = new SendMessage([
                'parse_mode' => 'markdown'
            ]);
            $sendMessage->chat_id = env_vars('CHAT_ID');
            $sendMessage->text = $msg;
            $sendMessage->parse_mode = 'markdown';

            $promise = $tgLog->performApiRequest($sendMessage);

            $promise->then(
                function ($response) {
                    //
                },
                function (\Exception $exception) {
                    // Onoes, an exception occurred...
                    echo 'Exception ' . get_class($exception) . ' caught, message: ' . $exception->getMessage();
                }
            );

            $loop->run();

            echo "Notification was sent." . PHP_EOL;
            return true;
        }
        catch (\Exception $e)
        {
            echo $e->getMessage();
            return false;
        }
    }


    protected function generateMessageFormat($message, $type = 'info', ...$args)
    {
        $returnMessage = $message;
        $server = gethostname();
        $date = date('Y-m-d H:i:s');
        switch ($type)
        {
            case 'info':
                $returnMessage = "*$server*\n`[$date]`\n\n✅ *Message:*\n\n`". $message ."`";
                break;

            case 'error':
                $returnMessage = "*$server*\n`[$date]`\n\n❌ *Exception Message:*\n\n`". $message ."`";
                break;

            default:
                return $returnMessage;
                break;
        }

        foreach ($args as $k => $arg) {
            foreach ($arg as $kk => $v) $returnMessage .= "\n\n*$kk*: `$v`";
        }

        return $returnMessage;
    }
}