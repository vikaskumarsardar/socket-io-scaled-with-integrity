const { io } = require("socket.io-client");
const http = require("http");
const { EVENT_TYPES, ROOMS } = require("@app/shared");

// Client State Store (Idempotent De-duplication Map)
const clientMessageStore = new Map();
let lastSeenSequenceId = 100;

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3000";
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || "http://localhost:4000";

const socket = io(GATEWAY_URL, {
  transports: ["websocket"],
  auth: {
    userId: process.env.USER_ID || "user_alice",
    token: process.env.JWT_TOKEN || null
  },
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5
});

function processIncomingMessage(msg) {
  if (clientMessageStore.has(msg.sequenceId)) {
    return;
  }
  
  clientMessageStore.set(msg.sequenceId, msg);

  if (msg.sequenceId > lastSeenSequenceId) {
    lastSeenSequenceId = msg.sequenceId;
  }

  console.log(`[UI Render] Seq #${msg.sequenceId} | Sender: ${msg.senderId} | Content: "${msg.content}"`);
}

// Listen for Non-Ephemeral Chat Messages
socket.on("new_message", (msg) => {
  processIncomingMessage(msg);
});

// Listen for Ephemeral Typing Indicator
let typingTimer = null;
socket.on(EVENT_TYPES.USER_TYPING, (data) => {
  console.log(`[Typing Indicator] User ${data.userId} is typing...`);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    console.log(`[Typing Indicator] User ${data.userId} stopped typing.`);
  }, 3000);
});

socket.on("connect", async () => {
  console.log(`\n>>> Connected to Gateway! SocketID: ${socket.id} <<<`);

  if (socket.recovered) {
    console.log(`[RECOVERY SUCCESS] socket.recovered = TRUE.`);
    console.log(`[RECOVERY] Missed events automatically replayed by Socket.IO.`);
  } else {
    console.log(`[RECOVERY FALLBACK] socket.recovered = FALSE.`);
    console.log(`[REST SYNC] Fetching missed history from chat-service REST API...`);

    const jitterDelay = Math.floor(Math.random() * 1000);
    setTimeout(() => {
      fetchMissingMessagesFromREST(lastSeenSequenceId);
    }, jitterDelay);
  }
});

socket.on("disconnect", (reason) => {
  console.log(`\n<<< Disconnected from Gateway! Reason: ${reason} >>>`);
});

function fetchMissingMessagesFromREST(sinceSeq) {
  http.get(`${CHAT_SERVICE_URL}/api/v1/messages/sync?since=${sinceSeq}&roomId=${ROOMS.GENERAL}`, (res) => {
    let rawData = "";
    res.on("data", (chunk) => { rawData += chunk; });
    res.on("end", () => {
      try {
        const parsed = JSON.parse(rawData);
        console.log(`[REST SYNC Response] Fetched ${parsed.messages ? parsed.messages.length : 0} missing messages.`);
        if (parsed.messages) {
          parsed.messages.forEach((msg) => processIncomingMessage(msg));
        }
      } catch (e) {
        console.error("Failed to parse REST sync response:", e);
      }
    });
  }).on("error", (err) => {
    console.error("REST Sync Request failed:", err.message);
  });
}

// Actions Simulation
setTimeout(() => {
  console.log("\n--- Action 1: Emitting Ephemeral Event (user_typing) ---");
  socket.emit(EVENT_TYPES.USER_TYPING, { roomId: ROOMS.GENERAL });
}, 2000);

setTimeout(() => {
  console.log("\n--- Action 2: Triggering Disconnect Test ---");
  socket.io.engine.close();
}, 5000);
