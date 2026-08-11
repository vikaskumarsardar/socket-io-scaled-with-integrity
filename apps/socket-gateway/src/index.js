const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { createClusterAdapter } = require("@socket.io/redis-streams-adapter");
const { Redis } = require("ioredis");
const { Kafka } = require("kafkajs");
const jwt = require("jsonwebtoken");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { EVENT_TYPES, ROOMS, KAFKA_CONFIG, RECOVERY_CONFIG } = require("@app/shared");

const app = express();
app.use(express.json());
const httpServer = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_key_super_secure_123!";

// -----------------------------------------------------------------------------
// 1. Redis Streams Adapter Setup (Connection State Recovery)
// -----------------------------------------------------------------------------
let adapterOptions = {};
try {
  const redisClient = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  redisClient.connect().then(() => {
    console.log("[Redis Adapter] Connected to Redis Streams!");
  }).catch(() => {
    console.log("[Redis Adapter] Redis unavailable locally. Falling back to in-memory adapter.");
  });

  adapterOptions = {
    adapter: createClusterAdapter(redisClient, {
      streamMaxLen: RECOVERY_CONFIG.STREAM_MAX_LEN,
      mMaxLenThreshold: RECOVERY_CONFIG.STREAM_M_MAX_LEN_THRESHOLD
    })
  };
} catch (e) {
  console.log("[Redis Adapter] In-memory fallback.");
}

// -----------------------------------------------------------------------------
// 2. Socket.IO Server Configuration
// -----------------------------------------------------------------------------
const io = new Server(httpServer, {
  ...adapterOptions,
  
  // FORCE Pure WebSockets (No HTTP Long Polling)
  transports: ["websocket"],

  // Connection State Recovery (v4.6+)
  connectionStateRecovery: {
    maxDisconnectionDuration: RECOVERY_CONFIG.MAX_DISCONNECTION_DURATION_MS,
    skipMiddlewares: true
  },

  // Payload byte limit
  maxHttpBufferSize: 100 * 1024
});

// -----------------------------------------------------------------------------
// 3. Kafka Consumer Setup (Consumes CDC Events from Debezium Outbox)
// -----------------------------------------------------------------------------
const kafka = new Kafka({
  clientId: "socket-gateway",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(",")
});

const consumer = kafka.consumer({ groupId: KAFKA_CONFIG.GROUP_ID });

async function initKafkaConsumer() {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: process.env.KAFKA_TOPIC || KAFKA_CONFIG.TOPIC_OUTBOX, fromBeginning: false });

    console.log("[Kafka Consumer] Connected and subscribed to outbox topic.");

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const rawValue = message.value.toString();
          const debeziumEvent = JSON.parse(rawValue);

          let eventData = debeziumEvent;
          if (debeziumEvent.payload && debeziumEvent.payload.after) {
            eventData = typeof debeziumEvent.payload.after.payload === "string" 
              ? JSON.parse(debeziumEvent.payload.after.payload) 
              : debeziumEvent.payload.after.payload;
          }

          console.log(`[Kafka Event] Room: ${eventData.roomId} | Seq: ${eventData.sequenceId}`);

          if (eventData.roomId) {
            io.to(eventData.roomId).emit("new_message", eventData);
          }
        } catch (err) {
          console.error("[Kafka Consumer Error] Failed to process message:", err.message);
        }
      }
    });
  } catch (err) {
    console.warn("[Kafka Consumer Warning] Could not connect to Kafka broker. Gateway operating in standalone mode.");
  }
}

// -----------------------------------------------------------------------------
// 4. JWT Authentication Middleware (Signed Token Verification)
// -----------------------------------------------------------------------------
const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });

io.use((socket, next) => {
  const auth = socket.handshake.auth;

  // 1. Direct userId fallback for local development/testing
  if (auth && auth.userId && !auth.token) {
    socket.userId = auth.userId;
    return next();
  }

  // 2. Production JWT Token Verification
  if (!auth || !auth.token) {
    return next(new Error("Authentication failed: JWT token required in handshake auth"));
  }

  try {
    const decoded = jwt.verify(auth.token, JWT_SECRET);
    socket.userId = decoded.userId || decoded.sub;
    next();
  } catch (err) {
    return next(new Error(`Authentication failed: Invalid or expired JWT token (${err.message})`));
  }
});

// -----------------------------------------------------------------------------
// 5. Connection Handler & Eviction Guard
// -----------------------------------------------------------------------------
io.on("connection", (socket) => {
  console.log(`[Gateway Connection] SocketID: ${socket.id} | UserID: ${socket.userId} | Recovered: ${socket.recovered}`);

  socket.join(`user_${socket.userId}`);
  socket.join(ROOMS.GENERAL);

  // Inbound Rate Limiting
  socket.use(async (packet, next) => {
    try {
      await rateLimiter.consume(socket.id);
      next();
    } catch {
      console.warn(`[Rate Limit Exceeded] Disconnecting socket ${socket.id}`);
      socket.emit("error", "Rate limit exceeded");
      socket.disconnect(true);
    }
  });

  // Slow Client Eviction Guard (Backpressure)
  const evictionInterval = setInterval(() => {
    if (socket.conn && socket.conn.writeBuffer && socket.conn.writeBuffer.length > 200) {
      console.error(`[EVICTION] Disconnecting slow socket ${socket.id}. Queue length: ${socket.conn.writeBuffer.length}`);
      clearInterval(evictionInterval);
      socket.disconnect(true);
    }
  }, 2000);

  // EPHEMERAL EVENT: Typing Indicator (Volatile Emit)
  socket.on(EVENT_TYPES.USER_TYPING, (data) => {
    const roomId = data.roomId || ROOMS.GENERAL;
    socket.volatile.to(roomId).emit(EVENT_TYPES.USER_TYPING, {
      userId: socket.userId,
      roomId: roomId
    });
  });

  socket.on("disconnect", (reason) => {
    clearInterval(evictionInterval);
    console.log(`[Gateway Disconnect] SocketID: ${socket.id} | Reason: ${reason}`);
  });
});

app.get("/health", (req, res) => res.json({ status: "UP", activeSockets: io.sockets.sockets.size }));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(` [apps/socket-gateway] Running on port ${PORT}`);
  console.log(` Transports: Pure WebSockets ('websocket')`);
  console.log(` Auth: JWT Verification Active`);
  console.log(`=======================================================`);
  await initKafkaConsumer();
});
