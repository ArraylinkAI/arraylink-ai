<?php
// process-speech.php
header('Content-Type: text/xml');
require_once 'config.php';
require_once 'db.php';

// SAP Integration
if (SAP_ENABLED) {
    require_once 'sap_products.php';
    require_once 'sap_orders.php';
    require_once 'sap_customers.php';
    require_once 'sap_cache_manager.php';
    require_once 'sap_error_handler.php';
}

$callId = $_GET['callId'] ?? null;
$speechResult = $_POST['SpeechResult'] ?? '';
$pdo = getDbConnection();

if (!$callId) {
    echo '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
    exit;
}

$conversation = [];
$loadedFromDb = false;

// 1. Try Load from DB
if ($pdo) {
    try {
        $stmt = $pdo->prepare("SELECT conversation, sap_customer_id FROM call_logs WHERE call_sid = :sid LIMIT 1");
        $stmt->execute([':sid' => $callId]);
        $row = $stmt->fetch();
        if ($row && !empty($row['conversation'])) {
            $conversation = json_decode($row['conversation'], true);
            $loadedFromDb = true;
            $sapCustomerId = $row['sap_customer_id'] ?? null;
        }
    } catch (Exception $e) {
        error_log("DB Read Error: " . $e->getMessage());
    }
}

// 2. Fallback Load from File
if (empty($conversation)) {
    $storageFile = __DIR__ . "/storage/call_{$callId}.json";
    if (file_exists($storageFile)) {
        $conversation = json_decode(file_get_contents($storageFile), true);
    } else {
        $conversation = [['role' => 'system', 'content' => SYSTEM_CONTEXT]];
    }
}

// Add User Input
if (!empty($speechResult)) {
    $conversation[] = ['role' => 'user', 'content' => $speechResult];
}

// SAP INTEGRATION: Intelligent Intent Detection and Context Injection
$sapContext = '';
if (SAP_ENABLED && !empty($speechResult)) {

    // INTENT 1: Product/Inventory Inquiry
    if (isProductInquiry($speechResult)) {
        $productName = extractProductName($speechResult);

        if ($productName) {
            try {
                $customerId = $sapCustomerId ?? getCustomerIdFromCall($callId);
                $inventory = checkSAPInventory($productName, $customerId);

                if ($inventory && $inventory['available']) {
                    $sapContext .= "\n\n[REAL-TIME SAP INVENTORY DATA]:";
                    $sapContext .= "\n- Product: {$inventory['name']}";
                    $sapContext .= "\n- In Stock: {$inventory['quantity']} {$inventory['unit']}";
                    $sapContext .= "\n- Price: \${$inventory['price']} per {$inventory['unit']}";
                    $sapContext .= "\n- Location: {$inventory['warehouse']}";
                    $sapContext .= "\n\nIMPORTANT: Use these EXACT numbers in your response! Tell the customer we have it in stock.";
                } else {
                    $sapContext .= "\n\n[SAP INVENTORY]: Product '$productName' is currently OUT OF STOCK.";
                    $sapContext .= "\nIMPORTANT: Apologize and offer to check back or suggest alternatives.";
                }
            } catch (Exception $e) {
                $fallback = handleSAPError('inventory_check', $e, $callId, ['product' => $productName]);
                $sapContext .= "\n\n[SYSTEM]: " . $fallback['ai_instruction'];
            }
        }
    }

    // INTENT 2: Order Confirmation
    if (preg_match('/\b(i\'ll take|i want|order|yes.*(?:cases|dozen)|go ahead|confirmed)\b/i', $speechResult)) {
        $orderIntent = detectOrderIntent($conversation);

        if ($orderIntent && $orderIntent['confirmed']) {
            try {
                $customerId = $sapCustomerId ?? getCustomerIdFromCall($callId);

                if ($customerId && !empty($orderIntent['items'])) {
                    // Convert product names to material IDs
                    $sapItems = [];
                    foreach ($orderIntent['items'] as $item) {
                        $product = checkSAPInventory($item['product'], $customerId);
                        if ($product) {
                            $sapItems[] = [
                                'material_id' => $product['material_id'],
                                'quantity' => $item['quantity'],
                                'unit' => $item['unit']
                            ];
                        }
                    }

                    if (!empty($sapItems)) {
                        $sapOrder = createSAPOrder($customerId, $sapItems, $callId);

                        if ($sapOrder) {
                            $sapContext .= "\n\n[ORDER CREATED IN SAP]:";
                            $sapContext .= "\n- Order Number: {$sapOrder['orderNumber']}";
                            $sapContext .= "\n- Total Amount: \${$sapOrder['total']}";
                            $sapContext .= "\n- Delivery Date: {$sapOrder['deliveryDate']}";
                            $sapContext .= "\n- Status: {$sapOrder['status']}";
                            $sapContext .= "\n\nCRITICAL: Confirm this order number {$sapOrder['orderNumber']} to the customer! ";
                            $sapContext .= "Tell them the total, delivery date, and that they'll receive email confirmation.";
                        }
                    }
                }
            } catch (Exception $e) {
                $fallback = handleSAPError('order_creation', $e, $callId);
                $sapContext .= "\n\n[SYSTEM]: " . $fallback['ai_instruction'];
            }
        }
    }
}

// Inject SAP context into conversation before AI call
if (!empty($sapContext)) {
    $conversation[] = ['role' => 'system', 'content' => $sapContext];
    error_log("SAP Context injected: " . substr($sapContext, 0, 200));
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
}

// 3. Save History (DB Preferred)
$savedToDb = false;
if ($pdo) {
    try {
        // We use insert on duplicate key update or just update if we know it exists. 
        // Safer to just Update since incoming-call created it.
        // But if fallback created it, we might need Insert.
        // Let's try UPDATE first.
        $stmt = $pdo->prepare("UPDATE call_logs SET conversation = :conv, duration = duration + 10 WHERE call_sid = :sid");
        $stmt->execute([
            ':conv' => json_encode($conversation),
            ':sid' => $callId
        ]);

        if ($stmt->rowCount() == 0 && !$loadedFromDb) {
            // Case where incoming-call failed to DB but worked to file, so we insert now
            $stmt = $pdo->prepare("INSERT INTO call_logs (call_sid, created_at, conversation, status) VALUES (:sid, NOW(), :conv, 'ongoing')");
            $stmt->execute([
                ':sid' => $callId,
                ':conv' => json_encode($conversation)
            ]);
        }
        $savedToDb = true;
    } catch (Exception $e) {
        error_log("DB Write Error: " . $e->getMessage());
    }
}

// 4. Fallback Save to File (Always valid backup if DB fails)
if (!$savedToDb) {
    $storageFile = __DIR__ . "/storage/call_{$callId}.json";
    file_put_contents($storageFile, json_encode($conversation));
}

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