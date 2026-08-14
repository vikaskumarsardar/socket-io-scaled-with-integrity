const { consumer } = require("../config/kafka");
const { KAFKA_CONFIG, EVENT_TYPES, parseOutboxEvent } = require("@app/shared");

async function initKafkaConsumer(io) {
  try {
    await consumer.connect();
    await consumer.subscribe({
      topic: process.env.KAFKA_TOPIC || KAFKA_CONFIG.TOPIC_OUTBOX,
      fromBeginning: false
    });

    console.log("[Kafka Consumer] Connected and subscribed to outbox topic.");

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const eventData = parseOutboxEvent(message.value);

          if (!eventData || !eventData.roomId) {
            return;
          }

          console.log(`[Kafka Event] Room: ${eventData.roomId} | Seq: ${eventData.sequenceId}`);

          // Emit real-time message to target room using shared event constant
          io.to(eventData.roomId).emit(EVENT_TYPES.NEW_MESSAGE, eventData);
        } catch (err) {
          console.error("[Kafka Consumer Error] Failed to process message:", err.message);
        }
      }
    });
  } catch (err) {
    console.warn("[Kafka Consumer Warning] Could not connect to Kafka broker. Gateway operating in standalone mode.");
  }
}

module.exports = {
  initKafkaConsumer
};
