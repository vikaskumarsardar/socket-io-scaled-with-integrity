# ADR 001: Transactional Outbox Pattern & Debezium CDC vs. Dual-Write Pattern

* **Status:** Accepted
* **Deciders:** Distributed Systems Architecture Team
* **Date:** 2026-08-14

---

## Context & Problem Statement

In an event-driven microservices architecture, when a business transaction occurs (e.g., creating a message or processing a financial order), two actions must take place:
1. Persist the business entity to PostgreSQL (System of Record).
2. Publish an event to Kafka/Redis so downstream WebSocket gateways can broadcast real-time updates.

A naive approach is the **Dual-Write Pattern** (writing to DB, then calling `kafkaProducer.send()` inside the HTTP handler).

### The Dual-Write Problem:
If the application crashes, network drops, or Kafka broker times out *after* committing to Postgres but *before* publishing to Kafka, the state in the database and the state in downstream real-time subscribers diverge permanently. This results in lost events and corrupted client state.

---

## Decision Driver & Requirements

* **Zero Message Loss Guarantee (At-Least-Once Delivery):** Must guarantee that every state change committed to the database is emitted to Kafka.
* **Strict ACID Compliance:** Database transactions must maintain full ACID guarantees.
* **Decoupled System Latency:** Database writes must complete fast without waiting for external message broker network round-trips.

---

## Proposed Options Considered

### Option 1: Direct Dual-Write in Application Code
- **Pros:** Easy to write initially.
- **Cons:** Flawed architecture. Vulnerable to partial failures, network timeouts, and lost events during service crashes.

### Option 2: 2-Phase Commit (2PC) / XA Transactions
- **Pros:** Strict distributed consistency across DB and Broker.
- **Cons:** High latency, low throughput, non-scalable, complex coordinator failure scenarios.

### Option 3: Transactional Outbox Pattern + Debezium Log-Based Change Data Capture (CDC) — **SELECTED**
- **Pros:**
  - The business entity insert and outbox event write occur in **1 single atomic database transaction**.
  - Debezium tail-reads PostgreSQL's Write-Ahead Log (WAL) asynchronously using the `pgoutput` plugin.
  - Zero performance overhead on application thread; database writes complete in < 10ms.
  - Debezium records WAL offsets: if Debezium or Kafka restarts, CDC resumes from the last confirmed offset, guaranteeing **at-least-once delivery**.
- **Cons:** Requires Debezium Connect and Postgres logical replication configuration (`wal_level=logical`).

---

## Decision Outcome

We selected **Option 3 (Transactional Outbox + Debezium CDC)**.

### Architectural Diagram:

```
[ HTTP Request ] 
       │
       ▼
 [ Chat Service ]
       │
 (BEGIN TRANSACTION)
   ├── INSERT INTO messages ...
   └── INSERT INTO outbox ...
 (COMMIT TRANSACTION) ──► Fast HTTP 201 Response (< 15ms)
       │
 (Postgres WAL Log)
       │
       ▼
[ Debezium CDC ] ──► [ Kafka Topic: dbserver1.public.outbox ] ──► [ Socket Gateway ]
```

### Consequences:
* **Guaranteed Data Consistency:** Outbox entries only exist if the business entity transaction committed successfully.
* **Automatic Recovery:** Failed downstream services can catch up by consuming Kafka offset streams without querying Postgres.
* **Outbox Retention:** To prevent table bloat, an automated periodic worker purges processed outbox records older than 1 hour.
