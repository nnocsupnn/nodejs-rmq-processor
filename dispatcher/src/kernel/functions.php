<?php


use RMQ\Kernel\Database;
use Symfony\Component\Dotenv\Dotenv;

use Predis\Client as PredisClient;

function loadEnvironment () {
    $files = array_filter(scandir(dirname(dirname(__DIR__))), function ($node) {
        return strpos($node, 'env') && !strpos($node, '.example');
    });

    foreach ($files as $k => $env) {
        $file = dirname(dirname(__DIR__)) . DIRECTORY_SEPARATOR . $env;
        $env = new Dotenv;
        $env->load($file);
    } 
    
    $isDebug = env_vars('DEBUG');
    $withDB = env_vars('WITH_DB');

    if ($isDebug == "true") {
        ini_set('display_errors', '1');
        error_reporting(E_ALL);
    } else {
        ini_set('display_errors', '0');
        error_reporting(E_ERROR);
    }

    
    if ($withDB == "true") {
        dump("[x] DB Loaded");
        (new Database)::load();
    }
}

function env_vars ( $name = null ) {
    return isset($_ENV[$name]) ? $_ENV[$name] : $_ENV;
}

function getExpiration ($string) {
    list($number, $type) = explode("-", $string);
    $types = array(
        'y' => 'year',
        'm' => 'month',
        'd' => 'day',
        's' => 'second',
        'mm' => 'minute',
        'h' => 'hour',
        'w' => 'week'
    );

    $expiration = $types[$type];
    return "+$number $expiration";
}


function mergeData($main, $update) {
    $merged_array = array();

    foreach ($main['markets'] as $k => $marketVal) {
        if (!empty($update['markets'][$k])) {

            $arr1 = $main['markets'][$k]['values'];
            $arr2 = $update['markets'][$k]['values'];
            
            foreach ($arr2 as $kk => $updateMarket) {
                foreach ($updateMarket as $kkk => $_market) {
                    if (!empty($_market)) $main['markets'][$k]['values'][$kk][$kkk] = $_market;
                }
            }

            return $main;

        } else {
            $main['markets'] = [
                $k => $marketVal
            ];
        }
    }
}


function cleanString($string) {
    preg_match_all('/(\d+.\d+)/', (string) $string, $result);

    if (empty($result[0]) || empty($result[0][0])) {
        $string = "VS";
    } else {
        $string = str_replace(".", "_", current(current($result)));
    }

    return $string;
}

function cleanCliArgs ($args):array {
    unset($args[0]);
    $opts = [];
    foreach ($args as $k => $request) {
        if (strpos($request, '=') === -1) {
            dd('Invalid paramter provided.');
        } else {
            list($k, $v) = explode("=", $request);
            $opts[$k] = $v;
        }
    }

    return $opts;
}

function toObj($arr) {
    return (object) $arr;
}



function getJsonFiles() {
    $jsons = scandir(FILES_PATH);
    $allowed_extensions = ['json'];
    $file_data = [];
    foreach ($jsons as $k => $file) {
        if (!in_array($file, ['.', '..'])) {
            if (!file_exists(FILES_PATH . $file)) continue;
            list($filename, $ext) = explode(".", $file);
            if (!in_array($ext, $allowed_extensions)) continue;
            $file_data[$filename] = json_decode(file_get_contents(FILES_PATH . $file), true);
        }
    }

    return $file_data;
}



function getRedisConnection() {

    $connection = "tcp://" . env_vars('REDIS_HOST') . ':' . env_vars('REDIS_PORT');
    $options = [
        'replication' => 'sentinel',
        'parameters' => [
            'password' => env_vars('REDIS_PASS') ?? null
        ],
    ];

    
    dump("[*] CTRL+C to exit process.");
    dump("[x] Connecting ..");
    # Redis
    $redis = new PredisClient($connection, $options);

    return $redis;
}




