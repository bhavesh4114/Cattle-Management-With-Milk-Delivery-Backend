const prisma = require("../config/db");

/**
 * Safely encode Unicode text / emojis into ASCII numeric entities (&#code;)
 * so that PostgreSQL clusters with WIN1252 or non-UTF8 database encoding
 * can store any emojis and non-Latin scripts without error 22P05.
 */
function encodeMessageText(str) {
  if (!str) return "";
  return Array.from(String(str))
    .map((c) => (c.codePointAt(0) > 127 ? `&#${c.codePointAt(0)};` : c))
    .join("");
}

function decodeMessageText(str) {
  if (!str) return "";
  return String(str).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)));
}

function decodeMessage(msg) {
  if (!msg) return msg;
  return {
    ...msg,
    messageText: decodeMessageText(msg.messageText),
  };
}
/**
 * Determine participant/user chat role based on Admin model record
 * @param {object} user - Admin DB object or auth decoded object
 * @returns {"ADMIN" | "DELIVERY_BOY" | "USER"}
 */
function resolveChatRole(user) {
  if (!user) return "USER";
  if (user.role === "ADMIN") return "ADMIN";

  const roleName = (user.customRole?.name || "").toLowerCase();
  const permissions = user.customRole?.permissions || user.permissions || [];
  const isDelivery =
    roleName.includes("delivery") ||
    roleName.includes("delever") ||
    permissions.some((p) => String(p).toLowerCase().includes("deliver")) ||
    Boolean(user.deliveryProfile);

  if (isDelivery) return "DELIVERY_BOY";
  return "USER";
}

/**
 * Get or create unique support conversation for a participant (User or Delivery Boy)
 * @param {number} participantId
 * @param {"USER" | "DELIVERY_BOY"} participantRole
 */
async function getOrCreateConversation(participantId, participantRole) {
  if (!participantId || !participantRole) {
    throw new Error("Participant ID and role are required");
  }

  // Find participant in database to make sure they exist
  const participant = await prisma.admin.findUnique({
    where: { id: participantId },
    include: {
      customRole: true,
      deliveryProfile: true,
    },
  });

  if (!participant) {
    throw new Error("Participant account not found");
  }

  // Find existing conversation
  let conversation = await prisma.chatConversation.findUnique({
    where: {
      participantId_participantRole: {
        participantId,
        participantRole,
      },
    },
    include: {
      participant: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          customRole: { select: { id: true, name: true } },
          deliveryProfile: { select: { id: true, mobile: true, dailyStatus: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!conversation) {
    // Create new support conversation
    conversation = await prisma.chatConversation.create({
      data: {
        participantId,
        participantRole,
        lastMessageAt: new Date(),
      },
      include: {
        participant: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            customRole: { select: { id: true, name: true } },
            deliveryProfile: { select: { id: true, mobile: true, dailyStatus: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }

  // Count unread messages for this participant (messages from ADMIN where readAt is null)
  const unreadCount = await prisma.chatMessage.count({
    where: {
      conversationId: conversation.id,
      senderRole: "ADMIN",
      readAt: null,
    },
  });

  return {
    ...conversation,
    unreadCount,
    lastMessage: conversation.messages[0] ? decodeMessage(conversation.messages[0]) : null,
  };
}

/**
 * Get conversations for Admin with filtering, search, and unread counts
 * @param {object} params
 */
async function getAdminConversations({ filter = "ALL", search = "", limit = 50, offset = 0 } = {}) {
  const where = {};

  const normalizedFilter = String(filter).toUpperCase();
  if (normalizedFilter === "USER" || normalizedFilter === "USERS") {
    where.participantRole = "USER";
  } else if (normalizedFilter === "DELIVERY_BOY" || normalizedFilter === "DELIVERY_BOYS" || normalizedFilter === "DELIVERY") {
    where.participantRole = "DELIVERY_BOY";
  }

  if (search && search.trim()) {
    const rawQ = search.trim();
    const safeQ = encodeMessageText(rawQ);
    where.OR = [
      {
        participant: {
          name: { contains: safeQ, mode: "insensitive" },
        },
      },
      {
        participant: {
          email: { contains: safeQ, mode: "insensitive" },
        },
      },
      {
        messages: {
          some: {
            messageText: { contains: safeQ, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const [totalCount, rawConversations] = await Promise.all([
    prisma.chatConversation.count({ where }),
    prisma.chatConversation.findMany({
      where,
      include: {
        participant: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            customRole: { select: { id: true, name: true } },
            deliveryProfile: { select: { id: true, mobile: true, dailyStatus: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: Math.min(parseInt(limit, 10) || 50, 100),
      skip: Math.max(parseInt(offset, 10) || 0, 0),
    }),
  ]);

  // Aggregate unread counts for Admin (messages from non-ADMIN where readAt is null)
  const conversationIds = rawConversations.map((c) => c.id);
  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: conversationIds },
      senderRole: { not: "ADMIN" },
      readAt: null,
    },
    _count: { id: true },
  });

  const unreadMap = new Map();
  unreadCounts.forEach((u) => {
    unreadMap.set(u.conversationId, u._count.id);
  });

  const conversations = rawConversations.map((conv) => ({
    id: conv.id,
    participantId: conv.participantId,
    participantRole: conv.participantRole,
    participant: conv.participant,
    lastMessageAt: conv.lastMessageAt,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    lastMessage: conv.messages[0] ? decodeMessage(conv.messages[0]) : null,
    unreadCount: unreadMap.get(conv.id) || 0,
  }));

  // Overall stats
  const [totalUnreadUsers, totalUnreadDelivery] = await Promise.all([
    prisma.chatMessage.count({
      where: {
        senderRole: "USER",
        readAt: null,
      },
    }),
    prisma.chatMessage.count({
      where: {
        senderRole: "DELIVERY_BOY",
        readAt: null,
      },
    }),
  ]);

  return {
    conversations,
    totalCount,
    unreadStats: {
      total: totalUnreadUsers + totalUnreadDelivery,
      users: totalUnreadUsers,
      deliveryBoys: totalUnreadDelivery,
    },
  };
}

/**
 * Get conversation by ID with authorization verification
 * @param {number} conversationId
 * @param {object} user - Authenticated user info
 */
async function getConversationById(conversationId, user) {
  const convId = parseInt(conversationId, 10);
  if (isNaN(convId)) {
    throw new Error("Invalid conversation ID");
  }

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: convId },
    include: {
      participant: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          customRole: { select: { id: true, name: true } },
          deliveryProfile: { select: { id: true, mobile: true, dailyStatus: true } },
        },
      },
    },
  });

  if (!conversation) {
    const error = new Error("Conversation not found");
    error.status = 404;
    throw error;
  }

  // Authorization check
  const role = resolveChatRole(user);
  if (role !== "ADMIN") {
    if (conversation.participantId !== user.id) {
      const error = new Error("Forbidden: You cannot access this conversation");
      error.status = 403;
      throw error;
    }
  }

  return conversation;
}

/**
 * Get paginated messages for a conversation
 * @param {number} conversationId
 * @param {object} user - Authenticated user info
 * @param {object} options
 */
async function getConversationMessages(conversationId, user, { limit = 50, beforeMessageId = null } = {}) {
  const conversation = await getConversationById(conversationId, user);

  const where = {
    conversationId: conversation.id,
  };

  if (beforeMessageId) {
    const parsedBefore = parseInt(beforeMessageId, 10);
    if (!isNaN(parsedBefore)) {
      where.id = { lt: parsedBefore };
    }
  }

  const takeLimit = Math.min(parseInt(limit, 10) || 50, 100);

  const messages = await prisma.chatMessage.findMany({
    where,
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: takeLimit,
  });

  // Return chronologically (oldest to newest for rendering)
  return {
    conversation,
    messages: messages.map(decodeMessage).reverse(),
    hasMore: messages.length === takeLimit,
  };
}

/**
 * Send a message in a conversation
 * @param {number} conversationId
 * @param {object} user - Authenticated user info
 * @param {string} text - Message text
 */
async function sendMessage(conversationId, user, text) {
  const conversation = await getConversationById(conversationId, user);

  const trimmedText = String(text || "").trim();
  if (!trimmedText) {
    throw new Error("Message text cannot be empty");
  }

  if (trimmedText.length > 3000) {
    throw new Error("Message is too long (maximum 3000 characters)");
  }

  const role = resolveChatRole(user);

  // Determine sender role
  const senderRole = role === "ADMIN" ? "ADMIN" : conversation.participantRole;

  // Create message and update conversation's lastMessageAt in transaction
  const [message, updatedConv] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        senderRole,
        messageText: encodeMessageText(trimmedText),
        deliveredAt: new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        ...(role === "ADMIN" ? { adminId: user.id } : {}),
      },
      include: {
        participant: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            customRole: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  return {
    message: decodeMessage(message),
    conversation: {
      ...updatedConv,
      lastMessage: decodeMessage(message),
    },
  };
}

/**
 * Mark messages in a conversation as read
 * @param {number} conversationId
 * @param {object} user - Authenticated user info
 */
async function markMessagesAsRead(conversationId, user) {
  const conversation = await getConversationById(conversationId, user);
  const role = resolveChatRole(user);

  // If Admin is reading: mark messages from non-ADMIN as read
  // If participant is reading: mark messages from ADMIN as read
  const where = {
    conversationId: conversation.id,
    readAt: null,
  };

  if (role === "ADMIN") {
    where.senderRole = { not: "ADMIN" };
  } else {
    where.senderRole = "ADMIN";
  }

  const updateResult = await prisma.chatMessage.updateMany({
    where,
    data: {
      readAt: new Date(),
    },
  });

  return {
    success: true,
    updatedCount: updateResult.count,
    conversationId: conversation.id,
    readerRole: role,
  };
}

/**
 * Get total unread count for current user
 * @param {object} user - Authenticated user info
 */
async function getUnreadCount(user) {
  const role = resolveChatRole(user);

  if (role === "ADMIN") {
    const [totalUsers, totalDelivery] = await Promise.all([
      prisma.chatMessage.count({
        where: {
          senderRole: "USER",
          readAt: null,
        },
      }),
      prisma.chatMessage.count({
        where: {
          senderRole: "DELIVERY_BOY",
          readAt: null,
        },
      }),
    ]);

    return {
      total: totalUsers + totalDelivery,
      users: totalUsers,
      deliveryBoys: totalDelivery,
      role: "ADMIN",
    };
  } else {
    // Participant: find their conversation unread messages from ADMIN
    const conversation = await prisma.chatConversation.findUnique({
      where: {
        participantId_participantRole: {
          participantId: user.id,
          participantRole: role,
        },
      },
    });

    if (!conversation) {
      return { total: 0, role };
    }

    const unread = await prisma.chatMessage.count({
      where: {
        conversationId: conversation.id,
        senderRole: "ADMIN",
        readAt: null,
      },
    });

    return {
      total: unread,
      role,
      conversationId: conversation.id,
    };
  }
}

module.exports = {
  resolveChatRole,
  getOrCreateConversation,
  getAdminConversations,
  getConversationById,
  getConversationMessages,
  sendMessage,
  markMessagesAsRead,
  getUnreadCount,
};
