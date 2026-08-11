# Socket.IO Scaled with Data Integrity

A production-grade, event-driven microservices architecture designed to scale **Socket.IO** to millions of concurrent WebSocket connections while guaranteeing **zero message loss**, **data integrity**, and **backpressure protection**.

---

## 🏗️ Architecture Overview

```
                                [ Client App / Web ]
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │ (POST /messages)                              │ (Pure WebSockets)
                 ▼                                               ▼
         [ Chat Service ]                              [ Socket Gateway ]
                 │                                               │
    (Single DB Transaction)                           (Redis Streams Recovery
                 │                                   & Connection State Buffer)
                 ▼                                               ▲
      [ PostgreSQL Database ]                                    │
      ├── messages (Domain Table)                                │
      └── outbox   (CDC Target)                                  │
                 │                                               │
        (WAL Change Capture)                                     │
                 ▼                                               │
      [ Debezium CDC Connect ] ──► [ Kafka: chat.outbox ] ───────┘
                                   (Event Stream Backbone)
```

---

## 🌟 Key Engineering Features

* **Transactional Outbox Pattern**: Solves the Dual-Write problem by executing atomic PostgreSQL transactions (`messages` + `outbox`).
* **Debezium CDC + Kafka Backbone**: Zero-latency log-based Change Data Capture (CDC) streaming events to Kafka.
* **Stateless Socket Gateway**: Dedicated Node.js WebSocket gateway connected to Kafka consumers and Redis Streams.
* **Connection State Recovery (`socket.recovered`)**: Powered by `@socket.io/redis-streams-adapter` for instant in-memory replay during short network blips (< 2 min).
* **Dual-Path Catch-Up Sync**: Automatic fallback to indexed REST API sync (`GET /api/v1/messages/sync`) with randomized client jitter when recovery buffers expire.
* **Pure WebSocket Transport**: Forces `transports: ["websocket"]`, eliminating HTTP sticky session bottlenecks.
* **Slow-Client Backpressure Protection**: Evicts lagging clients if `writeBuffer.length > 200` to prevent V8 Out-Of-Memory (OOM) heap crashes.
* **Volatile Ephemeral Events**: Uses `socket.volatile` for transient events (`user_typing`) to skip DB/Kafka and save CPU I/O.
* **NPM Workspaces Monorepo**: Shared constants and event contracts via `@app/shared`.

---

## 📁 Repository Directory Structure

```
socket-scaled/
├── docker-compose.yml              # Local Dev Stack (Postgres + Redis + Kafka + Zookeeper + Debezium)
├── package.json                    # Monorepo root package ("workspaces": ["apps/*", "packages/*"])
├── packages/
│   └── shared/                     # @app/shared (Event Schemas, Constants & DTO Helpers)
│       ├── package.json
│       └── src/
│           ├── index.js
│           └── events.js
└── apps/
    ├── chat-service/               # Business Microservice (PostgreSQL Transactional Outbox)
    │   ├── package.json
    │   └── src/index.js
    ├── socket-gateway/             # Real-Time Gateway (Kafka Consumer + Redis Streams)
    │   ├── package.json
    │   └── src/index.js
    └── client-demo/                # Pure WebSocket Client Demo
        ├── package.json
        └── src/index.js
```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Infrastructure Containers
Launch PostgreSQL (with logical WAL), Redis 7, Zookeeper, Kafka, and Debezium:
```bash
npm run docker:up
```

### 3. Start Microservices

In separate terminal windows:

```bash
# Terminal 1: Start Business Microservice (Port 4000)
npm run start:chat

# Terminal 2: Start Real-Time Socket Gateway (Port 3000)
npm run start:gateway

# Terminal 3: Start Client Demo
npm run start:client
```

---

## 🛡️ Performance & Defense Configurations

| Policy | Setting / Value | Purpose |
| :--- | :--- | :--- |
| **Max Payload Size** | `maxHttpBufferSize: 100KB` | Prevents large memory allocation attacks. |
| **Eviction Threshold** | `writeBuffer.length > 200` | Disconnects slow clients before server RAM bloats. |
| **Rate Limiter** | `points: 10, duration: 1` | Caps per-socket emissions at 10 msgs/sec. |
| **State Recovery Window** | `maxDisconnectionDuration: 120000` | Keeps 2-minute packet buffer in Redis Streams. |
| **Stream Trimming** | `streamMaxLen: 10000` | Caps Redis memory stream log per room. |
