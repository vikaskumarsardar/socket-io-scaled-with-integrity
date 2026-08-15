const crypto = require("crypto");
const { pool } = require("../config/db");
const { EVENT_TYPES, ROOMS, createOutboxPayload } = require("@app/shared");
const defaultMessageRepository = require("../repositories/messageRepository");

// Domain Constants
const AGGREGATE_TYPE_CHAT_ROOM = "CHAT_ROOM";
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 500;
const MIN_PAGE_LIMIT = 1;

/**
 * Helper to clamp page limits safely within allowable bounds.
 */
function normalizePageLimit(requestedLimit) {
  const parsedLimit = parseInt(requestedLimit || DEFAULT_PAGE_LIMIT, 10);
  return Math.min(Math.max(MIN_PAGE_LIMIT, parsedLimit), MAX_PAGE_LIMIT);
}

/**
 * Factory function creating a MessageService instance with Dependency Injection.
 * Depends strictly on the repository interface abstraction, satisfying DIP.
 * 
 * @param {Object} messageRepo Injected Message Repository Interface
 */
function createMessageService(messageRepo = defaultMessageRepository) {
  return {
    /**
     * Creates a message and outbox record atomically inside a single DB transaction.
     */
    async createMessageTransactional({ roomId = ROOMS.GENERAL, senderId, content, sentAt }) {
      const messageId = `msg_${crypto.randomUUID()}`;
      const outboxId = `out_${crypto.randomUUID()}`;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Insert domain message via injected repository
        const savedMessage = await messageRepo.insertMessage(client, {
          id: messageId,
          roomId,
          senderId,
          content
        });

        // 2. Build Outbox CDC payload
        const eventPayload = createOutboxPayload(
          savedMessage.id,
          savedMessage.sequence_id,
          savedMessage.room_id,
          savedMessage.sender_id,
          savedMessage.content,
          sentAt
        );

        // 3. Insert outbox record via injected repository
        await messageRepo.insertOutboxEvent(client, {
          id: outboxId,
          aggregateType: AGGREGATE_TYPE_CHAT_ROOM,
          aggregateId: roomId,
          type: EVENT_TYPES.NEW_MESSAGE,
          payload: eventPayload
        });

        await client.query("COMMIT");

        return {
          ...savedMessage,
          sequence_id: parseInt(savedMessage.sequence_id, 10)
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },

    /**
     * Strategy-pattern helper for fetching messages based on sync parameters.
     */
    async fetchSyncMessages({ roomId = ROOMS.GENERAL, sinceSeq = 0, beforeSeq = null, limit = DEFAULT_PAGE_LIMIT }) {
      const safeLimit = normalizePageLimit(limit);

      const isOlderHistoryQuery = beforeSeq !== null && beforeSeq !== undefined;
      const isInitialPageLoad = sinceSeq === 0 || sinceSeq === null || sinceSeq === undefined;

      let messages;

      if (isOlderHistoryQuery) {
        messages = await messageRepo.findOlderMessages(roomId, beforeSeq, safeLimit);
      } else if (isInitialPageLoad) {
        messages = await messageRepo.findLatestMessages(roomId, safeLimit);
      } else {
        messages = await messageRepo.findSyncMessagesSince(roomId, sinceSeq, MAX_PAGE_LIMIT);
      }

      return messages.map(r => ({
        ...r,
        sequenceId: parseInt(r.sequenceId, 10)
      }));
    }
  };
}

// Export Factory function and default service instance for DIP compliance
const defaultService = createMessageService(defaultMessageRepository);

module.exports = {
  createMessageService,
  createMessageTransactional: defaultService.createMessageTransactional,
  fetchSyncMessages: defaultService.fetchSyncMessages,
  normalizePageLimit
};
