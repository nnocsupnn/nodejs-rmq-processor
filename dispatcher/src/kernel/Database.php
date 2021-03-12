<?php

namespace RMQ\Kernel;

use Illuminate\Database\Capsule\Manager;
use Illuminate\Events\Dispatcher;
use Illuminate\Container\Container;
use Framework\Kernel\Router;
use \PDOException;


class Database {
    public static $config;
    public function __construct () {
        Database::$config = [
            'driver'    => env_vars('DB_DRIVER'),
            'host'      => env_vars('DB_HOST'),
            'database'  => env_vars('DB_NAME'),
            'username'  => env_vars('DB_USER'),
            'password'  => env_vars('DB_PASS'),
            'charset'   => env_vars('DB_CHARSET'),
            'collation' => env_vars('DB_COLLATION'),
            'prefix'    => env_vars('DB_PREFIX')
        ];
    }

    public static function load () {
        try {
            $db = new Manager;
            $db->addConnection(Database::$config, 'default');

            $db->setEventDispatcher(new Dispatcher(new Container));
            $db->setAsGlobal();
            $db->bootEloquent();

        } catch (PDOException $e) {
            print($e->getMessage());
            exit;
        }
    }
}