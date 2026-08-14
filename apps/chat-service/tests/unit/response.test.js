const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { HTTP_STATUS, sendResponse } = require("../../src/utils/response");

describe("Response Utility Unit Tests", () => {
  it("formats standard JSON envelope correctly for success responses", () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      }
    };

    sendResponse(mockRes, {
      statusCode: HTTP_STATUS.CREATED,
      message: "Message created",
      data: { id: "msg_123" }
    });

    assert.equal(capturedStatus, 201);
    assert.equal(capturedJson.success, true);
    assert.equal(capturedJson.statusCode, 201);
    assert.equal(capturedJson.message, "Message created");
    assert.equal(capturedJson.data.id, "msg_123");
    assert.ok(capturedJson.timestamp);
  });

  it("formats error JSON envelope correctly for failure responses", () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      }
    };

    sendResponse(mockRes, {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: "Invalid payload",
      error: "INVALID_PAYLOAD"
    });

    assert.equal(capturedStatus, 400);
    assert.equal(capturedJson.success, false);
    assert.equal(capturedJson.statusCode, 400);
    assert.equal(capturedJson.error, "INVALID_PAYLOAD");
  });
});
