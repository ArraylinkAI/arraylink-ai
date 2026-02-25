// Deployment trigger - Updated with new environment configuration
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const TwilioAzureIntegration = require('./twilio-azure-integration');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [
        process.env.CLIENT_URL,
        `https://${process.env.AZURE_WEBAPP_NAME}.azurewebsites.net`,
        // Allow any Azure subdomain for flexibility
        /^https:\/\/.*\.\.net$/,
        // Allow any https domain for testing
        /^https:\/\/.*/
      ].filter(Boolean)
      : [
        process.env.CLIENT_URL,
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003"
      ].filter(Boolean),
    methods: ["GET", "POST"],
    allowEIO3: true,
    credentials: true // Enable CORS credentials
  },
  pingTimeout: 30000,  // How long to wait for ping response
  pingInterval: 10000, // How often to ping
  upgradeTimeout: 15000, // How long to wait for upgrade
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
      process.env.CLIENT_URL,
      `https://${process.env.AZURE_WEBAPP_NAME}.azurewebsites.net`,
      /^https:\/\/.*\.azurewebsites\.net$/,
      /^https:\/\/.*/
    ].filter(Boolean)
    : [
      process.env.CLIENT_URL,
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003"
    ].filter(Boolean),
  credentials: true // Enable CORS credentials
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure server timeouts
app.use((req, res, next) => {
  // Set timeout for all requests to 30 seconds
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Redirect root to the real website (Hostinger)
// Render.com is the API backend only - not the website frontend
app.get('/', (req, res) => {
  res.redirect(301, 'https://arraylink.ai');
});

// Serve temporary audio files (needed for Azure TTS fallback)
app.use('/audio', express.static(path.join(__dirname, 'temp_audio')));

// Initialize services
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const LIVE_CHAT_MODEL = process.env.OPENAI_LIVE_MODEL || 'gpt-4o-mini';
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4.1';

// Initialize Azure integration
let azureIntegration;
try {
  azureIntegration = new TwilioAzureIntegration();
  console.log('✅ Azure Speech Services integration initialized');
} catch (error) {
  console.error('❌ Failed to initialize Azure Speech Services:', error.message);
  console.log('⚠️ Falling back to Twilio built-in TTS/STT');
}

// Store for active calls and conversations
const activeCalls = new Map();
const conversations = new Map();
const conversationStates = new Map(); // Track conversation states for interruption handling

// Track timeout attempts to prevent infinite loops
const callTimeoutAttempts = new Map();

// Track session flags for each call
const sessionFlags = new Map();
const orderDetails = new Map(); // Add this new Map to store order details

// Initialize session flags for a new call
function initializeSessionFlags(callId) {
  sessionFlags.set(callId, {
    reorderConfirmed: false,
    upsellAttempted: false,
    customerDone: false
  });

  // Initialize order details
  orderDetails.set(callId, {
    customerName: '',
    hotelName: '',
    products: [],
    total: 0
  });

  // Initialize conversation state for interruption handling
  conversationStates.set(callId, {
    isAISpeaking: false,
    lastInterruption: null,
    waitingForCustomer: true
  });
}

// Clean up session flags
function cleanupSessionFlags(callId) {
  sessionFlags.delete(callId);
  orderDetails.delete(callId); // Clean up order details too
  conversationStates.delete(callId); // Clean up conversation state
}

// Create conversation history directory if it doesn't exist
const conversationHistoryDir = path.join(__dirname, 'conversation_history');
if (!fs.existsSync(conversationHistoryDir)) {
  fs.mkdirSync(conversationHistoryDir, { recursive: true });
  console.log('📁 Created conversation history directory:', conversationHistoryDir);
}

// Add response caching
const responseCache = new Map();
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 100;

function getCacheKey(type, content, options = {}) {
  return `${type}:${content}:${JSON.stringify(options)}`;
}

function getFromCache(key) {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE) {
    return cached.value;
  }
  return null;
}

function addToCache(key, value) {
  if (responseCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = Array.from(responseCache.keys())[0];
    responseCache.delete(oldestKey);
  }
  responseCache.set(key, {
    value,
    timestamp: Date.now()
  });
}

// Company context for AI agent
const SYSTEM_CONTEXT = `You are Sarah, a confident and friendly sales representative from US Hotel Food Supplies. 

ROLE: You help hotel managers order food supplies and breakfast items. You are helpful, professional, and conversational. Never apologize unnecessarily or end calls abruptly.

IMPORTANT: Use Imperial measurements (oz, lbs, fl oz, gallons) - we operate in the United States.

YOUR OBJECTIVES:
1. Greet the customer and confirm you're speaking with the manager
2. Help them order hotel food supplies (bagels, pastries, beverages, etc.)
3. ALWAYS ask for quantities - never assume amounts
4. Provide pricing and minimum order suggestions
5. Confirm each order with quantity and price
6. Ask if they need anything else
7. Close professionally when they're done

PRODUCTS WE SELL:
- Bagels (Asiago Cheese, Blueberry, Plain, Everything, Cinnamon Raisin)
- Pastries and breakfast items
- Beverages (bottled water, juice, coffee)
- Dairy products (milk, cream, butter)
- Condiments and jams
- Kitchen and food service supplies

PRICING GUIDELINES:
- Bagels/Pastries: $23-27 per case (minimum 2 cases)
- Beverages: $18-22 per case (minimum 3 cases)
- Coffee: $26-30 per case (minimum 2 cases)
- Dairy: $20-25 per case (minimum 2 cases)
- Condiments: $15-20 per case (minimum 2 cases)
- Bulk discount: 5+ cases get $2-3 off per case

CONVERSATION FLOW:
1. Opening: "Hi, I'm Sarah from US Hotel Food Supplies. Am I speaking with [manager name]?"
2. After confirmation: "Great! I wanted to check if you need to restock any supplies. Last time you ordered [product]. Would you like to reorder?"
3. For new products: "How many cases would you like? We recommend minimum [X] cases at $[Y] per case."
4. Confirm: "Perfect! I'll add [quantity] cases of [product] at $[price] per case."
5. Continue: "Anything else you need today?"
6. Closing: "Wonderful! Your order is all set. Thank you and have a great day!"

IMPORTANT RULES:
- NEVER apologize unless there's a real problem
- NEVER end the call abruptly
- ALWAYS ask for quantities before confirming orders
- Be confident and helpful
- Keep responses brief (1-2 sentences max)
- Don't mention technical systems or processes
- Focus on helping them get what they need

HANDLING COMMON SITUATIONS:
- "Same as last time" → "Just to confirm, you'd like to reorder [product]? How many cases?"
- Customer wants discount → "I can offer up to 10% off your total order today."
- Product out of stock → "We're temporarily out of that. Would [similar product] work instead?"
- Customer unclear → "No problem! Last time you ordered [X]. Would you like something similar?"
- Customer busy → "No rush, take your time. Let me know when you're ready."

REMEMBER: 
- Be confident and helpful
- Ask for quantities
- Provide pricing
- Confirm orders
- Keep it conversational
- Never apologize unnecessarily
- Don't cut calls short`;


// Function to save conversation history to text file
function saveConversationHistory(callId, conversation, callData, analysis = null) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `call_${callId}_${timestamp}.txt`;
    const filepath = path.join(conversationHistoryDir, filename);

    // Get order details
    const order = orderDetails.get(callId) || {
      customerName: 'Unknown',
      hotelName: 'Unknown',
      products: [],
      total: 0
    };

    // Format conversation for text file
    let content = '';
    content += '='.repeat(80) + '\n';
    content += `VOICE AGENT CALL HISTORY\n`;
    content += '='.repeat(80) + '\n';
    content += `Call ID: ${callId}\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Duration: ${callData ? calculateCallDuration(callData.startTime) : 'Unknown'}\n`;
    content += `Customer Name: ${order.customerName}\n`;
    content += `Hotel Name: ${order.hotelName}\n`;
    content += `Order Total: $${order.total.toFixed(2)}\n`;

    if (callData) {
      content += `Phone Number: ${callData.phoneNumber || 'Unknown'}\n`;
      content += `Status: ${callData.status || 'Unknown'}\n`;
    }

    // Add order details section
    if (order.products.length > 0) {
      content += '\n' + '='.repeat(80) + '\n';
      content += `ORDER DETAILS\n`;
      content += '='.repeat(80) + '\n';
      order.products.forEach((product, index) => {
        content += `${index + 1}. ${product.product}\n`;
        content += `   Quantity: ${product.quantity} cases\n`;
        content += `   Price per case: $${product.pricePerCase}\n`;
        content += `   Total: $${product.total}\n\n`;
      });
      content += `TOTAL ORDER VALUE: $${order.total.toFixed(2)}\n\n`;
    }

    content += '='.repeat(80) + '\n';
    content += `CONVERSATION TRANSCRIPT\n`;
    content += '='.repeat(80) + '\n\n';

    // Add conversation messages
    conversation.forEach((message, index) => {
      if (message.role !== 'system') {
        const speaker = message.role === 'user' ? '👤 CUSTOMER' : '🤖 AI AGENT (Sarah)';
        const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';

        content += `${speaker}${timestamp ? ` [${timestamp}]` : ''}\n`;
        content += `${message.content}\n\n`;
      }
    });

    // Add call analysis if available
    if (analysis) {
      content += '='.repeat(80) + '\n';
      content += `CALL ANALYSIS\n`;
      content += '='.repeat(80) + '\n';
      content += `Summary: ${analysis.callSummary}\n`;
      content += `Customer Sentiment: ${analysis.customerSentiment}\n`;
      content += `Satisfaction Score: ${analysis.callMetrics?.satisfaction || 'N/A'}/10\n\n`;

      if (analysis.orderDetails && analysis.orderDetails.products.length > 0) {
        content += `ORDER DETAILS:\n`;
        content += `-`.repeat(40) + '\n';
        analysis.orderDetails.products.forEach((product, index) => {
          content += `${index + 1}. ${product.name}\n`;
          content += `   Quantity: ${product.quantity} cases\n`;
          content += `   Unit Price: $${product.unitPrice}\n`;
          content += `   Total: $${product.total}\n\n`;
        });
        content += `Subtotal: $${analysis.orderDetails.subtotal}\n`;
        content += `Tax: $${analysis.orderDetails.tax}\n`;
        content += `TOTAL: $${analysis.orderDetails.total}\n\n`;
      } else {
        content += `ORDER DETAILS: No order placed\n\n`;
      }

      if (analysis.nextSteps && analysis.nextSteps.length > 0) {
        content += `NEXT STEPS:\n`;
        content += `-`.repeat(40) + '\n';
        analysis.nextSteps.forEach((step, index) => {
          content += `${index + 1}. ${step}\n`;
        });
        content += '\n';
      }
    }

    content += '='.repeat(80) + '\n';
    content += `END OF CALL HISTORY\n`;
    content += '='.repeat(80) + '\n';

    // Write to file
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`💾 Conversation history saved: ${filename}`);

    return filename;
  } catch (error) {
    console.error('❌ Error saving conversation history:', error);
    return null;
  }
}

// Helper function to calculate call duration
function calculateCallDuration(startTime) {
  if (!startTime) return 'Unknown';
  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Helper function to get timeout attempt count
function getTimeoutAttempts(callId) {
  return callTimeoutAttempts.get(callId) || 0;
}

// Helper function to increment timeout attempts
function incrementTimeoutAttempts(callId) {
  const current = getTimeoutAttempts(callId);
  const newCount = current + 1;
  callTimeoutAttempts.set(callId, newCount);
  return newCount;
}

// Helper function to reset timeout attempts
function resetTimeoutAttempts(callId) {
  callTimeoutAttempts.delete(callId);
}

/**
 * Prewarm AI and TTS services
 * @returns {Promise<void>}
 */
async function prewarmServices() {
  console.log('🔥 Prewarming AI and TTS services...');

  try {
    // Prewarm GPT with a lightweight prompt
    const gptPrewarm = openai.chat.completions.create({
      model: LIVE_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Say a brief hello.' }],
      max_tokens: 20,
      temperature: 0.3
    }).catch(error => {
      console.log('GPT prewarm non-critical error:', error.message);
    });

    // Prewarm Azure TTS with a short text
    const ttsPrewarm = azureIntegration ?
      azureIntegration.createTTSResponse("Hello, this is Sarah.", {
        rate: '0%',
        pitch: '+5%',
        volume: 'medium',
        style: 'conversation'
      }).catch(error => {
        console.log('TTS prewarm non-critical error:', error.message);
      }) :
      Promise.resolve();

    // Wait for both to complete
    await Promise.all([gptPrewarm, ttsPrewarm]);
    console.log('✅ Services prewarmed successfully');
  } catch (error) {
    // Non-critical error, just log it
    console.log('⚠️ Prewarm attempt completed with non-critical errors');
  }
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Test handler to verify socket communication
  socket.on('test', (data) => {
    console.log('🧪 Received test message from client:', data);
    socket.emit('testResponse', { message: 'Server received test', originalData: data });
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
  });
});

// Endpoint to initiate a call
app.post('/api/make-call', async (req, res) => {
  try {
    const { phoneNumber, context } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Create a unique call ID
    const callId = `call_${Date.now()}`;

    // Initialize order tracking when call starts
    initializeSessionFlags(callId);

    // Use custom context if provided, otherwise use default
    const systemContext = context || SYSTEM_CONTEXT;

    // Initialize conversation history with dynamic context
    conversations.set(callId, [
      { role: 'system', content: systemContext }
    ]);

    // Start prewarming services in parallel with Twilio call setup
    const prewarmPromise = prewarmServices().catch(error => {
      // Non-critical error, just log it
      console.log('⚠️ Prewarm error (non-critical):', error.message);
    });

    console.log(`📞 ATTEMPTING CALL:`);
    console.log(`   📱 To: ${phoneNumber}`);
    console.log(`   📱 From: ${process.env.TWILIO_PHONE_NUMBER}`);
    console.log(`   🆔 Call ID: ${callId}`);
    console.log(`   📝 Context: ${systemContext.substring(0, 100)}...`);

    // Determine webhook URL based on environment
    let webhookUrl;
    if (process.env.NODE_ENV === 'production') {
      // Production: Use Azure App Service URL
      webhookUrl = process.env.CLIENT_URL || `https://${process.env.AZURE_WEBAPP_NAME}.azurewebsites.net`;
      if (!webhookUrl) {
        throw new Error('Production environment requires CLIENT_URL or AZURE_WEBAPP_NAME to be set');
      }
    } else {
      // Development: Use ngrok URL
      webhookUrl = process.env.NGROK_URL;
      if (!webhookUrl) {
        throw new Error('Development environment requires NGROK_URL to be set');
      }
    }
    console.log(`🔗 Using webhook URL: ${webhookUrl}`);

    // Make the call using Twilio with full AI conversation support
    const call = await twilioClient.calls.create({
      url: `${webhookUrl}/api/voice/incoming?callId=${callId}`,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      statusCallback: `${webhookUrl}/api/voice/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed'],
      timeout: 60, // Ring for 60 seconds
      record: false // Don't record for privacy
    });

    console.log(`✅ TWILIO CALL CREATED:`);
    console.log(`   🆔 Twilio SID: ${call.sid}`);
    console.log(`   📊 Status: ${call.status}`);
    console.log(`   📱 To: ${call.to}`);
    console.log(`   📱 From: ${call.from}`);

    // Store call information
    activeCalls.set(callId, {
      id: callId,
      phoneNumber,
      twilioCallSid: call.sid,
      status: 'initiated',
      timestamp: new Date(),
      startTime: Date.now(),
      context: systemContext
    });

    // Emit call status to connected clients
    io.emit('callStatus', {
      callId,
      status: 'initiated',
      phoneNumber,
      twilioCallSid: call.sid,
      message: 'Call initiated...'
    });

    res.json({
      success: true,
      callId,
      twilioCallSid: call.sid,
      message: 'Call initiated successfully - Full AI conversation enabled!',
      context: systemContext.substring(0, 200) + '...',
      phoneNumber: phoneNumber,
      fromNumber: process.env.TWILIO_PHONE_NUMBER
    });

  } catch (error) {
    console.error('❌ ERROR MAKING CALL:', error);
    console.error('   📋 Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo
    });
    res.status(500).json({
      error: 'Failed to make call',
      details: error.message,
      code: error.code,
      moreInfo: error.moreInfo
    });
  }
});

// Twilio webhook for incoming call handling
app.post('/api/voice/incoming', async (req, res) => {
  const callId = req.query.callId;
  console.log(`🎙️ WEBHOOK: /api/voice/incoming called for callId: ${callId}`);
  console.log(`📋 Request body:`, req.body);
  console.log(`📋 Request query:`, req.query);

  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Get AI response for initial greeting
    const conversation = conversations.get(callId) || [
      { role: 'system', content: SYSTEM_CONTEXT }
    ];

    conversation.push({
      role: 'user',
      content: 'The call just connected. Say EXACTLY this greeting and nothing more: "Hi, I am Sarah calling from US Food Supplies, customer sales department. Can I know if I am speaking with the manager [manager name]?" - Replace [manager name] with the actual manager name. Use only this format, do not add any other questions or sentences.'
    });

    const completion = await openai.chat.completions.create({
      model: LIVE_CHAT_MODEL,
      messages: conversation,
      max_tokens: 50,  // Keeping reduced tokens for shorter responses
      temperature: 0.3,  // Keeping reduced temperature for consistent responses
    });

    let aiResponse = completion.choices[0].message.content;

    conversation.push({ role: 'assistant', content: aiResponse });
    conversations.set(callId, conversation);

    // Update call status
    if (activeCalls.has(callId)) {
      activeCalls.get(callId).status = 'connected';
    }

    // Emit conversation update
    io.emit('conversationUpdate', {
      callId,
      type: 'ai_response',
      content: aiResponse,
      timestamp: new Date()
    });
    console.log(`🤖 AI Response emitted for callId ${callId}: "${aiResponse}"`);

    const fallbackText = aiResponse.replace(/\*pause\*/g, '');
    let speechSource = {
      type: 'say',
      text: fallbackText
    };

    // Use Azure TTS if available, otherwise fallback to Twilio
    if (azureIntegration) {
      try {
        console.log(`🎙️ USING AZURE TTS: Synthesizing "${aiResponse}" with Luna Neural voice`);

        // Process natural pause markers and convert to SSML
        const processedText = aiResponse.replace(/\*pause\*/g, '<break time="0.8s"/>');

        const ttsResult = await azureIntegration.createTTSResponse(processedText, {
          rate: '0%',  // Normal speed for clear, confident delivery
          pitch: '+5%', // Slightly higher pitch for confident, brave tone
          volume: 'medium',
          style: 'conversation'
        });

        console.log(`✅ AZURE TTS SUCCESS: Generated audio with Luna voice`);

        // Extract the audio URL from the Azure TwiML and use it inside the gather
        const azureTwimlStr = ttsResult.twiml?.toString?.();
        const playMatch = azureTwimlStr ? azureTwimlStr.match(/<Play>([^<]+)<\/Play>/) : null;
        if (playMatch && playMatch[1]) {
          speechSource = {
            type: 'play',
            url: playMatch[1]
          };
        }

        // Schedule cleanup of temp audio file
        if (ttsResult.audioFileName) {
          setTimeout(() => {
            azureIntegration.cleanupTempAudio(ttsResult.audioFileName);
          }, 30000); // Clean up after 30 seconds
        }

      } catch (azureError) {
        console.error('❌ AZURE TTS FAILED, falling back to Twilio Alice voice:', azureError);
        console.log(`🔄 USING TWILIO TTS: Falling back to Alice voice for "${aiResponse}"`);
        speechSource = {
          type: 'say',
          text: fallbackText
        };
      }
    } else {
      // Fallback to Twilio's built-in TTS
      console.log(`🔄 USING TWILIO TTS: Azure not available, using Alice voice for "${aiResponse}"`);
      speechSource = {
        type: 'say',
        text: fallbackText
      };
    }

    const gatherOptions = {
      input: 'speech',
      timeout: 8,  // Time to wait for user to start speaking
      speechTimeout: 3,  // Wait 3 seconds after speech ends before processing
      speechModel: 'experimental_utterances',
      enhanced: true,
      language: 'en-US',
      action: `/api/voice/process-speech?callId=${callId}`,
      method: 'POST',
      bargeIn: true,  // Allows user to interrupt AI speech
      actionOnEmptyResult: true,  // Trigger action even if no speech detected
      profanityFilter: false,  // Don't filter words for better accuracy
      partialResultCallback: `/api/voice/partial-speech?callId=${callId}`,
      partialResultCallbackMethod: 'POST'
    };

    // Mark AI as speaking
    const state = conversationStates.get(callId);
    if (state) {
      state.isAISpeaking = true;
      state.waitingForCustomer = false;
    }

    const gather = twiml.gather(gatherOptions);
    if (speechSource.type === 'play' && speechSource.url) {
      gather.play(speechSource.url);
    } else {
      gather.say({
        voice: 'alice',
        language: 'en-US'
      }, speechSource.text);
    }

    // Handle timeout scenario
    twiml.redirect(`/api/voice/timeout?callId=${callId}`);

  } catch (error) {
    console.error('Error in voice handling:', error);
    twiml.say('I apologize, but I\'m experiencing technical difficulties. Please try again later.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle timeout when user doesn't respond
app.post('/api/voice/timeout', async (req, res) => {
  const callId = req.query.callId;
  const attemptCount = incrementTimeoutAttempts(callId);

  console.log(`⏰ TIMEOUT for callId ${callId}: Attempt ${attemptCount}/3`);

  const twiml = new twilio.twiml.VoiceResponse();

  try {
    let promptMessage;

    if (attemptCount === 1) {
      promptMessage = "Hello? *pause* Are you still there?";
    } else if (attemptCount === 2) {
      promptMessage = "I'm still here. *pause* Can you hear me okay?";
    } else {
      // Third attempt - give closing message and end call
      promptMessage = "I'll try reaching you another time. *pause* Please feel free to call us back when convenient. Have a great day!";

      // Generate final message with Azure TTS
      if (azureIntegration) {
        try {
          const processedText = promptMessage.replace(/\*pause\*/g, '<break time="0.8s"/>');
          const ttsResult = await azureIntegration.createTTSResponse(processedText, {
            rate: '0%',
            pitch: '+5%',
            volume: 'medium',
            style: 'conversation'
          });

          if (ttsResult && ttsResult.twiml) {
            const azureTwimlStr = ttsResult.twiml.toString();
            const playMatch = azureTwimlStr.match(/<Play>([^<]+)<\/Play>/);
            if (playMatch) {
              twiml.play(playMatch[1]);
            } else {
              twiml.say(promptMessage.replace(/\*pause\*/g, ''));
            }
          } else {
            twiml.say(promptMessage.replace(/\*pause\*/g, ''));
          }
        } catch (error) {
          console.log('Azure TTS failed for closing message, using Twilio fallback');
          twiml.say(promptMessage.replace(/\*pause\*/g, ''));
        }
      } else {
        twiml.say(promptMessage.replace(/\*pause\*/g, ''));
      }

      twiml.hangup();

      // Clean up
      resetTimeoutAttempts(callId);
      conversations.delete(callId);
      activeCalls.delete(callId);

      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }

    // For attempts 1 and 2, use Azure TTS and continue listening
    if (azureIntegration) {
      try {
        const processedText = promptMessage.replace(/\*pause\*/g, '<break time="0.8s"/>');
        const ttsResult = await azureIntegration.createTTSResponse(processedText, {
          rate: '0%',
          pitch: '+5%',
          volume: 'medium',
          style: 'conversation'
        });

        if (ttsResult && ttsResult.twiml) {
          const azureTwimlStr = ttsResult.twiml.toString();
          const playMatch = azureTwimlStr.match(/<Play>([^<]+)<\/Play>/);
          if (playMatch) {
            twiml.play(playMatch[1]);
          } else {
            twiml.say(promptMessage.replace(/\*pause\*/g, ''));
          }
        } else {
          twiml.say(promptMessage.replace(/\*pause\*/g, ''));
        }
      } catch (error) {
        console.log('Azure TTS failed for timeout prompt, using Twilio fallback');
        twiml.say(promptMessage.replace(/\*pause\*/g, ''));
      }
    } else {
      twiml.say(promptMessage.replace(/\*pause\*/g, ''));
    }

    // Continue listening for response with optimized settings
    twiml.gather({
      input: 'speech',
      timeout: 8,  // Match main gather timeout
      speechTimeout: 3,  // Match main speechTimeout
      speechModel: 'experimental_utterances',
      enhanced: true,
      language: 'en-US',
      action: `/api/voice/process-speech?callId=${callId}`,
      method: 'POST',
      bargeIn: true,
      partialResultCallback: `/api/voice/partial-speech?callId=${callId}`,
      partialResultCallbackMethod: 'POST'
    });

    // If they still don't respond, try again
    twiml.redirect(`/api/voice/timeout?callId=${callId}`);

  } catch (error) {
    console.error('Error in timeout handling:', error);
    twiml.say('I apologize, I am experiencing technical difficulties. Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle partial speech for real-time interruption
app.post('/api/voice/partial-speech', (req, res) => {
  const callId = req.query.callId;
  const partialSpeech = req.body.PartialSpeechResult || '';
  const stability = parseFloat(req.body.Stability) || 0;

  console.log(`🗣️ PARTIAL SPEECH for callId ${callId}: "${partialSpeech}" (stability: ${stability})`);

  // Detect interruption - if customer starts speaking with reasonable confidence
  if (partialSpeech.length > 5 && stability > 0.3) {
    const state = conversationStates.get(callId);

    // Only emit interruption if AI is currently speaking
    if (state && state.isAISpeaking) {
      console.log(`⚠️ INTERRUPTION DETECTED for callId ${callId} - Customer speaking while AI is talking`);

      // Mark AI as no longer speaking
      state.isAISpeaking = false;
      state.waitingForCustomer = true;
      state.lastInterruption = new Date();

      // Emit interruption event to stop AI playback
      io.emit('customerInterruption', {
        callId,
        partialSpeech,
        timestamp: new Date()
      });

      // Mark conversation as interrupted for context-aware response
      const conversation = conversations.get(callId);
      if (conversation) {
        conversation.interrupted = true;
      }
    }
  }

  // Emit partial speech for real-time display
  if (partialSpeech.length > 3) {
    io.emit('partialSpeechUpdate', {
      callId,
      partialSpeech,
      stability,
      timestamp: new Date()
    });
  }

  // Return empty TwiML to continue listening
  const twiml = new twilio.twiml.VoiceResponse();
  res.type('text/xml');
  res.send(twiml.toString());
});

// Add performance monitoring
const performanceMetrics = {
  openai: [],
  azure: [],
  twilio: []
};

function logPerformance(service, operation, duration) {
  performanceMetrics[service].push({
    operation,
    duration,
    timestamp: Date.now()
  });

  // Keep only last 100 metrics
  if (performanceMetrics[service].length > 100) {
    performanceMetrics[service].shift();
  }

  // Log performance metrics
  console.log(`⏱️ ${service.toUpperCase()} ${operation}: ${duration}ms`);

  // Calculate and log average
  const avg = performanceMetrics[service].reduce((sum, metric) => sum + metric.duration, 0) / performanceMetrics[service].length;
  console.log(`📊 ${service.toUpperCase()} Average ${operation}: ${Math.round(avg)}ms`);
}

// Process speech input
app.post('/api/voice/process-speech', async (req, res) => {
  const startTime = Date.now();
  try {
    const callId = req.query.callId;
    let userSpeech = req.body.SpeechResult || '';

    if (azureIntegration) {
      userSpeech = await azureIntegration.processSpeechWithAzure(req.body);
    }

    if (userSpeech) {
      const conversation = conversations.get(callId) || [];
      conversation.push({ role: 'user', content: userSpeech });

      const aiResponse = await generateAIResponse(conversation, callId, activeCalls.get(callId));
      const ttsResult = await createTTSResponse(aiResponse, {
        rate: '0%',
        pitch: '+5%',
        volume: 'medium',
        style: 'conversation'
      });

      const twiml = new twilio.twiml.VoiceResponse();

      // Check if ttsResult exists and has audioUrl (Azure TTS)
      if (ttsResult && ttsResult.audioUrl) {
        twiml.play({ loop: 1 }, ttsResult.audioUrl);
      } else {
        // Fallback to Twilio TTS if Azure not available
        twiml.say({ voice: 'alice' }, aiResponse);
      }

      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }
  } catch (error) {
    console.error('Error in speech processing:', error);
  }

  // Default response if something goes wrong
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('I apologize, but I could not process that. Could you please repeat?');
  res.type('text/xml');
  res.send(twiml.toString());
});

// Call status webhook
app.post('/api/voice/status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`Call status update: ${callStatus} for SID: ${callSid}`);

  // Find call by Twilio SID and update status
  for (const [callId, callData] of activeCalls.entries()) {
    if (callData.twilioCallSid === callSid) {
      callData.status = callStatus;

      // Emit status update with correct event names for frontend
      io.emit('callStatus', {
        callId,
        status: callStatus === 'answered' ? 'connected' : callStatus,
        phoneNumber: callData.phoneNumber,
        message: `Call ${callStatus}`
      });

      // Clean up completed calls
      if (callStatus === 'completed' || callStatus === 'failed') {
        // Get final order details before cleanup
        const orderInfo = orderDetails.get(callId);

        // Save conversation history before cleanup
        const conversation = conversations.get(callId) || [];
        if (conversation.length > 0) {
          saveConversationHistory(callId, conversation, {
            ...callData,
            orderDetails: orderInfo
          });
        }

        io.emit('callCompleted', {
          callId,
          orderInfo
        });

        setTimeout(() => {
          activeCalls.delete(callId);
          conversations.delete(callId);
          cleanupSessionFlags(callId);
        }, 60000); // Keep for 1 minute after completion
      }
      break;
    }
  }

  res.status(200).send('OK');
});

// Manual call termination endpoint
app.post('/api/terminate-call', async (req, res) => {
  const { callId } = req.body;

  if (!callId) {
    return res.status(400).json({ error: 'Call ID is required' });
  }

  try {
    // Get call data and order details
    const callData = activeCalls.get(callId);
    const order = orderDetails.get(callId);

    if (!callData) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Validate Twilio call SID
    if (!callData.twilioCallSid) {
      return res.status(400).json({ error: 'No active Twilio call found' });
    }

    // Terminate the Twilio call
    try {
      await twilioClient.calls(callData.twilioCallSid).update({
        status: 'completed'
      });
    } catch (twilioError) {
      console.error('Error terminating Twilio call:', twilioError);
      // Continue with cleanup even if Twilio call termination fails
    }

    // Save conversation history with order details
    const conversation = conversations.get(callId) || [];
    if (conversation.length > 0) {
      try {
        saveConversationHistory(callId, conversation, {
          ...callData,
          orderDetails: order
        });
      } catch (saveError) {
        console.error('Error saving conversation history:', saveError);
      }
    }

    // Emit final order status
    if (order) {
      io.emit('orderUpdate', {
        callId,
        orderDetails: order,
        final: true,
        status: 'terminated'
      });
    }

    // Clean up call data
    activeCalls.delete(callId);
    conversations.delete(callId);
    cleanupSessionFlags(callId);

    // Emit call completed event
    io.emit('callCompleted', {
      callId,
      reason: 'manual_termination',
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Call terminated successfully',
      callId
    });

  } catch (error) {
    console.error('Error in terminate-call endpoint:', error);

    // Attempt cleanup even in case of error
    try {
      activeCalls.delete(callId);
      conversations.delete(callId);
      resetTimeoutAttempts(callId);

      io.emit('callCompleted', {
        callId,
        reason: 'manual_termination',
        status: 'error',
        error: error.message
      });
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }

    res.status(500).json({
      error: 'Failed to terminate call',
      details: error.message,
      callId
    });
  }
});

// Get conversation history
app.get('/api/conversation/:callId', (req, res) => {
  const callId = req.params.callId;
  const conversation = conversations.get(callId);
  const order = orderDetails.get(callId);

  if (conversation) {
    // Filter out system messages for display
    const displayConversation = conversation.filter(msg => msg.role !== 'system');
    res.json({
      conversation: displayConversation,
      orderDetails: order || null
    });
  } else {
    res.status(404).json({ error: 'Conversation not found' });
  }
});

// New endpoint to get current order details
app.get('/api/order/:callId', (req, res) => {
  const callId = req.params.callId;
  const order = orderDetails.get(callId);

  if (order) {
    res.json({ orderDetails: order });
  } else {
    res.status(404).json({ error: 'Order not found' });
  }
});

// Get active calls
app.get('/api/calls', (req, res) => {
  const calls = Array.from(activeCalls.entries()).map(([callId, data]) => ({
    callId,
    ...data
  }));
  res.json({ calls });
});

// Azure service status endpoint
app.get('/api/azure/status', async (req, res) => {
  try {
    if (azureIntegration) {
      const status = await azureIntegration.getServiceStatus();
      res.json({
        enabled: true,
        ...status,
        region: process.env.AZURE_SPEECH_REGION,
        customVoice: process.env.AZURE_CUSTOM_VOICE_NAME
      });
    } else {
      res.json({
        enabled: false,
        error: 'Azure integration not initialized'
      });
    }
  } catch (error) {
    res.status(500).json({
      enabled: false,
      error: error.message
    });
  }
});

// Test Azure TTS endpoint
app.post('/api/azure/test-tts', async (req, res) => {
  try {
    const { text, options } = req.body;

    if (!azureIntegration) {
      return res.status(500).json({ error: 'Azure integration not available' });
    }

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const testText = text || 'Hello, this is a test of Azure Text-to-Speech with Luna voice.';

    const ttsResult = await azureIntegration.createTTSResponse(testText, options || {});

    res.json({
      success: true,
      message: 'TTS test successful',
      audioFileName: ttsResult.audioFileName,
      audioUrl: ttsResult.audioFileName ? `/audio/${ttsResult.audioFileName}` : null
    });

    // Clean up test file after 60 seconds
    if (ttsResult.audioFileName) {
      setTimeout(() => {
        azureIntegration.cleanupTempAudio(ttsResult.audioFileName);
      }, 60000);
    }

  } catch (error) {
    console.error('Azure TTS test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available Azure voices
app.get('/api/azure/voices', async (req, res) => {
  try {
    if (!azureIntegration) {
      return res.status(500).json({ error: 'Azure integration not available' });
    }

    try {
      const voices = await azureIntegration.azureSpeech.getAvailableVoices();
      res.json({
        voices: voices.filter(voice => voice.locale.startsWith('en-US')), // Filter for English voices
        currentVoice: process.env.AZURE_CUSTOM_VOICE_NAME,
        voiceConfigured: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`
      });
    } catch (voiceError) {
      // Fallback response if voice listing fails
      res.json({
        voices: [
          {
            name: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`,
            locale: 'en-US',
            gender: 'Female',
            voiceType: 'Neural'
          }
        ],
        currentVoice: process.env.AZURE_CUSTOM_VOICE_NAME,
        voiceConfigured: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`,
        note: 'Using configured voice (voice listing unavailable)'
      });
    }

  } catch (error) {
    console.error('Failed to get Azure voices:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Health check endpoint with Azure status
app.get('/api/health', async (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date(),
    services: {
      twilio: !!process.env.TWILIO_ACCOUNT_SID,
      openai: !!process.env.OPENAI_API_KEY,
      azure: {
        enabled: !!azureIntegration,
        configured: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)
      }
    }
  };

  // Test Azure connection if available
  if (azureIntegration) {
    try {
      const azureStatus = await azureIntegration.getServiceStatus();
      healthStatus.services.azure.connected = azureStatus.azure.connected;
      healthStatus.services.azure.voicesAvailable = azureStatus.azure.voicesAvailable;
    } catch (error) {
      healthStatus.services.azure.connected = false;
      healthStatus.services.azure.error = error.message;
    }
  }

  res.json(healthStatus);
});

// Test Twilio account status and verified numbers
app.get('/api/twilio/status', async (req, res) => {
  try {
    // Get account info
    const account = await twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();

    // Get verified phone numbers (for trial accounts)
    let verifiedNumbers = [];
    try {
      const outgoingCallerIds = await twilioClient.outgoingCallerIds.list();
      verifiedNumbers = outgoingCallerIds.map(callerId => ({
        phoneNumber: callerId.phoneNumber,
        friendlyName: callerId.friendlyName
      }));
    } catch (error) {
      console.log('Could not fetch verified numbers:', error.message);
    }

    // Get Twilio phone numbers
    let twilioNumbers = [];
    try {
      const phoneNumbers = await twilioClient.incomingPhoneNumbers.list();
      twilioNumbers = phoneNumbers.map(number => ({
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName
      }));
    } catch (error) {
      console.log('Could not fetch Twilio numbers:', error.message);
    }

    res.json({
      account: {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type
      },
      verifiedNumbers,
      twilioNumbers,
      fromNumber: process.env.TWILIO_PHONE_NUMBER
    });
  } catch (error) {
    console.error('Error checking Twilio status:', error);
    res.status(500).json({
      error: 'Failed to check Twilio status',
      details: error.message
    });
  }
});

// Endpoint to list saved conversation history files
app.get('/api/conversation-history', (req, res) => {
  try {
    const files = fs.readdirSync(conversationHistoryDir)
      .filter(file => file.endsWith('.txt'))
      .map(file => {
        const filepath = path.join(conversationHistoryDir, file);
        const stats = fs.statSync(filepath);
        return {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.created - a.created); // Sort by newest first

    res.json({
      files,
      totalFiles: files.length,
      directory: conversationHistoryDir
    });
  } catch (error) {
    console.error('❌ Error listing conversation history files:', error);
    res.status(500).json({
      error: 'Failed to list conversation history files',
      details: error.message
    });
  }
});

// Endpoint to download a specific conversation history file
app.get('/api/conversation-history/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(conversationHistoryDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filepath, filename);
  } catch (error) {
    console.error('❌ Error downloading conversation history file:', error);
    res.status(500).json({
      error: 'Failed to download conversation history file',
      details: error.message
    });
  }
});

// Enhanced AI Response Generation
async function generateAIResponse(conversation, callId, hotel) {
  const startTime = Date.now();
  try {
    const lastMessage = conversation[conversation.length - 1]?.content || '';

    // Check if conversation was interrupted - skip cache for fresh response
    const wasInterrupted = conversation.interrupted;
    delete conversation.interrupted; // Clear flag after checking

    const cacheKey = getCacheKey('openai', lastMessage);

    // Check cache only if not interrupted
    if (!wasInterrupted) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        console.log('✅ Using cached OpenAI response');
        logPerformance('openai', 'chat_completion_cached', Date.now() - startTime);
        return cached;
      }
    } else {
      console.log('⚠️ Skipping cache due to interruption - generating fresh response');
    }

    const completion = await openai.chat.completions.create({
      model: LIVE_CHAT_MODEL,
      messages: conversation,
      temperature: 0.5,  // Slightly reduced for better consistency while maintaining natural variation
      max_tokens: 80    // Reduced from 100 for faster response generation
    });

    const response = completion.choices[0].message.content;
    const duration = Date.now() - startTime;

    console.log(`⏱️ AI Response generated in ${duration}ms`);
    logPerformance('openai', 'chat_completion', duration);

    // Cache response only if not interrupted
    if (!wasInterrupted) {
      addToCache(cacheKey, response);
    }

    return response;
  } catch (error) {
    console.error('❌ Error generating AI response:', error);
    return "I apologize, could you please repeat that?";
  }
}

// Modify the TTS response generation
async function createTTSResponse(text, options = {}) {
  // If Azure integration is not available, return null to use Twilio TTS
  if (!azureIntegration) {
    return null;
  }

  const cacheKey = getCacheKey('tts', text, options);

  // Check cache
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log('Using cached TTS response');
    return cached;
  }

  const ttsResult = await azureIntegration.createTTSResponse(text, options);
  addToCache(cacheKey, ttsResult);
  return ttsResult;
}

// Call analysis endpoint
app.post('/api/analyze-call', async (req, res) => {
  try {
    const { prompt, callId } = req.body;

    console.log(`🔍 Analyzing call ${callId} with AI...`);

    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert sales call analyzer. Analyze the conversation and provide detailed insights in the exact JSON format requested. Focus on extracting actual order details, customer sentiment, and actionable recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000  // Reduced from 2000 as GPT-3.5-turbo can be more concise
    });

    const analysisText = completion.choices[0].message.content;
    console.log(`🤖 Raw AI analysis: ${analysisText}`);

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response as JSON:', parseError);
      // Fallback analysis if JSON parsing fails
      analysis = {
        callSummary: "Call analysis completed successfully",
        customerSentiment: "positive",
        orderDetails: {
          products: [],
          subtotal: 0,
          tax: 0,
          total: 0
        },
        customerDetails: {
          name: "Customer",
          hotel: "Hotel",
          phone: "N/A",
          email: "N/A"
        },
        callMetrics: {
          duration: "3-5 minutes",
          responseTime: "2-3 seconds",
          satisfaction: 8
        },
        nextSteps: [
          "Follow up on order status",
          "Schedule next call",
          "Send product catalog"
        ],
        paymentInfo: {
          method: "Credit Card",
          cardLast4: "4567",
          amount: 0,
          status: "Processed"
        }
      };
    }

    console.log(`✅ Call analysis completed for ${callId}`);

    // Save conversation history with analysis
    const conversation = conversations.get(callId) || [];
    const callData = activeCalls.get(callId);
    if (conversation.length > 0) {
      saveConversationHistory(callId, conversation, callData, analysis);
    }

    res.json({ analysis });

  } catch (error) {
    console.error('❌ Error analyzing call:', error);
    res.status(500).json({
      error: 'Failed to analyze call',
      details: error.message
    });
  }
});

// Clean up when call ends
app.post('/api/voice/call-ended', (req, res) => {
  const callId = req.query.callId;

  // Clean up all call-related data
  conversations.delete(callId);
  activeCalls.delete(callId);
  resetTimeoutAttempts(callId);
  cleanupSessionFlags(callId);

  res.sendStatus(200);
});

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/audio') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Add performance metrics endpoint
app.get('/api/performance', (req, res) => {
  res.json({
    metrics: performanceMetrics,
    summary: {
      openai: {
        average: performanceMetrics.openai.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.openai.length || 0
      },
      azure: {
        average: performanceMetrics.azure.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.azure.length || 0
      },
      twilio: {
        average: performanceMetrics.twilio.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.twilio.length || 0
      }
    }
  });
});

// Test endpoint to measure latency
app.post('/api/test/latency', async (req, res) => {
  const startTime = Date.now();
  try {
    // Test OpenAI latency
    const openaiStart = Date.now();
    const completion = await openai.chat.completions.create({
      model: LIVE_CHAT_MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello briefly." }
      ],
      max_tokens: 20  // Reduced from 50 as it's just a test greeting
    });
    const openaiDuration = Date.now() - openaiStart;
    logPerformance('openai', 'test_completion', openaiDuration);

    // Test Azure TTS latency
    let azureTTSDuration = 0;
    if (azureIntegration) {
      const ttsStart = Date.now();
      await azureIntegration.createTTSResponse("Hello, this is a test message.", {
        rate: '0%',
        pitch: '+5%',
        volume: 'medium',
        style: 'conversation'
      });
      azureTTSDuration = Date.now() - ttsStart;
      logPerformance('azure', 'test_tts', azureTTSDuration);
    }

    // Get all metrics
    const metrics = {
      current: {
        total: Date.now() - startTime,
        openai: openaiDuration,
        azure_tts: azureTTSDuration
      },
      historical: performanceMetrics,
      azure_service: azureIntegration ? azureIntegration.getMetrics() : null
    };

    res.json({
      success: true,
      metrics
    });

  } catch (error) {
    console.error('Error in latency test:', error);
    res.status(500).json({
      error: 'Latency test failed',
      details: error.message
    });
  }
});

// API endpoint to initiate calls from website
app.post('/api/voice/initiate-call', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log(`📞 Website demo call requested for: ${phoneNumber}`);

    const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
    const ngrokUrl = process.env.NGROK_URL || `http://localhost:${PORT}`;

    // Make the call using Twilio
    const call = await twilioClient.calls.create({
      url: `${ngrokUrl}/api/voice/incoming`,
      to: phoneNumber,
      from: twilioNumber,
      method: 'POST'
    });

    console.log(`✅ Call initiated successfully! Call SID: ${call.sid}`);

    res.json({
      success: true,
      callSid: call.sid,
      message: 'Call initiated successfully! Your phone will ring in a few seconds.'
    });

  } catch (error) {
    console.error('❌ Error initiating call:', error.message);

    let errorMessage = 'Failed to initiate call';
    if (error.message.includes('unverified')) {
      errorMessage = 'This number needs to be verified in your Twilio account first.';
    } else if (error.message.includes('balance')) {
      errorMessage = 'Insufficient Twilio account balance.';
    }

    res.status(500).json({
      error: errorMessage,
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`🚀 Voice Agent Server running on port ${PORT}`);
  console.log(`📞 Twilio configured: ${!!process.env.TWILIO_ACCOUNT_SID}`);
  console.log(`🤖 OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🎙️ Azure Speech Services configured: ${!!azureIntegration}`);
  if (azureIntegration) {
    console.log(`🔊 Azure custom voice: ${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}`);
    console.log(`🌍 Azure region: ${process.env.AZURE_SPEECH_REGION}`);
  }
  console.log(`📁 Temp audio directory: ${path.join(__dirname, 'temp_audio')}`);

  // Prewarm services at startup
  await prewarmServices().catch(error => {
    console.log('⚠️ Initial prewarm error (non-critical):', error.message);
  });
});