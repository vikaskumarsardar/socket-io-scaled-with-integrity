// Shared Event Constants across Chat Service, Socket Gateway, and Client Demo

const EVENT_TYPES = {
  NEW_MESSAGE: "NEW_MESSAGE",
  USER_TYPING: "USER_TYPING",
  USER_JOINED: "USER_JOINED"
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

function createOutboxPayload(messageId, sequenceId, roomId, senderId, content) {
  return {
    messageId,
    sequenceId: parseInt(sequenceId, 10),
    roomId,
    senderId,
    content,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  EVENT_TYPES,
  ROOMS,
  KAFKA_CONFIG,
  RECOVERY_CONFIG,
  createOutboxPayload
};
