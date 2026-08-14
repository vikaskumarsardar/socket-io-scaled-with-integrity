const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { postMessage, isNonEmptyString } = require("../../src/controllers/messageController");
const { ERROR_CODES } = require("../../src/constants/messages");

describe("MessageController Request Validation & Error Suite", () => {
  it("validates string inputs correctly with isNonEmptyString helper", () => {
    assert.equal(isNonEmptyString("hello"), true);
    assert.equal(isNonEmptyString("  "), false);
    assert.equal(isNonEmptyString(""), false);
    assert.equal(isNonEmptyString(null), false);
    assert.equal(isNonEmptyString(123), false);
  });

  it("rejects postMessage request when senderId is missing or empty", async () => {
    let capturedStatus = null;
    let capturedJson = null;

    const req = {
      body: { senderId: "", content: "Valid message" }
    };

    const res = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      }
    };

    await postMessage(req, res);

    assert.equal(capturedStatus, 400);
    assert.equal(capturedJson.success, false);
    assert.equal(capturedJson.error, ERROR_CODES.INVALID_SENDER_ID);
  });

  it("rejects postMessage request when content is missing or whitespace", async () => {
    let capturedStatus = null;
    let capturedJson = null;

    const req = {
      body: { senderId: "user_alice", content: "  " }
    };

    const res = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      }
    };

    await postMessage(req, res);

    assert.equal(capturedStatus, 400);
    assert.equal(capturedJson.success, false);
    assert.equal(capturedJson.error, ERROR_CODES.INVALID_CONTENT);
  });
});
