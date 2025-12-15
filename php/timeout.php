<?php
// timeout.php
header('Content-Type: text/xml');
require_once 'config.php';

$callId = $_GET['callId'] ?? null;
if (!$callId) {
    echo '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
    exit;
}

$storageFile = __DIR__ . "/storage/call_{$callId}.json";
$conversation = [];
if (file_exists($storageFile)) {
    $conversation = json_decode(file_get_contents($storageFile), true);
}

// Check attempt count
// (In a real app, store attempt count specifically. Here checking length of conversation as proxy or just hardcoding simple retry logic)
// Let's rely on a session file for attempt or just stateless "Are you there?"

$attempts = $_GET['attempts'] ?? 0;
$attempts = intval($attempts) + 1;

echo '<?xml version="1.0" encoding="UTF-8"?>';
?>
<Response>
    <?php if ($attempts < 3): ?>
        <Gather input="speech" action="process-speech.php?callId=<?php echo htmlspecialchars($callId); ?>" method="POST"
            timeout="5">
            <Say voice="alice" language="en-US">Are you still there?</Say>
        </Gather>
        <Redirect>timeout.php?callId=<?php echo htmlspecialchars($callId); ?>&amp;attempts=<?php echo $attempts; ?>
        </Redirect>
    <?php else: ?>
        <Say voice="alice" language="en-US">I am hanging up now. Goodbye.</Say>
        <Hangup />
    <?php endif; ?>
</Response>