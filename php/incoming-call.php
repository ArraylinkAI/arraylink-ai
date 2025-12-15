<?php
// incoming-call.php
header('Content-Type: text/xml');
require_once 'config.php';

$callId = $_GET['callId'] ?? 'unknown_' . time();
$storageFile = __DIR__ . "/storage/call_{$callId}.json";

// Initialize conversation
$conversation = [
    ['role' => 'system', 'content' => SYSTEM_CONTEXT],
    ['role' => 'user', 'content' => 'The call just connected. Say EXACTLY this greeting and nothing more: "Hi, I am Sarah calling from US Food Supplies, customer sales department. Can I know if I am speaking with the manager [manager name]?" - Replace [manager name] with the actual manager name or just "Manager" if unknown.']
];

// Call OpenAI for initial greeting
$openAiKey = getenv('OPENAI_API_KEY');
$model = getenv('OPENAI_LIVE_MODEL') ?: 'gpt-4o-mini';

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $openAiKey",
    "Content-Type: application/json"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model' => $model,
    'messages' => $conversation,
    'max_tokens' => 100,
    'temperature' => 0.3
]));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$aiResponseText = "Hello? This is Sarah from US Food Supplies."; // Fallback

if ($httpCode === 200) {
    $data = json_decode($response, true);
    if (isset($data['choices'][0]['message']['content'])) {
        $aiResponseText = $data['choices'][0]['message']['content'];
        // Remove the instruction message and add the actual assistant response for history
        array_pop($conversation);
        $conversation[] = ['role' => 'assistant', 'content' => $aiResponseText];
    }
} else {
    error_log("OpenAI Error in incoming-call: " . $response);
}

// Save conversation state
file_put_contents($storageFile, json_encode($conversation));

// Clean up text for speech (remove *pause* markers if any, though simple <Say> handles text well)
$speakText = str_replace('*pause*', ' ', $aiResponseText);

// Generate TwiML
echo '<?xml version="1.0" encoding="UTF-8"?>';
?>
<Response>
    <Gather input="speech" action="process-speech.php?callId=<?php echo htmlspecialchars($callId); ?>" method="POST"
        timeout="3" speechTimeout="auto">
        <Say voice="alice" language="en-US"><?php echo htmlspecialchars($speakText); ?></Say>
    </Gather>
    <Redirect>timeout.php?callId=<?php echo htmlspecialchars($callId); ?></Redirect>
</Response>