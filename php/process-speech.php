<?php
// process-speech.php
header('Content-Type: text/xml');
require_once 'config.php';

$callId = $_GET['callId'] ?? null;
$speechResult = $_POST['SpeechResult'] ?? '';

if (!$callId) {
    echo '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
    exit;
}

$storageFile = __DIR__ . "/storage/call_{$callId}.json";
$conversation = [];

// Load existing history
if (file_exists($storageFile)) {
    $conversation = json_decode(file_get_contents($storageFile), true);
} else {
    // Should not happen if incoming-call worked, but fallback
    $conversation = [['role' => 'system', 'content' => SYSTEM_CONTEXT]];
}

// Add User Input
if (!empty($speechResult)) {
    $conversation[] = ['role' => 'user', 'content' => $speechResult];
}

// Call OpenAI
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
    'max_tokens' => 150,
    'temperature' => 0.3
]));

$response = curl_exec($ch);
$data = json_decode($response, true);
curl_close($ch);

$aiResponseText = "I'm sorry, I didn't catch that. Could you repeat?";

if (isset($data['choices'][0]['message']['content'])) {
    $aiResponseText = $data['choices'][0]['message']['content'];
    $conversation[] = ['role' => 'assistant', 'content' => $aiResponseText];

    // Check if call should end
    // Use heuristic or ask LLM to output a stop token. 
    // For now, if "Goodbye" or "Have a great day" is in the start, we might hang up.
    // But let's keep it simple: always gather unless it clearly looks like an ending.
}

// Save history
file_put_contents($storageFile, json_encode($conversation));

$speakText = str_replace('*pause*', ' ', $aiResponseText);

echo '<?xml version="1.0" encoding="UTF-8"?>';
?>
<Response>
    <Gather input="speech" action="process-speech.php?callId=<?php echo htmlspecialchars($callId); ?>" method="POST"
        timeout="2" speechTimeout="auto">
        <Say voice="alice" language="en-US"><?php echo htmlspecialchars($speakText); ?></Say>
    </Gather>
    <Redirect>timeout.php?callId=<?php echo htmlspecialchars($callId); ?></Redirect>
</Response>