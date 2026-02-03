<?php
// php/db.php
require_once 'config.php';

function getDbConnection()
{
    // Get credentials from .env (loaded by config.php)
    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $db = getenv('DB_NAME');
    $user = getenv('DB_USER');
    $pass = getenv('DB_PASS');
    $charset = 'utf8mb4';

    if (!$db || !$user) {
        // Fallback for when .env is not set up yet
        return null;
    }

    $dsn = "mysql:host=$host;dbname=$db;charset=$charset";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    try {
        return new PDO($dsn, $user, $pass, $options);
    } catch (\PDOException $e) {
        // Log error to server logs, do not show password in browser
        error_log("Database Connection Error: " . $e->getMessage());
        return null;
    }
}
?>