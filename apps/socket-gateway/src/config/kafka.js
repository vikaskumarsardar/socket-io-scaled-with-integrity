const { Kafka } = require("kafkajs");
const { KAFKA_CONFIG } = require("@app/shared");

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");

const kafka = new Kafka({
  clientId: "socket-gateway",
  brokers
});

const consumer = kafka.consumer({ groupId: KAFKA_CONFIG.GROUP_ID });

async function closeKafka() {
  console.log("[Kafka] Disconnecting consumer...");
  try {
    await consumer.disconnect();
    console.log("[Kafka] Consumer disconnected.");
  } catch (err) {
    console.error("[Kafka Error] Error disconnecting consumer:", err.message);
  }
}

module.exports = {
  kafka,
  consumer,
  closeKafka
};
