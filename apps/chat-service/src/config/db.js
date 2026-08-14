const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgrespassword",
  database: process.env.POSTGRES_DB || "chat_db",
  max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || "20", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on("error", (err) => {
  console.error("[PostgreSQL Pool Error] Unexpected idle client error:", err.message);
});

async function closePool() {
  console.log("[DB] Closing PostgreSQL connection pool...");
  await pool.end();
  console.log("[DB] PostgreSQL pool closed.");
}

module.exports = {
  pool,
  closePool
};
