const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { socketAuthMiddleware } = require("../../src/middleware/auth");
const { isSocketBackpressured } = require("../../src/handlers/socketHandler");

describe("Socket Gateway Middleware & Eviction Suite", () => {
  it("allows connection with valid userId fallback in handshake auth", () => {
    let passedNextErr = null;
    const mockSocket = {
      handshake: {
        auth: { userId: "user_test_123" }
      }
    };

    const next = (err) => {
      passedNextErr = err;
    };

    socketAuthMiddleware(mockSocket, next);

    assert.equal(passedNextErr, undefined);
    assert.equal(mockSocket.userId, "user_test_123");
  });

  it("rejects connection when handshake auth is missing token and userId", () => {
    let passedNextErr = null;
    const mockSocket = {
      handshake: { auth: {} }
    };

    const next = (err) => {
      passedNextErr = err;
    };

    socketAuthMiddleware(mockSocket, next);

    assert.ok(passedNextErr instanceof Error);
    assert.ok(passedNextErr.message.includes("Authentication failed"));
  });

  it("identifies backpressured sockets when writeBuffer exceeds threshold", () => {
    const healthySocket = {
      conn: { writeBuffer: [1, 2, 3] }
    };

    const backpressuredSocket = {
      conn: { writeBuffer: new Array(201).fill("packet") }
    };

    assert.equal(isSocketBackpressured(healthySocket), false);
    assert.equal(isSocketBackpressured(backpressuredSocket), true);
  });
});
