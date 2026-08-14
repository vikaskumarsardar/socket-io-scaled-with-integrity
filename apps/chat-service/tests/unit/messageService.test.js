const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createMessageService, normalizePageLimit } = require("../../src/services/messageService");

describe("MessageService Business Logic Unit Tests", () => {
  it("executes strategy queries correctly with injected fake repository", async () => {
    const fakeRepo = {
      insertMessage: async () => ({ id: "msg_1", sequence_id: "1" }),
      insertOutboxEvent: async () => ({ id: "out_1" }),
      findLatestMessages: async (roomId, limit) => [
        { id: "msg_10", sequenceId: "10", roomId, senderId: "user_a", content: "Hello", createdAt: new Date() }
      ],
      findOlderMessages: async () => [],
      findSyncMessagesSince: async () => []
    };

    const service = createMessageService(fakeRepo);

    const messages = await service.fetchSyncMessages({
      roomId: "room_general",
      sinceSeq: 0,
      limit: 10
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, "msg_10");
    assert.equal(typeof messages[0].sequenceId, "number");
    assert.equal(messages[0].sequenceId, 10);
  });

  it("enforces normalizePageLimit boundary constraints", () => {
    assert.equal(normalizePageLimit(0), 50);
    assert.equal(normalizePageLimit(50), 50);
    assert.equal(normalizePageLimit(1000), 500);
  });
});
