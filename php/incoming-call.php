<?php
// incoming-call.php
header('Content-Type: text/xml');
require_once 'config.php';
require_once 'db.php';

// SAP Integration
if (SAP_ENABLED) {
    require_once 'sap_customers.php';
    require_once 'sap_cache_manager.php';
    require_once 'sap_error_handler.php';
}

$callId = $_GET['callId'] ?? 'unknown_' . time();
$callerPhone = $_POST['From'] ?? null; // Twilio provides caller's phone number
$pdo = getDbConnection();

// NEW: Lookup customer in SAP
$customer = null;
if (SAP_ENABLED && $callerPhone) {
    try {
        $customer = getSAPCustomerByPhone($callerPhone);
        if ($customer) {
            error_log("SAP: Customer recognized - {$customer['name']} from {$customer['company']}");
        }
    } catch (Exception $e) {
        error_log("SAP Customer Lookup Failed: " . $e->getMessage());
        // Continue with generic greeting
    }
}

// Build personalized context if customer found
$systemContext = SYSTEM_CONTEXT;
if ($customer) {
    $systemContext .= "\n\nCUSTOMER INFORMATION:";
    $systemContext .= "\n- Name: {$customer['name']}";
    $systemContext .= "\n- Company: {$customer['company']}";
    $systemContext .= "\n- Customer ID: {$customer['id']}";

    if (!empty($customer['last_order_date'])) {
        $systemContext .= "\n- Last Order: {$customer['last_order_date']}";
    }

    if (!empty($customer['preferred_products'])) {
        $products = is_array($customer['preferred_products'])
            ? implode(', ', $customer['preferred_products'])
            : $customer['preferred_products'];
        $systemContext .= "\n- Usually Orders: $products";
    }

    $systemContext .= "\n\nIMPORTANT: Greet this customer PERSONALLY using their name and company name!";
}

// Initialize conversation
$userPrompt = $customer
    ? "The call just connected. Greet {$customer['name']} from {$customer['company']} personally and warmly. " .
    (!empty($customer['last_order_date']) ? "Mention their last order was on {$customer['last_order_date']}. " : "") .
    "Ask how you can help them today."
    : 'The call just connected. Say EXACTLY this greeting and nothing more: "Hi, I am Sarah calling from US Food Supplies, customer sales department. Can I know if I am speaking with the manager?"';

$conversation = [
    ['role' => 'system', 'content' => $systemContext],
    ['role' => 'user', 'content' => $userPrompt]
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

// Save to Database (Primary) or File (Fallback)
if ($pdo) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO call_logs 
            (call_sid, sap_customer_id, user_phone, created_at, conversation, status) 
            VALUES (:sid, :sap_id, :phone, NOW(), :conv, 'ongoing')
        ");
        $stmt->execute([
            ':sid' => $callId,
            ':sap_id' => $customer ? $customer['id'] : null,
            ':phone' => $callerPhone,
            ':conv' => json_encode($conversation)
        ]);
    } catch (Exception $e) {
        error_log("DB Error in incoming-call: " . $e->getMessage());
        // Fallback to file if DB fails
        file_put_contents(__DIR__ . "/storage/call_{$callId}.json", json_encode($conversation));
    }
} else {
    // Fallback to file
    file_put_contents(__DIR__ . "/storage/call_{$callId}.json", json_encode($conversation));
}

// Clean up text for speech
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