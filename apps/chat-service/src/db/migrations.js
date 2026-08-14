const { pool } = require("../config/db");

/**
 * Initializes database schema for messages and outbox tables.
 * Includes indexes and table setup.
 */
async function initSchema() {
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // 1. Messages Domain Table (Ground Truth)
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        sequence_id BIGSERIAL UNIQUE,
        room_id VARCHAR(64) NOT NULL,
        sender_id VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_messages_room_seq ON messages (room_id, sequence_id);
    `);

    // 2. Transactional Outbox Table (Target for Debezium CDC)
    await client.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        id VARCHAR(64) PRIMARY KEY,
        aggregate_type VARCHAR(64) NOT NULL,
        aggregate_id VARCHAR(64) NOT NULL,
        type VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox (created_at);
    `);

    await client.query("COMMIT");
    console.log("[DB Init] PostgreSQL schema initialized (messages & outbox tables ready).");
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.warn("[DB Init Warning] PostgreSQL connection pending:", err.message);
  } finally {
    if (client) client.release();
  }
}

/**
 * Periodically purges outbox entries older than the retention period (default 1 hour)
 * to prevent outbox table bloat while giving CDC sufficient time to consume.
 */
async function cleanupOutbox(retentionIntervalMs = 60 * 60 * 1000) {
  try {
    const result = await pool.query(
      `DELETE FROM outbox WHERE created_at < NOW() - INTERVAL '1 hour'`
    );
    if (result.rowCount > 0) {
      console.log(`[Outbox Cleanup] Purged ${result.rowCount} processed outbox records older than 1 hour.`);
    }
  } catch (err) {
    console.error("[Outbox Cleanup Error]:", err.message);
  }
}

module.exports = {
  initSchema,
  cleanupOutbox
};
