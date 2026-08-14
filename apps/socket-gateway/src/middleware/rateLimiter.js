const { RateLimiterMemory } = require("rate-limiter-flexible");

const RATE_LIMIT_POINTS = 10;
const RATE_LIMIT_DURATION_SECONDS = 1;

const rateLimiter = new RateLimiterMemory({
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION_SECONDS
});

async function socketRateLimiterMiddleware(socket, packet, next) {
  try {
    await rateLimiter.consume(socket.id);
    next();
  } catch {
    console.warn(`[Rate Limit Exceeded] Disconnecting socket ${socket.id}`);
    socket.emit("error", "Rate limit exceeded");
    socket.disconnect(true);
  }
}

module.exports = {
  socketRateLimiterMiddleware
};
