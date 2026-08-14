const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_key_super_secure_123!";

function socketAuthMiddleware(socket, next) {
  const auth = socket.handshake.auth;

  // 1. Direct userId fallback for local development/testing
  if (auth && auth.userId && !auth.token) {
    socket.userId = auth.userId;
    return next();
  }

  // 2. Production JWT Token Verification
  if (!auth || !auth.token) {
    return next(new Error("Authentication failed: JWT token required in handshake auth"));
  }

  try {
    const decoded = jwt.verify(auth.token, JWT_SECRET);
    socket.userId = decoded.userId || decoded.sub;
    next();
  } catch (err) {
    return next(new Error(`Authentication failed: Invalid or expired JWT token (${err.message})`));
  }
}

module.exports = {
  socketAuthMiddleware
};
