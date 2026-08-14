# ADR 002: Scaling Socket Gateways with Redis Streams Adapter & Connection State Recovery

* **Status:** Accepted
* **Deciders:** Distributed Systems Architecture Team
* **Date:** 2026-08-14

---

## Context & Problem Statement

When deploying multiple stateless `socket-gateway` replicas behind a Kubernetes Load Balancer:
1. Sockets connected to Replica A must receive events published by Replica B when a user emits a room event.
2. WebSockets frequently experience brief network drops (Wi-Fi switches, mobile reconnects). Re-fetching the entire chat history from PostgreSQL on every 2-second reconnect creates massive database query spikes.

---

## Decision Drivers

* **Horizontal Gateway Scaling:** Gateways must scale statelessly to $N$ instances.
* **Instant Reconnection Recovery:** Short network disconnections (< 2 minutes) should seamlessly catch up missing events without hitting PostgreSQL.
* **Backpressure Defense:** Lagging/slow clients must not consume server heap memory or cause V8 Out-Of-Memory (OOM) crashes.

---

## Decision & Implementation Details

### 1. Redis Streams Adapter (`@socket.io/redis-streams-adapter`)
We selected **Redis Streams** as the inter-gateway pub/sub transport. Unlike basic Redis Pub/Sub (which is fire-and-forget), Redis Streams maintains a bounded log of recent room events.

### 2. Connection State Recovery
When a client drops and reconnects within `maxDisconnectionDuration` (2 minutes):
- Socket.IO client sends its previous `socket.id` and last received packet offset.
- `socket-gateway` fetches missing buffered events directly from Redis Streams log without touching PostgreSQL.
- `socket.recovered` is set to `true`.

### 3. Dual-Path Fallback
If disconnection exceeds 2 minutes or Redis stream buffer has expired:
- `socket.recovered` is `false`.
- Gateway instructs client to issue REST HTTP sync query (`GET /api/v1/messages/sync?since=sequenceId`) to PostgreSQL with randomized client jitter to prevent thundering herd spikes.

### 4. Memory-Safe Connection Eviction
To prevent slow receivers from causing V8 memory leaks, a server-wide monitor tracks client write buffers. If a socket's `writeBuffer.length > 200` packets, the gateway forcibly disconnects the socket (`socket.disconnect(true)`).

---

## Decision Outcome

* **Seamless UX:** Mobile clients experience zero missed messages during Wi-Fi to LTE switches.
* **DB Shielding:** 95%+ of transient reconnects are satisfied in-memory by Redis Streams.
