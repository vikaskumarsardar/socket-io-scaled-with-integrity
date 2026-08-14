/**
 * Standard HTTP Status Codes
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

/**
 * Enterprise Industry-Standard Unified Response Envelope Handler.
 * Formats every HTTP response with consistent root properties:
 * { success, statusCode, message, data, error, timestamp }
 * 
 * @param {Object} res Express Response Object
 * @param {Object} options Response configuration options
 * @param {number} options.statusCode HTTP Status Code (default 200)
 * @param {boolean} [options.success] Success flag override (defaults based on statusCode < 400)
 * @param {string} [options.message] Human-readable response summary message
 * @param {*} [options.data] Primary response payload data
 * @param {*} [options.error] Error details or code when status >= 400
 */
function sendResponse(res, {
  statusCode = HTTP_STATUS.OK,
  success,
  message = "",
  data = null,
  error = null
}) {
  const isSuccess = typeof success === "boolean" ? success : statusCode < 400;

  const responsePayload = {
    success: isSuccess,
    statusCode,
    message: message || (isSuccess ? "Request processed successfully" : "An error occurred"),
    ...(data !== null && { data }),
    ...(error !== null && { error }),
    timestamp: new Date().toISOString()
  };

  return res.status(statusCode).json(responsePayload);
}

module.exports = {
  HTTP_STATUS,
  sendResponse
};
