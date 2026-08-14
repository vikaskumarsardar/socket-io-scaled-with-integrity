const { ROOMS } = require("@app/shared");
const { createMessageTransactional, fetchSyncMessages } = require("../services/messageService");
const { HTTP_STATUS, sendResponse } = require("../utils/response");
const { RESPONSE_MESSAGES, ERROR_CODES } = require("../constants/messages");

/**
 * Helper to validate whether a value is a non-empty string.
 * @param {*} value 
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function postMessage(req, res) {
  const { roomId = ROOMS.GENERAL, senderId, content, sentAt } = req.body;

  if (!isNonEmptyString(senderId)) {
    return sendResponse(res, {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: RESPONSE_MESSAGES.VALIDATION.INVALID_SENDER_ID,
      error: ERROR_CODES.INVALID_SENDER_ID
    });
  }

  if (!isNonEmptyString(content)) {
    return sendResponse(res, {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: RESPONSE_MESSAGES.VALIDATION.INVALID_CONTENT,
      error: ERROR_CODES.INVALID_CONTENT
    });
  }

  try {
    const message = await createMessageTransactional({
      roomId,
      senderId,
      content,
      sentAt
    });

    console.log(`[Outbox Inserted] Msg ID: ${message.id} | Seq: ${message.sequence_id}`);

    return sendResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: RESPONSE_MESSAGES.SUCCESS.MESSAGE_CREATED,
      data: { message }
    });
  } catch (err) {
    console.error("[Post Message Error] Transaction rolled back:", err.message);
    return sendResponse(res, {
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: RESPONSE_MESSAGES.ERROR.PERSIST_FAILED,
      error: ERROR_CODES.PERSIST_FAILED
    });
  }
}

async function getSyncMessages(req, res) {
  const sinceSeq = parseInt(req.query.since || "0", 10);
  const beforeSeq = req.query.before ? parseInt(req.query.before, 10) : null;
  const roomId = req.query.roomId || ROOMS.GENERAL;
  const limit = parseInt(req.query.limit || "50", 10);

  try {
    const messages = await fetchSyncMessages({
      roomId,
      sinceSeq,
      beforeSeq,
      limit
    });

    console.log(`[REST Sync Query] roomId=${roomId}, since=${sinceSeq} -> Found ${messages.length} messages`);

    return sendResponse(res, {
      statusCode: HTTP_STATUS.OK,
      message: RESPONSE_MESSAGES.SUCCESS.SYNC_FETCHED,
      data: {
        recoveredViaRest: true,
        messages
      }
    });
  } catch (err) {
    console.error("[REST Sync Error]:", err.message);
    return sendResponse(res, {
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: RESPONSE_MESSAGES.ERROR.SYNC_FETCH_FAILED,
      error: ERROR_CODES.SYNC_FETCH_FAILED
    });
  }
}

function getHealth(req, res) {
  return sendResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: RESPONSE_MESSAGES.SUCCESS.SERVICE_HEALTHY,
    data: {
      status: "UP",
      service: "chat-service"
    }
  });
}

module.exports = {
  postMessage,
  getSyncMessages,
  getHealth,
  isNonEmptyString
};
