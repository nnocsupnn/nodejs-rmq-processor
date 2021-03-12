<?php

declare(strict_types=1);

namespace RMQ\Traits;

trait Pusher {
    /**
     * 
     * Methods
     */
    public function push() {
        list($redisp, $params) = \func_get_args();
        list($queuename, $message) = $params;

        try {
            if ($redisp->lPush($queuename, $message) === false) {
                throw new \Exception('Cannot push to queue. ' . $queuename);
            } else {
                dump("queue-added:" . \strlen($message));
            }
        } catch (\Exception $e) {
            die($e->getMessage());
        }
    }

    public function publish() {
        list($redisp, $params) = \func_get_args();
        list($queuename, $message) = $params;

        try {
            if ($redisp->publish($queuename, $message) === false) {
                throw new \Exception('Cannot push to queue. ' . $queuename);
            } else {
                dump("queue-publish:" . \strlen($message));
            }
        } catch (\Exception $e) {
            die($e->getMessage());
        }
    }
}


?>