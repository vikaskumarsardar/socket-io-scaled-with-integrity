const express = require("express");
const { postMessage, getSyncMessages, getHealth } = require("../controllers/messageController");

const router = express.Router();

router.post("/api/v1/messages", postMessage);
router.get("/api/v1/messages/sync", getSyncMessages);
router.get("/health", getHealth);

module.exports = router;
