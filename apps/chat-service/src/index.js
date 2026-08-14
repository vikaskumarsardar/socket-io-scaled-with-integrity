const express = require("express");
const cors = require("cors");
const { closePool } = require("./config/db");
const { initSchema, cleanupOutbox } = require("./db/migrations");
const messageRoutes = require("./routes/messageRoutes");

// Periodic Cleanup Schedule Constant (30 minutes)
const OUTBOX_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

const app = express();
app.use(cors());
app.use(express.json());

// Register API Routes
app.use("/", messageRoutes);

const PORT = process.env.PORT || 4000;

let server;
let cleanupInterval;

async function startServer() {
  server = app.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(` [apps/chat-service] Running on port ${PORT}`);
    console.log(` Pattern: Transactional Outbox (PostgreSQL)`);
    console.log(` Shared Package: @app/shared loaded`);
    console.log(`=======================================================`);
    
    await initSchema();

    // Schedule periodic outbox table cleanup to prevent infinite table bloat
    cleanupInterval = setInterval(cleanupOutbox, OUTBOX_CLEANUP_INTERVAL_MS);
  });
}

// Graceful Shutdown Handler
async function gracefulShutdown(signal) {
  console.log(`\n[chat-service] Received ${signal}. Initiating graceful shutdown...`);

  if (cleanupInterval) clearInterval(cleanupInterval);

  if (server) {
    server.close(async () => {
      console.log("[chat-service] HTTP server closed.");
      await closePool();
      console.log("[chat-service] Shutdown complete. Exiting.");
      process.exit(0);
    });
  } else {
    await closePool();
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer();
