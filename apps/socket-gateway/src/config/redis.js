const { Redis } = require("ioredis");

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);

const pubClient = new Redis({
  host: redisHost,
  port: redisPort,
  lazyConnect: false
});

const subClient = pubClient.duplicate();

pubClient.on("connect", () => {
  console.log("[Redis Adapter] Connected to Redis Streams (Pub/Sub active)!");
});

pubClient.on("error", (err) => {
  console.warn("[Redis Adapter Warning]", err.message);
});

async function closeRedis() {
  console.log("[Redis] Closing Redis clients...");
  try {
    await pubClient.quit();
    await subClient.quit();
    console.log("[Redis] Redis connections closed.");
  } catch (err) {
    console.error("[Redis Error] Error closing clients:", err.message);
  }
}

module.exports = {
  pubClient,
  subClient,
  closeRedis
};
