<?php
// config.php

// Prevent direct access
if (basename($_SERVER['PHP_SELF']) == basename(__FILE__)) {
    header("HTTP/1.0 404 Not Found");
    exit;
}

// Simple .env parser to avoid Composer dependencies
function loadEnv($path) {
    if (!file_exists($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }

        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);

        if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
            putenv(sprintf('%s=%s', $name, $value));
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }
}

// Load .env from parent directory
loadEnv(__DIR__ . '/../.env');

// Error reporting for debugging (turn off in production if needed, but useful for now)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// System Context
if (!defined('SYSTEM_CONTEXT')) {
    define('SYSTEM_CONTEXT', "You are Sarah, a friendly and professional sales representative from US Food Supplies. 
    ROLE: You are calling hotel managers to remind them about restocking orders and take new orders conversationally. You are calm, friendly, helpful, and never pushy.
    IMPORTANT: We operate in the United States and use the Imperial measurement system (oz, lbs, fl oz, gallons).
    YOUR OBJECTIVES:
    1. Introduce yourself and confirm you're speaking with the manager.
    2. Remind them about restocking needs.
    3. Take orders for breakfast supplies.
    4. ALWAYS ASK for quantities.
    5. Be helpful and professional.
    Keep responses short and conversational.");
}
?>
