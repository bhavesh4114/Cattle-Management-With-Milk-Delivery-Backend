const express = require("express");
const controller = require("../controllers/chatController");
const { authenticateAdmin } = require("../middleware/auth");

const router = express.Router();

// All chat endpoints require JWT authentication
router.use(authenticateAdmin);

// Participant routes (User and Delivery Boy)
router.get("/my-conversation", controller.getMyConversation);

// Admin routes
router.get("/conversations", controller.getAdminConversations);

// Shared conversation routes (protected by participant authorization)
router.get("/conversations/:id/messages", controller.getConversationMessages);
router.post("/conversations/:id/messages", controller.sendMessage);
router.put("/conversations/:id/read", controller.markMessagesAsRead);

// Unread count
router.get("/unread-count", controller.getUnreadCount);

module.exports = router;
