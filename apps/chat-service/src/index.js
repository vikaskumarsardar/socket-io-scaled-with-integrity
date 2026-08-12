const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { EVENT_TYPES, ROOMS, createOutboxPayload } = require("@app/shared");

const app = express();
app.use(cors());
app.use(express.json());

// -----------------------------------------------------------------------------
// PostgreSQL Pool Connection
// -----------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgrespassword",
  database: process.env.POSTGRES_DB || "chat_db",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// -----------------------------------------------------------------------------
// Initialize Database Schema (Transactional Outbox Pattern)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Endpoint 1: POST /api/v1/messages (Transactional Outbox Pattern)
// -----------------------------------------------------------------------------
app.post("/api/v1/messages", async (req, res) => {
  const { roomId = ROOMS.GENERAL, senderId, content } = req.body;

  if (!senderId || !content) {
    return res.status(400).json({ error: "senderId and content are required" });
  }

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const outboxId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  let client;
  try {
    client = await pool.connect();
    // 💡 ATOMIC TRANSACTION: Write to BOTH messages table & outbox table in 1 transaction
    await client.query("BEGIN");

    // 1. Insert into domain table (messages)
    const msgResult = await client.query(
      `INSERT INTO messages (id, room_id, sender_id, content) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, sequence_id, room_id, sender_id, content, created_at`,
      [messageId, roomId, senderId, content]
    );

    const savedMessage = msgResult.rows[0];

    // 2. Insert into outbox table using shared schema builder
    const eventPayload = createOutboxPayload(
      savedMessage.id,
      savedMessage.sequence_id,
      savedMessage.room_id,
      savedMessage.sender_id,
      savedMessage.content,
      req.body.sentAt
    );

    await client.query(
      `INSERT INTO outbox (id, aggregate_type, aggregate_id, type, payload) 
       VALUES ($1, $2, $3, $4, $5)`,
      [outboxId, "CHAT_ROOM", roomId, EVENT_TYPES.NEW_MESSAGE, JSON.stringify(eventPayload)]
    );

    // Commit Transaction
    await client.query("COMMIT");

    console.log(`[Outbox Inserted] Msg ID: ${savedMessage.id} | Seq: ${savedMessage.sequence_id}`);

    return res.status(201).json({
      success: true,
      message: { ...savedMessage, sequence_id: parseInt(savedMessage.sequence_id, 10) }
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("[Post Message Error] Transaction rolled back:", err.message);
    return res.status(500).json({ error: "Failed to persist message" });
  } finally {
    if (client) client.release();
  }
});

// -----------------------------------------------------------------------------
// Endpoint 2: GET /api/v1/messages/sync (Full Catch-Up Recovery Endpoint)
// -----------------------------------------------------------------------------
app.get("/api/v1/messages/sync", async (req, res) => {
  const sinceSeq = parseInt(req.query.since || "0", 10);
  const beforeSeq = req.query.before ? parseInt(req.query.before, 10) : null;
  const roomId = req.query.roomId || ROOMS.GENERAL;
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);

  try {
    let query;
    let queryParams;

    if (beforeSeq !== null) {
      // 1. Infinite Scroll Up: Fetch older history BEFORE beforeSeq
      query = `
        SELECT id, sequence_id AS "sequenceId", room_id AS "roomId", 
               sender_id AS "senderId", content, created_at AS "createdAt"
        FROM (
          SELECT id, sequence_id, room_id, sender_id, content, created_at
          FROM messages 
          WHERE room_id = $1 AND sequence_id < $2
          ORDER BY sequence_id DESC 
          LIMIT $3
        ) sub ORDER BY sequence_id ASC`;
      queryParams = [roomId, beforeSeq, limit];
    } else if (sinceSeq === 0) {
      // 2. Initial Page Load: Fetch the LATEST 50 messages in the room
      query = `
        SELECT id, sequence_id AS "sequenceId", room_id AS "roomId", 
               sender_id AS "senderId", content, created_at AS "createdAt"
        FROM (
          SELECT id, sequence_id, room_id, sender_id, content, created_at
          FROM messages 
          WHERE room_id = $1
          ORDER BY sequence_id DESC 
          LIMIT $2
        ) sub ORDER BY sequence_id ASC`;
      queryParams = [roomId, limit];
    } else {
      // 3. Incremental Catch-Up Sync: Fetch all missing messages after sinceSeq
      query = `
        SELECT id, sequence_id AS "sequenceId", room_id AS "roomId", 
               sender_id AS "senderId", content, created_at AS "createdAt"
        FROM messages 
        WHERE room_id = $1 AND sequence_id > $2 
        ORDER BY sequence_id ASC 
        LIMIT $3`;
      queryParams = [roomId, sinceSeq, 500];
    }

    const result = await pool.query(query, queryParams);

    console.log(`[REST Sync Query] roomId=${roomId}, since=${sinceSeq} -> Found ${result.rows.length} messages`);

    return res.json({
      recoveredViaRest: true,
      messages: result.rows.map(r => ({ ...r, sequenceId: parseInt(r.sequenceId, 10) }))
    });
  } catch (err) {
    console.error("[REST Sync Error]:", err.message);
    return res.status(500).json({ error: "Failed to fetch sync messages" });
  }
});

app.get("/health", (req, res) => res.json({ status: "UP", service: "chat-service" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(` [apps/chat-service] Running on port ${PORT}`);
  console.log(` Pattern: Transactional Outbox (PostgreSQL)`);
  console.log(` Shared Package: @app/shared loaded`);
  console.log(`=======================================================`);
  await initSchema();
});
