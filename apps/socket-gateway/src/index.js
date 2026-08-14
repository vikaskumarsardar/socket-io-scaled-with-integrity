const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-streams-adapter");
const { RECOVERY_CONFIG } = require("@app/shared");
const { pubClient, subClient, closeRedis } = require("./config/redis");
const { closeKafka } = require("./config/kafka");
const { socketAuthMiddleware } = require("./middleware/auth");
const { initKafkaConsumer } = require("./services/kafkaConsumerService");
const { setupSocketHandlers, stopGlobalEvictionMonitor } = require("./handlers/socketHandler");

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);

// Socket.IO Server Configuration
const io = new Server(httpServer, {
  adapter: createAdapter(pubClient, subClient, {
    streamMaxLen: RECOVERY_CONFIG.STREAM_MAX_LEN,
    mMaxLenThreshold: RECOVERY_CONFIG.STREAM_M_MAX_LEN_THRESHOLD,
    maxDisconnectionDuration: RECOVERY_CONFIG.MAX_DISCONNECTION_DURATION_MS
  }),
  
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },

  transports: ["websocket"],

  connectionStateRecovery: {
    maxDisconnectionDuration: RECOVERY_CONFIG.MAX_DISCONNECTION_DURATION_MS,
    skipMiddlewares: false
  },

  maxHttpBufferSize: 100 * 1024
});

// Authentication Middleware
io.use(socketAuthMiddleware);

// Setup Socket Event Handlers
setupSocketHandlers(io);

// Health Endpoint
app.get("/health", (req, res) => res.json({ status: "UP", activeSockets: io.sockets.sockets.size }));

const PORT = process.env.PORT || 3000;

async function startServer() {
  httpServer.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(` [apps/socket-gateway] Running on port ${PORT}`);
    console.log(` Transports: Pure WebSockets ('websocket')`);
    console.log(` Auth: JWT Verification Active`);
    console.log(`=======================================================`);
    await initKafkaConsumer(io);
  });
}

// Graceful Shutdown Handler
async function gracefulShutdown(signal) {
  console.log(`\n[socket-gateway] Received ${signal}. Initiating graceful shutdown...`);

  stopGlobalEvictionMonitor();

  io.close(async () => {
    console.log("[socket-gateway] Socket.IO server closed.");
    httpServer.close(async () => {
      console.log("[socket-gateway] HTTP server closed.");
      await closeKafka();
      await closeRedis();
      console.log("[socket-gateway] Shutdown complete. Exiting.");
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer();
