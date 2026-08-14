// Shared Event Constants across Chat Service, Socket Gateway, and Client Demo

const EVENT_TYPES = {
  NEW_MESSAGE: "new_message",
  SEND_MESSAGE: "send_message",
  USER_TYPING: "user_typing",
  USER_JOINED: "user_joined",
  WEBRTC_SIGNAL: "webrtc_signal"
};


const ROOMS = {
  GENERAL: "room_general"
};

const KAFKA_CONFIG = {
  TOPIC_OUTBOX: "dbserver1.public.outbox",
  GROUP_ID: "socket-gateway-group"
};

const RECOVERY_CONFIG = {
  MAX_DISCONNECTION_DURATION_MS: 2 * 60 * 1000, // 2 minutes
  STREAM_MAX_LEN: 10000,
  STREAM_M_MAX_LEN_THRESHOLD: 100
};

function createOutboxPayload(messageId, sequenceId, roomId, senderId, content, sentAt = null) {
  return {
    messageId,
    sequenceId: parseInt(sequenceId, 10),
    roomId,
    senderId,
    content,
    sentAt: sentAt ? parseInt(sentAt, 10) : Date.now(),
    createdAt: new Date().toISOString()
  };
}

/**
 * Safely parses and unwraps Kafka messages coming from Debezium Outbox CDC events.
 * Encapsulates nested JSON parsing safely.
 * @param {Buffer|string} rawValue 
 * @returns {Object|null}
 */
function parseOutboxEvent(rawValue) {
  if (!rawValue) return null;
  try {
    const stringVal = typeof rawValue === "string" ? rawValue : rawValue.toString("utf8");
    const parsed = JSON.parse(stringVal);

    let eventData = parsed;
    // Unwrap Debezium CDC envelope if present
    if (parsed && parsed.payload && parsed.payload.after) {
      const after = parsed.payload.after;
      eventData = typeof after.payload === "string" ? JSON.parse(after.payload) : after.payload;
    }

    if (!eventData || typeof eventData !== "object") return null;

    // Standardize sequenceId type
    if (eventData.sequenceId) {
      eventData.sequenceId = parseInt(eventData.sequenceId, 10);
    }

    return eventData;
  } catch (err) {
    console.error("[Shared Event Parser] Failed to parse CDC message payload:", err.message);
    return null;
  }
}

module.exports = {
  EVENT_TYPES,
  ROOMS,
  KAFKA_CONFIG,
  RECOVERY_CONFIG,
  createOutboxPayload,
  parseOutboxEvent
};

