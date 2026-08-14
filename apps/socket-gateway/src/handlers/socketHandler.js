const { ROOMS, EVENT_TYPES } = require("@app/shared");
const { socketRateLimiterMiddleware } = require("../middleware/rateLimiter");

// Defense Threshold Constants
const MAX_WRITE_BUFFER_LENGTH = 200;
const EVICTION_MONITOR_INTERVAL_MS = 2000;

let globalEvictionInterval = null;

/**
 * Safely extracts the outgoing write buffer length for a socket connection.
 * @param {Object} socket 
 * @returns {number}
 */
function getSocketWriteBufferLength(socket) {
  return socket?.conn?.writeBuffer ? socket.conn.writeBuffer.length : 0;
}

/**
 * Evaluates whether a socket connection is suffering from backpressure / slow client lag.
 * @param {Object} socket 
 * @returns {boolean}
 */
function isSocketBackpressured(socket) {
  return getSocketWriteBufferLength(socket) > MAX_WRITE_BUFFER_LENGTH;
}

function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[Gateway Connection] SocketID: ${socket.id} | UserID: ${socket.userId} | Recovered: ${socket.recovered}`);

    socket.join(`user_${socket.userId}`);
    socket.join(ROOMS.GENERAL);

    // Inbound Rate Limiting Middleware
    socket.use((packet, next) => socketRateLimiterMiddleware(socket, packet, next));

    // EPHEMERAL EVENT: Typing Indicator (Volatile Emit)
    socket.on(EVENT_TYPES.USER_TYPING, (data) => {
      const roomId = data?.roomId || ROOMS.GENERAL;
      socket.volatile.to(roomId).emit(EVENT_TYPES.USER_TYPING, {
        userId: socket.userId,
        roomId
      });
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Gateway Disconnect] SocketID: ${socket.id} | Reason: ${reason}`);
    });
  });

  // Global Eviction Monitor (Single Timer for Gateway Server to prevent per-socket interval leaks)
  if (!globalEvictionInterval) {
    globalEvictionInterval = setInterval(() => {
      for (const [, socket] of io.sockets.sockets) {
        if (isSocketBackpressured(socket)) {
          const bufferLength = getSocketWriteBufferLength(socket);
          console.error(`[EVICTION] Disconnecting slow socket ${socket.id}. Queue length: ${bufferLength}`);
          socket.disconnect(true);
        }
      }
    }, EVICTION_MONITOR_INTERVAL_MS);
  }
}

function stopGlobalEvictionMonitor() {
  if (globalEvictionInterval) {
    clearInterval(globalEvictionInterval);
    globalEvictionInterval = null;
  }
}

module.exports = {
  setupSocketHandlers,
  stopGlobalEvictionMonitor,
  isSocketBackpressured
};
