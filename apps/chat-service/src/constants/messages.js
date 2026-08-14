/**
 * Centralized API Response Messages Dictionary.
 * Prepares the codebase for future i18n (internationalization) multi-language support.
 */
const RESPONSE_MESSAGES = {
  VALIDATION: {
    INVALID_SENDER_ID: "senderId is required and must be a non-empty string",
    INVALID_CONTENT: "content is required and must be a non-empty string"
  },
  SUCCESS: {
    MESSAGE_CREATED: "Message created and queued to outbox successfully",
    SYNC_FETCHED: "Sync messages fetched successfully",
    SERVICE_HEALTHY: "Chat service is healthy"
  },
  ERROR: {
    PERSIST_FAILED: "Failed to persist message to database",
    SYNC_FETCH_FAILED: "Failed to fetch sync messages"
  }
};

/**
 * Machine-readable Error Code Constants.
 * Used by client applications (iOS/Android/Web) for programmatic error handling.
 */
const ERROR_CODES = {
  INVALID_SENDER_ID: "INVALID_SENDER_ID",
  INVALID_CONTENT: "INVALID_CONTENT",
  PERSIST_FAILED: "PERSIST_FAILED",
  SYNC_FETCH_FAILED: "SYNC_FETCH_FAILED"
};

module.exports = {
  RESPONSE_MESSAGES,
  ERROR_CODES
};
