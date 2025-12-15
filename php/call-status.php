<?php
// call-status.php
require_once 'config.php';

$input = $_POST;
$sid = $input['CallSid'] ?? 'unknown';
$status = $input['CallStatus'] ?? 'unknown';

file_put_contents(__DIR__ . '/storage/call_status.log', date('Y-m-d H:i:s') . " - SID: $sid - Status: $status\n", FILE_APPEND);

echo "OK";
?>