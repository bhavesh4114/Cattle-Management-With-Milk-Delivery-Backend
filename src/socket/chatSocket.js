const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const chatService = require("../services/chatService");

let io = null;
const onlineUsers = new Map(); // userId -> { count: number, role: string, name: string }

function getIO() {
  return io;
}

function isUserOnline(userId) {
  return onlineUsers.has(Number(userId));
}

function initSocket(server, isAllowedOrigin) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || (isAllowedOrigin && isAllowedOrigin(origin))) {
          callback(null, true);
        } else {
          callback(null, true); // fallback allow for socket handshakes
        }
      },
      credentials: false,
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // Authentication Middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded || !decoded.id) {
        return next(new Error("Invalid token"));
      }

      const admin = await prisma.admin.findUnique({
        where: { id: decoded.id },
        include: {
          customRole: true,
          deliveryProfile: true,
        },
      });

      if (!admin || admin.status === "Inactive") {
        return next(new Error("Account inactive or deleted"));
      }

      const chatRole = chatService.resolveChatRole(admin);
      socket.user = {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        chatRole,
      };

      next();
    } catch (err) {
      console.warn("[socket.auth] Verification failed:", err.message);
      next(new Error("Authentication failed: " + err.message));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    if (!user) return;

    // Track online status
    const current = onlineUsers.get(user.id) || { count: 0, role: user.chatRole, name: user.name };
    current.count += 1;
    onlineUsers.set(user.id, current);

    // Join user's personal room
    socket.join(`user_${user.id}`);

    // If Admin, join admins room
    if (user.chatRole === "ADMIN") {
      socket.join("admins");
    }

    // Broadcast online status to others
    io.emit("user_status", {
      userId: user.id,
      isOnline: true,
      role: user.chatRole,
    });

    // Provide initial list of online users on request
    socket.on("get_online_users", (callback) => {
      if (typeof callback === "function") {
        const onlineIds = Array.from(onlineUsers.keys());
        callback({ onlineUserIds: onlineIds });
      }
    });

    // Handle joining a specific conversation room
    socket.on("join_conversation", async (data, callback) => {
      try {
        const conversationId = parseInt(data?.conversationId, 10);
        if (!conversationId) {
          if (callback) callback({ error: "Invalid conversation ID" });
          return;
        }

        // Verify authorization
        await chatService.getConversationById(conversationId, user);
        socket.join(`conversation_${conversationId}`);

        if (callback) callback({ success: true, conversationId });
      } catch (err) {
        if (callback) callback({ error: err.message });
      }
    });

    // Handle leaving a conversation room
    socket.on("leave_conversation", (data) => {
      const conversationId = parseInt(data?.conversationId, 10);
      if (conversationId) {
        socket.leave(`conversation_${conversationId}`);
      }
    });

    // Handle sending message via Socket (optional shortcut for REST)
    socket.on("send_message", async (data, callback) => {
      try {
        const conversationId = parseInt(data?.conversationId, 10);
        const text = data?.messageText || data?.text;

        const { message, conversation } = await chatService.sendMessage(conversationId, user, text);

        // Broadcast to conversation room
        io.to(`conversation_${conversationId}`).emit("new_message", {
          conversationId,
          message,
        });

        // Broadcast notification to participant and admins
        io.to(`user_${conversation.participantId}`).emit("conversation_updated", {
          conversationId,
          lastMessage: message,
        });
        io.to("admins").emit("conversation_updated", {
          conversationId,
          lastMessage: message,
          participantRole: conversation.participantRole,
        });

        if (callback) callback({ success: true, message });
      } catch (err) {
        if (callback) callback({ error: err.message });
      }
    });

    // Handle typing indicators
    socket.on("typing", (data) => {
      const conversationId = parseInt(data?.conversationId, 10);
      const isTyping = Boolean(data?.isTyping);
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit("user_typing", {
          conversationId,
          userId: user.id,
          userName: user.name,
          role: user.chatRole,
          isTyping,
        });
      }
    });

    // Handle read receipt via Socket
    socket.on("mark_read", async (data, callback) => {
      try {
        const conversationId = parseInt(data?.conversationId, 10);
        if (!conversationId) return;

        const result = await chatService.markMessagesAsRead(conversationId, user);
        io.to(`conversation_${conversationId}`).emit("messages_read", {
          conversationId,
          readerRole: result.readerRole,
          readAt: new Date().toISOString(),
        });

        if (callback) callback({ success: true });
      } catch (err) {
        if (callback) callback({ error: err.message });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      const current = onlineUsers.get(user.id);
      if (current) {
        current.count -= 1;
        if (current.count <= 0) {
          onlineUsers.delete(user.id);
          io.emit("user_status", {
            userId: user.id,
            isOnline: false,
            role: user.chatRole,
          });
        }
      }
    });
  });

  return io;
}

module.exports = {
  initSocket,
  getIO,
  isUserOnline,
};
