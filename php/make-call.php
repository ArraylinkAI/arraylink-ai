<?php
// make-call.php
header('Content-Type: application/json');
require_once 'config.php';

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);
$phoneNumber = $input['phoneNumber'] ?? null;

if (!$phoneNumber) {
    echo json_encode(['error' => 'Phone number is required']);
    exit;
}

// Twilio Credentials
$sid = getenv('TWILIO_ACCOUNT_SID');
$token = getenv('TWILIO_AUTH_TOKEN');
$fromNumber = getenv('TWILIO_PHONE_NUMBER');

if (!$sid || !$token || !$fromNumber) {
    echo json_encode(['error' => 'Server configuration error: Missing Twilio credentials']);
    exit;
}

// Construct Webhook URL
// Assuming the script is at /php/make-call.php, we want /php/incoming-call.php
$protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
$host = $_SERVER['HTTP_HOST'];
// If host is localhost, we might need a tunnel, but for Hostinger it will be the domain
// For the callback, we point to our incoming-call.php
$webhookUrl = "$protocol://$host/php/incoming-call.php";

// Make request to Twilio API
$url = "https://api.twilio.com/2010-04-01/Accounts/$sid/Calls.json";
$data = [
    'Url' => $webhookUrl . '?callId=' . uniqid('call_'), // Add callId parameter for tracking
    'To' => $phoneNumber,
    'From' => $fromNumber,
    'StatusCallback' => "$protocol://$host/php/call-status.php", // Optional status callback
    'StatusCallbackEvent' => ['initiated', 'ringing', 'answered', 'completed'],
    'Method' => 'POST'
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
curl_setopt($ch, CURLOPT_USERPWD, "$sid:$token");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode >= 200 && $httpCode < 300) {
    $responseData = json_decode($response, true);
    echo json_encode([
        'success' => true,
        'message' => 'Call initiated successfully',
        'callSid' => $responseData['sid'] ?? 'unknown'
    ]);
} else {
    error_log("Twilio Error: " . $response);
    echo json_encode([
        'error' => 'Failed to initiate call',
        'details' => $response
    ]);
}
?>
