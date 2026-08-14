const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createOutboxPayload, parseOutboxEvent } = require("../src/events");

describe("Shared Package Events & Payload Suite", () => {
  it("constructs valid outbox payload object with standardized properties", () => {
    const payload = createOutboxPayload("msg_1", "42", "room_general", "user_alice", "Hello world", "1710000000000");

    assert.equal(payload.messageId, "msg_1");
    assert.equal(payload.sequenceId, 42);
    assert.equal(payload.roomId, "room_general");
    assert.equal(payload.senderId, "user_alice");
    assert.equal(payload.content, "Hello world");
    assert.equal(payload.sentAt, 1710000000000);
    assert.ok(payload.createdAt);
  });

  it("unwraps Debezium CDC envelope JSON payload successfully", () => {
    const debeziumCdcEnvelope = JSON.stringify({
      payload: {
        after: {
          payload: JSON.stringify({
            messageId: "msg_100",
            sequenceId: "100",
            roomId: "room_general",
            senderId: "user_bob",
            content: "CDC test message"
          })
        }
      }
    });

    const parsed = parseOutboxEvent(Buffer.from(debeziumCdcEnvelope));

    assert.ok(parsed);
    assert.equal(parsed.messageId, "msg_100");
    assert.equal(parsed.sequenceId, 100);
    assert.equal(parsed.roomId, "room_general");
    assert.equal(parsed.senderId, "user_bob");
  });

  it("returns null when CDC payload is corrupted or null", () => {
    assert.equal(parseOutboxEvent(null), null);
    assert.equal(parseOutboxEvent("invalid-json"), null);
  });
});
