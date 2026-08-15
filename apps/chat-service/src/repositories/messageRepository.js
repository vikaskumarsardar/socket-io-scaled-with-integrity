const { pool } = require("../config/db");

/**
 * Message Repository Layer isolating raw SQL queries from business logic.
 */
const messageRepository = {
  /**
   * Inserts a domain message record.
   */
  async insertMessage(client, { id, roomId, senderId, content }) {
    const res = await client.query(
      `INSERT INTO messages (id, room_id, sender_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sequence_id, room_id, sender_id, content, created_at`,
      [id, roomId, senderId, content]
    );
    return res.rows[0];
  },

  /**
   * Inserts an outbox CDC record.
   */
  async insertOutboxEvent(client, { id, aggregateType, aggregateId, type, payload }) {
    const res = await client.query(
      `INSERT INTO outbox (id, aggregate_type, aggregate_id, type, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, aggregateType, aggregateId, type, JSON.stringify(payload)]
    );
    return res.rows[0];
  },

  /**
   * Fetches latest N messages sorted chronologically (ASC) for initial page load.
   */
  async findLatestMessages(roomId, limit) {
    const res = await pool.query(
      `SELECT * FROM (
         SELECT id, sequence_id AS "sequenceId", room_id AS "roomId",
                sender_id AS "senderId", content, created_at AS "createdAt"
         FROM messages
         WHERE room_id = $1
         ORDER BY sequence_id DESC
         LIMIT $2
       ) sub
       ORDER BY "sequenceId" ASC`,
      [roomId, limit]
    );
    return res.rows;
  },

  /**
   * Fetches messages created SINCE a specific sequence ID (Delta Catch-Up).
   */
  async findSyncMessagesSince(roomId, sinceSeq, limit) {
    const res = await pool.query(
      `SELECT id, sequence_id AS "sequenceId", room_id AS "roomId",
              sender_id AS "senderId", content, created_at AS "createdAt"
       FROM messages
       WHERE room_id = $1 AND sequence_id > $2
       ORDER BY sequence_id ASC
       LIMIT $3`,
      [roomId, sinceSeq, limit]
    );
    return res.rows;
  },

  /**
   * Fetches older messages BEFORE a specific sequence ID for history pagination.
   */
  async findOlderMessages(roomId, beforeSeq, limit) {
    const res = await pool.query(
      `SELECT * FROM (
         SELECT id, sequence_id AS "sequenceId", room_id AS "roomId",
                sender_id AS "senderId", content, created_at AS "createdAt"
         FROM messages
         WHERE room_id = $1 AND sequence_id < $2
         ORDER BY sequence_id DESC
         LIMIT $3
       ) sub
       ORDER BY "sequenceId" ASC`,
      [roomId, beforeSeq, limit]
    );
    return res.rows;
  }
};

module.exports = messageRepository;
