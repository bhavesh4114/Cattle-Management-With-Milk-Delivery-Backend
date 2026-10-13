const chatService = require("../services/chatService");
const { getIO } = require("../socket/chatSocket");

exports.getMyConversation = async (req, res) => {
  try {
    const role = chatService.resolveChatRole(req.admin);
    if (role === "ADMIN") {
      return res.status(400).json({ message: "Admin accounts should use /api/chat/conversations" });
    }

    const conversation = await chatService.getOrCreateConversation(req.admin.id, role);
    return res.json({ conversation });
  } catch (error) {
    console.error("[chatController.getMyConversation] Error:", error);
    return res.status(500).json({ message: error.message || "Failed to get conversation" });
  }
};

exports.getAdminConversations = async (req, res) => {
  try {
    const role = chatService.resolveChatRole(req.admin);
    if (role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    const { filter, search, limit, offset } = req.query;
    const result = await chatService.getAdminConversations({ filter, search, limit, offset });
    return res.json(result);
  } catch (error) {
    console.error("[chatController.getAdminConversations] Error:", error);
    return res.status(500).json({ message: error.message || "Failed to fetch conversations" });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { limit, beforeMessageId } = req.query;

    const result = await chatService.getConversationMessages(conversationId, req.admin, {
      limit,
      beforeMessageId,
    });
    return res.json(result);
  } catch (error) {
    console.error("[chatController.getConversationMessages] Error:", error);
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Failed to load messages" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const messageText = req.body.messageText || req.body.text;

    const { message, conversation } = await chatService.sendMessage(conversationId, req.admin, messageText);

    // Emit socket event if socket.io is running
    try {
      const io = getIO();
      if (io) {
        // Broadcast to conversation room
        io.to(`conversation_${conversationId}`).emit("new_message", {
          conversationId,
          message,
        });

        // Broadcast notification to participant room and admin room
        io.to(`user_${conversation.participantId}`).emit("conversation_updated", {
          conversationId,
          lastMessage: message,
        });
        io.to("admins").emit("conversation_updated", {
          conversationId,
          lastMessage: message,
          participantRole: conversation.participantRole,
        });
      }
    } catch (socketErr) {
      console.warn("[chatController.sendMessage] Socket broadcast error (safe ignore):", socketErr.message);
    }

    return res.status(201).json({ message, conversation });
  } catch (error) {
    console.error("[chatController.sendMessage] Error:", error);
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Failed to send message" });
  }
};

exports.markMessagesAsRead = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const result = await chatService.markMessagesAsRead(conversationId, req.admin);

    // Emit read event to conversation room
    try {
      const io = getIO();
      if (io) {
        io.to(`conversation_${conversationId}`).emit("messages_read", {
          conversationId,
          readerRole: result.readerRole,
          readAt: new Date().toISOString(),
        });
      }
    } catch (socketErr) {
      // safe ignore
    }

    return res.json(result);
  } catch (error) {
    console.error("[chatController.markMessagesAsRead] Error:", error);
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Failed to update read status" });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await chatService.getUnreadCount(req.admin);
    return res.json(count);
  } catch (error) {
    console.error("[chatController.getUnreadCount] Error:", error);
    return res.status(500).json({ message: error.message || "Failed to get unread count" });
  }
};
