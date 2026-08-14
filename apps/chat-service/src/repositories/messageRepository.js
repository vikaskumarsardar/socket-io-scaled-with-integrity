const { pool } = require("../config/db");

/**
 * Inserts a domain message record into the messages table.
 * Accepts a DB client or pool for transaction participation.
 * @param {Object} executor DB client or pool
 * @param {Object} params Message insertion parameters
 * @returns {Promise<Object>}
 */
async function insertMessage(executor, { id, roomId, senderId, content }) {
  const query = `
    INSERT INTO messages (id, room_id, sender_id, content) 
    VALUES ($1, $2, $3, $4) 
    RETURNING id, sequence_id, room_id, sender_id, content, created_at
  `;
  const result = await executor.query(query, [id, roomId, senderId, content]);
  return result.rows[0];
}

/**
 * Inserts a CDC event record into the outbox table.
 * Accepts a DB client or pool for transaction participation.
 * @param {Object} executor DB client or pool
 * @param {Object} params Outbox insertion parameters
 * @returns {Promise<Object>}
 */
async function insertOutboxEvent(executor, { id, aggregateType, aggregateId, type, payload }) {
  const query = `
    INSERT INTO outbox (id, aggregate_type, aggregate_id, type, payload) 
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, created_at
  `;
  const serializedPayload = typeof payload === "string" ? payload : JSON.stringify(payload);
  const result = await executor.query(query, [id, aggregateType, aggregateId, type, serializedPayload]);
  return result.rows[0];
}

/**
 * Fetches messages older than a given sequence ID (Infinite Scroll Up).
 */
async function findOlderMessages(roomId, beforeSeq, limit) {
  const query = `
    SELECT id, sequence_id AS "sequenceId", room_id AS "roomId", 
           sender_id AS "senderId", content, created_at AS "createdAt"
    FROM (
      SELECT id, sequence_id, room_id, sender_id, content, created_at
      FROM messages 
      WHERE room_id = $1 AND sequence_id < $2
      ORDER BY sequence_id DESC 
      LIMIT $3
    ) sub ORDER BY sequence_id ASC
  `;
  const result = await pool.query(query, [roomId, beforeSeq, limit]);
  return result.rows;
}

/**
 * Fetches the latest N messages in a room (Initial Page Load).
 */
async function findLatestMessages(roomId, limit) {
  const query = `
    SELECT id, sequence_id AS "sequenceId", room_id AS "roomId", 
           sender_id AS "senderId", content, created_at AS "createdAt"
    FROM (
      SELECT id, sequence_id, room_id, sender_id, content, created_at
      FROM messages 
      WHERE room_id = $1
      ORDER BY sequence_id DESC 
      LIMIT $2
    ) sub ORDER BY sequence_id ASC
  `;
  const result = await pool.query(query, [roomId, limit]);
  return result.rows;
}

/**
 * Fetches missing messages after a given sequence ID (Incremental Sync).
 */
async function findSyncMessagesSince(roomId, sinceSeq, limit) {
  const query = `
    SELECT id, sequence_id AS "sequenceId", room_id AS "roomId", 
           sender_id AS "senderId", content, created_at AS "createdAt"
    FROM messages 
    WHERE room_id = $1 AND sequence_id > $2 
    ORDER BY sequence_id ASC 
    LIMIT $3
  `;
  const result = await pool.query(query, [roomId, sinceSeq, limit]);
  return result.rows;
}

module.exports = {
  insertMessage,
  insertOutboxEvent,
  findOlderMessages,
  findLatestMessages,
  findSyncMessagesSince
};
