<?php

/**
 * 
 * This File will update all markets
 * based from the updates on database.
 */


ini_set('display_errors', '1');
error_reporting(E_ALL);

$host = '192.168.10.8';
$db   = 'r444_ruby';
$user = 'app_r444';
$pass = 'dWfZJ2nk7sQYBb9LmB7gF';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {

    // SQL Corresponded by the file name
    $sqls = [
        "SELECT * FROM market_live" => __DIR__ . '/ws/build/files/markets.json',
        "SELECT * FROM sports_periods" => __DIR__ . '/ws/build/files/sports_periods.json'
    ];

    $pdo = new PDO($dsn, $user, $pass, $options);
    foreach ($sqls as $sql => $file) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute();

        $data = $stmt->fetchAll();

        /**
         * Remove spaces and new lines
         */
        // foreach ($data as $k => $item) foreach ($item as $kk => $inner_item) $data[$k][$kk] = trim($inner_item);

        if (file_exists($file)) {
            file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            echo sprintf("File has been updated.[%s]" . PHP_EOL, $file);
        } else {
            echo sprintf("File does not exists %s", $file);
            continue;
        }
    }

    $pdo = null;
    exit;
} catch (\PDOException $e) {
    throw new \PDOException($e->getMessage(), (int)$e->getCode());
}


?>