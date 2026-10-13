const prisma = require("../config/db");
const notificationService = require("./notificationService");

/**
 * Valid Complaint Categories
 */
const COMPLAINT_CATEGORIES = [
  "Late or incomplete delivery",
  "Wrong milk quantity",
  "Product quality",
  "Missing product",
  "Delivery boy behaviour",
  "Payment issue",
  "Other"
];

/**
 * Generate unique human-readable complaint code e.g. CMP-849201
 */
function generateComplaintCode() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `CMP-${rand}`;
}

/**
 * Helper to fetch order details and verify ownership and delivered status
 */
async function getOrderAndVerifyDelivery(orderType, orderId, customerId = null) {
  const parsedOrderId = parseInt(orderId, 10);
  if (isNaN(parsedOrderId)) {
    throw new Error("Invalid order ID");
  }

  const normalizedOrderType = String(orderType).toLowerCase().trim();
  if (!["trial", "subscription"].includes(normalizedOrderType)) {
    throw new Error("Invalid order type. Must be 'trial' or 'subscription'");
  }

  let order = null;
  let deliveryBoyId = null;

  if (normalizedOrderType === "trial") {
    order = await prisma.milkTrial.findUnique({
      where: { id: parsedOrderId },
      include: {
        product: true
      }
    });

    if (!order) {
      throw new Error("Order not found");
    }

    if (customerId && order.userId && order.userId !== customerId) {
      throw new Error("Unauthorized: This order does not belong to your account");
    }

    deliveryBoyId = order.deliveryBoyId;
  } else {
    order = await prisma.milkSubscription.findUnique({
      where: { id: parsedOrderId },
      include: {
        product: true
      }
    });

    if (!order) {
      throw new Error("Subscription order not found");
    }

    if (customerId && order.userId && order.userId !== customerId) {
      throw new Error("Unauthorized: This order does not belong to your account");
    }

    deliveryBoyId = order.deliveryBoyId;
  }

  // Find latest delivery assignment if available
  const assignment = await prisma.deliveryAssignment.findFirst({
    where: {
      orderType: normalizedOrderType,
      orderId: parsedOrderId
    },
    orderBy: { id: "desc" },
    include: {
      deliveryBoy: {
        select: { id: true, name: true, email: true, deliveryProfile: true }
      }
    }
  });

  if (!deliveryBoyId && assignment?.deliveryBoyId) {
    deliveryBoyId = assignment.deliveryBoyId;
  }

  // Check Delivered status
  const normStatus = String(order.deliveryStatus || "").toUpperCase();
  const mainStatus = String(order.status || "").toUpperCase();
  const assignStatus = String(assignment?.deliveryStatus || "").toUpperCase();

  const isDelivered =
    normStatus === "DELIVERED" ||
    mainStatus === "COMPLETED" ||
    assignStatus === "DELIVERED" ||
    Boolean(assignment?.deliveredAt) ||
    Boolean(assignment?.customerConfirmedAt);

  let deliveryBoy = null;
  if (deliveryBoyId) {
    deliveryBoy = await prisma.admin.findUnique({
      where: { id: deliveryBoyId },
      select: {
        id: true,
        name: true,
        email: true,
        deliveryProfile: {
          select: { mobile: true }
        }
      }
    });
  }

  return {
    order,
    orderType: normalizedOrderType,
    orderId: parsedOrderId,
    isDelivered,
    deliveryBoyId,
    deliveryBoy,
    assignment
  };
}

/**
 * Check if customer is eligible to submit feedback or complaints
 */
async function checkEligibility(orderType, orderId, customerId) {
  const { order, isDelivered, deliveryBoy } = await getOrderAndVerifyDelivery(
    orderType,
    orderId,
    customerId
  );

  const existingFeedback = await prisma.orderFeedback.findUnique({
    where: {
      orderType_orderId: {
        orderType: String(orderType).toLowerCase(),
        orderId: parseInt(orderId, 10)
      }
    }
  });

  const existingComplaints = await prisma.customerComplaint.findMany({
    where: {
      orderType: String(orderType).toLowerCase(),
      orderId: parseInt(orderId, 10),
      customerId
    },
    orderBy: { createdAt: "desc" }
  });

  return {
    eligibleForFeedback: isDelivered && !existingFeedback,
    eligibleForComplaint: isDelivered,
    isDelivered,
    hasFeedback: Boolean(existingFeedback),
    existingFeedback,
    complaintCount: existingComplaints.length,
    recentComplaints: existingComplaints,
    orderInfo: {
      id: order.id,
      orderType,
      milkType: order.milkType,
      dailyQuantity: order.dailyQuantity,
      customerName: order.customerName,
      address: order.address,
      phone: order.phone,
      startDate: order.startDate || order.requestedStartDate,
      endDate: order.endDate || order.requestedEndDate,
      deliveryStatus: order.deliveryStatus,
      status: order.status
    },
    deliveryBoy
  };
}

/**
 * Submit feedback for a delivered order
 */
async function submitFeedback({
  orderType,
  orderId,
  customerId,
  rating,
  deliveryBoyRating,
  productQualityRating,
  review
}) {
  const parsedRating = parseInt(rating, 10);
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    throw new Error("Overall rating must be between 1 and 5 stars");
  }

  const parsedBoyRating = deliveryBoyRating ? parseInt(deliveryBoyRating, 10) : null;
  if (parsedBoyRating !== null && (parsedBoyRating < 1 || parsedBoyRating > 5)) {
    throw new Error("Delivery boy rating must be between 1 and 5 stars");
  }

  const parsedQualityRating = productQualityRating ? parseInt(productQualityRating, 10) : null;
  if (parsedQualityRating !== null && (parsedQualityRating < 1 || parsedQualityRating > 5)) {
    throw new Error("Product quality rating must be between 1 and 5 stars");
  }

  const { orderType: normType, orderId: parsedId, isDelivered, deliveryBoyId } =
    await getOrderAndVerifyDelivery(orderType, orderId, customerId);

  if (!isDelivered) {
    throw new Error("Feedback can only be submitted after the order has been delivered.");
  }

  const existing = await prisma.orderFeedback.findUnique({
    where: {
      orderType_orderId: {
        orderType: normType,
        orderId: parsedId
      }
    }
  });

  if (existing) {
    throw new Error("Feedback has already been submitted for this order. Only one submission is permitted.");
  }

  const feedback = await prisma.orderFeedback.create({
    data: {
      orderType: normType,
      orderId: parsedId,
      customerId,
      deliveryBoyId: deliveryBoyId || null,
      rating: parsedRating,
      deliveryBoyRating: parsedBoyRating,
      productQualityRating: parsedQualityRating,
      review: review ? String(review).trim() : null
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      deliveryBoy: { select: { id: true, name: true } }
    }
  });

  return feedback;
}

/**
 * Get feedback for a specific order
 */
async function getOrderFeedback(orderType, orderId, customerId = null) {
  const normType = String(orderType).toLowerCase();
  const parsedId = parseInt(orderId, 10);

  const feedback = await prisma.orderFeedback.findUnique({
    where: {
      orderType_orderId: {
        orderType: normType,
        orderId: parsedId
      }
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      deliveryBoy: { select: { id: true, name: true } }
    }
  });

  if (!feedback) return null;

  if (customerId && feedback.customerId !== customerId) {
    throw new Error("Unauthorized to view this feedback");
  }

  return feedback;
}

/**
 * Submit a customer complaint for a delivered order
 */
async function submitComplaint({
  orderType,
  orderId,
  customerId,
  category,
  description,
  attachmentPath
}) {
  if (!category || !COMPLAINT_CATEGORIES.includes(category)) {
    throw new Error(
      `Invalid category. Must be one of: ${COMPLAINT_CATEGORIES.join(", ")}`
    );
  }

  if (!description || String(description).trim().length < 5) {
    throw new Error("Please provide a meaningful complaint description (at least 5 characters)");
  }

  const { order, orderType: normType, orderId: parsedId, isDelivered, deliveryBoyId } =
    await getOrderAndVerifyDelivery(orderType, orderId, customerId);

  if (!isDelivered) {
    throw new Error("Complaints can only be raised for orders that have been delivered.");
  }

  let complaintCode = generateComplaintCode();
  let codeExists = await prisma.customerComplaint.findUnique({ where: { complaintCode } });
  while (codeExists) {
    complaintCode = generateComplaintCode();
    codeExists = await prisma.customerComplaint.findUnique({ where: { complaintCode } });
  }

  const complaint = await prisma.$transaction(async (tx) => {
    const created = await tx.customerComplaint.create({
      data: {
        complaintCode,
        orderType: normType,
        orderId: parsedId,
        customerId,
        deliveryBoyId: deliveryBoyId || null,
        category,
        description: String(description).trim(),
        attachment: attachmentPath || null,
        status: "PENDING"
      }
    });

    await tx.complaintStatusHistory.create({
      data: {
        complaintId: created.id,
        status: "PENDING",
        actionBy: "Customer",
        changedById: customerId,
        notes: "Complaint submitted by customer"
      }
    });

    return created;
  });

  // Notify Admins asynchronously
  (async () => {
    try {
      const admins = await prisma.admin.findMany({
        where: { role: "ADMIN", status: "Active" },
        select: { id: true }
      });

      const customer = await prisma.admin.findUnique({
        where: { id: customerId },
        select: { name: true }
      });

      for (const admin of admins) {
        await notificationService.createNotification({
          userId: admin.id,
          role: "ADMIN",
          type: "COMPLAINT_RAISED",
          title: `New Complaint: ${complaintCode}`,
          message: `Customer ${customer?.name || "User"} raised a complaint for ${order.milkType || "order"} (${category}).`,
          entityType: "COMPLAINT",
          entityId: complaint.id,
          orderType: normType,
          orderId: parsedId,
          priority: "HIGH",
          actionUrl: `/milk-admin/dashboard?tab=feedback-complaints`
        });
      }
    } catch (err) {
      console.error("[submitComplaint notification error]", err);
    }
  })();

  return complaint;
}

/**
 * Customer fetches their own complaints
 */
async function getCustomerComplaints(customerId) {
  const complaints = await prisma.customerComplaint.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: {
      deliveryBoy: {
        select: {
          id: true,
          name: true,
          deliveryProfile: { select: { mobile: true } }
        }
      },
      assignedStaff: {
        select: { id: true, name: true }
      },
      history: {
        orderBy: { createdAt: "desc" },
        include: {
          changedBy: { select: { id: true, name: true, role: true } }
        }
      }
    }
  });

  // Attach order basic details
  const enriched = await Promise.all(
    complaints.map(async (c) => {
      let orderDetail = null;
      if (c.orderType === "trial") {
        orderDetail = await prisma.milkTrial.findUnique({
          where: { id: c.orderId },
          select: { id: true, milkType: true, dailyQuantity: true, startDate: true, address: true }
        });
      } else {
        orderDetail = await prisma.milkSubscription.findUnique({
          where: { id: c.orderId },
          select: { id: true, milkType: true, dailyQuantity: true, requestedStartDate: true, address: true }
        });
      }
      return {
        ...c,
        orderDetail
      };
    })
  );

  return enriched;
}

/**
 * Customer reopens a resolved complaint
 */
async function reopenCustomerComplaint(complaintId, customerId, reason) {
  const parsedId = parseInt(complaintId, 10);
  const complaint = await prisma.customerComplaint.findUnique({
    where: { id: parsedId }
  });

  if (!complaint) {
    throw new Error("Complaint not found");
  }

  if (complaint.customerId !== customerId) {
    throw new Error("Unauthorized to modify this complaint");
  }

  if (complaint.status !== "RESOLVED") {
    throw new Error("Only resolved complaints can be reopened");
  }

  if (!reason || String(reason).trim().length < 5) {
    throw new Error("Please provide a reason for reopening this complaint (minimum 5 characters)");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.customerComplaint.update({
      where: { id: parsedId },
      data: {
        status: "REOPENED",
        reopenedAt: new Date(),
        reopenReason: String(reason).trim()
      }
    });

    await tx.complaintStatusHistory.create({
      data: {
        complaintId: parsedId,
        status: "REOPENED",
        actionBy: "Customer",
        changedById: customerId,
        notes: `Customer reopened complaint: ${String(reason).trim()}`
      }
    });

    return res;
  });

  // Notify Admins
  (async () => {
    try {
      const admins = await prisma.admin.findMany({
        where: { role: "ADMIN", status: "Active" },
        select: { id: true }
      });

      for (const admin of admins) {
        await notificationService.createNotification({
          userId: admin.id,
          role: "ADMIN",
          type: "COMPLAINT_REOPENED",
          title: `Complaint Reopened: ${complaint.complaintCode}`,
          message: `Customer reopened complaint ${complaint.complaintCode}. Reason: ${reason}`,
          entityType: "COMPLAINT",
          entityId: parsedId,
          orderType: complaint.orderType,
          orderId: complaint.orderId,
          priority: "HIGH",
          actionUrl: `/milk-admin/dashboard?tab=feedback-complaints`
        });
      }
    } catch (err) {
      console.error("[reopenComplaint notification error]", err);
    }
  })();

  return updated;
}

/**
 * Admin: Get complaint and feedback dashboard statistics
 */
async function getAdminStats() {
  const [
    totalComplaints,
    pendingComplaints,
    inProgressComplaints,
    resolvedComplaints,
    reopenedComplaints,
    feedbacks
  ] = await Promise.all([
    prisma.customerComplaint.count(),
    prisma.customerComplaint.count({ where: { status: "PENDING" } }),
    prisma.customerComplaint.count({ where: { status: "IN_PROGRESS" } }),
    prisma.customerComplaint.count({ where: { status: "RESOLVED" } }),
    prisma.customerComplaint.count({ where: { status: "REOPENED" } }),
    prisma.orderFeedback.findMany({
      select: { rating: true, deliveryBoyRating: true, productQualityRating: true }
    })
  ]);

  const totalFeedbacks = feedbacks.length;
  let avgRating = 0;
  let avgBoyRating = 0;
  let avgQualityRating = 0;
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  if (totalFeedbacks > 0) {
    let sumRating = 0;
    let sumBoy = 0;
    let countBoy = 0;
    let sumQuality = 0;
    let countQuality = 0;

    for (const f of feedbacks) {
      sumRating += f.rating;
      if (ratingDistribution[f.rating] !== undefined) {
        ratingDistribution[f.rating]++;
      }
      if (f.deliveryBoyRating) {
        sumBoy += f.deliveryBoyRating;
        countBoy++;
      }
      if (f.productQualityRating) {
        sumQuality += f.productQualityRating;
        countQuality++;
      }
    }

    avgRating = parseFloat((sumRating / totalFeedbacks).toFixed(1));
    avgBoyRating = countBoy > 0 ? parseFloat((sumBoy / countBoy).toFixed(1)) : 0;
    avgQualityRating = countQuality > 0 ? parseFloat((sumQuality / countQuality).toFixed(1)) : 0;
  }

  return {
    totalComplaints,
    pendingComplaints,
    inProgressComplaints,
    resolvedComplaints,
    reopenedComplaints,
    feedbackStats: {
      totalFeedbacks,
      avgRating,
      avgBoyRating,
      avgQualityRating,
      ratingDistribution
    }
  };
}

/**
 * Admin: Search and list complaints with filters
 */
async function getAdminComplaints({ search = "", status = "ALL", category = "ALL" }) {
  const where = {};

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (category && category !== "ALL") {
    where.category = category;
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { complaintCode: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { deliveryBoy: { name: { contains: q, mode: "insensitive" } } }
    ];
  }

  const complaints = await prisma.customerComplaint.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: {
        select: { id: true, name: true, email: true }
      },
      deliveryBoy: {
        select: {
          id: true,
          name: true,
          email: true,
          deliveryProfile: { select: { mobile: true } }
        }
      },
      assignedStaff: {
        select: { id: true, name: true, email: true }
      },
      history: {
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          changedBy: { select: { id: true, name: true } }
        }
      }
    }
  });

  // Enrich with order info
  const enriched = await Promise.all(
    complaints.map(async (c) => {
      let orderDetail = null;
      if (c.orderType === "trial") {
        orderDetail = await prisma.milkTrial.findUnique({
          where: { id: c.orderId },
          select: {
            id: true,
            customerName: true,
            phone: true,
            address: true,
            milkType: true,
            dailyQuantity: true,
            startDate: true,
            deliveryStatus: true
          }
        });
      } else {
        orderDetail = await prisma.milkSubscription.findUnique({
          where: { id: c.orderId },
          select: {
            id: true,
            customerName: true,
            phone: true,
            address: true,
            milkType: true,
            dailyQuantity: true,
            requestedStartDate: true,
            deliveryStatus: true
          }
        });
      }
      return {
        ...c,
        orderDetail
      };
    })
  );

  return enriched;
}

/**
 * Admin: Get single complaint details with full history
 */
async function getAdminComplaintById(complaintId) {
  const parsedId = parseInt(complaintId, 10);
  const complaint = await prisma.customerComplaint.findUnique({
    where: { id: parsedId },
    include: {
      customer: {
        select: { id: true, name: true, email: true }
      },
      deliveryBoy: {
        select: {
          id: true,
          name: true,
          email: true,
          deliveryProfile: { select: { mobile: true } }
        }
      },
      assignedStaff: {
        select: { id: true, name: true, email: true }
      },
      history: {
        orderBy: { createdAt: "asc" },
        include: {
          changedBy: { select: { id: true, name: true, role: true } }
        }
      }
    }
  });

  if (!complaint) {
    throw new Error("Complaint not found");
  }

  let orderDetail = null;
  if (complaint.orderType === "trial") {
    orderDetail = await prisma.milkTrial.findUnique({
      where: { id: complaint.orderId }
    });
  } else {
    orderDetail = await prisma.milkSubscription.findUnique({
      where: { id: complaint.orderId }
    });
  }

  // Also check if any feedback exists for this order
  const orderFeedback = await prisma.orderFeedback.findUnique({
    where: {
      orderType_orderId: {
        orderType: complaint.orderType,
        orderId: complaint.orderId
      }
    }
  });

  return {
    ...complaint,
    orderDetail,
    orderFeedback
  };
}

/**
 * Admin: Update complaint status, assign staff, and add resolution notes
 */
async function updateAdminComplaint(
  complaintId,
  { status, assignedStaffId, adminNotes, resolutionNotes },
  adminUser
) {
  const parsedId = parseInt(complaintId, 10);
  const existing = await prisma.customerComplaint.findUnique({
    where: { id: parsedId }
  });

  if (!existing) {
    throw new Error("Complaint not found");
  }

  const validStatuses = ["PENDING", "IN_PROGRESS", "RESOLVED", "REOPENED"];
  if (status && !validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const newStatus = status || existing.status;
  const isStatusChanged = newStatus !== existing.status;

  const updateData = {
    status: newStatus,
    adminNotes: adminNotes !== undefined ? (adminNotes ? String(adminNotes).trim() : null) : existing.adminNotes,
    resolutionNotes: resolutionNotes !== undefined ? (resolutionNotes ? String(resolutionNotes).trim() : null) : existing.resolutionNotes
  };

  if (assignedStaffId !== undefined) {
    updateData.assignedStaffId = assignedStaffId ? parseInt(assignedStaffId, 10) : null;
  }

  if (newStatus === "RESOLVED") {
    updateData.resolvedAt = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.customerComplaint.update({
      where: { id: parsedId },
      data: updateData
    });

    let historyNote = "";
    if (isStatusChanged) {
      historyNote = `Status updated to ${newStatus}.`;
    }
    if (resolutionNotes) {
      historyNote += ` Resolution notes: ${resolutionNotes}.`;
    } else if (adminNotes) {
      historyNote += ` Admin notes: ${adminNotes}.`;
    }
    if (assignedStaffId && assignedStaffId !== existing.assignedStaffId) {
      historyNote += ` Assigned to staff ID ${assignedStaffId}.`;
    }

    await tx.complaintStatusHistory.create({
      data: {
        complaintId: parsedId,
        status: newStatus,
        actionBy: "Admin",
        changedById: adminUser.id,
        notes: historyNote.trim() || `Updated by admin ${adminUser.name || ""}`
      }
    });

    return res;
  });

  // Notify customer if status changed or resolution recorded
  (async () => {
    try {
      if (isStatusChanged || resolutionNotes) {
        let msg = "";
        let notifType = "COMPLAINT_UPDATE";

        if (newStatus === "IN_PROGRESS") {
          msg = `Your complaint (${existing.complaintCode}) is currently under review by our support team.`;
        } else if (newStatus === "RESOLVED") {
          notifType = "COMPLAINT_RESOLVED";
          msg = `Your complaint (${existing.complaintCode}) has been resolved. ${resolutionNotes ? "Resolution: " + resolutionNotes : ""}`;
        } else {
          msg = `Your complaint (${existing.complaintCode}) status has been updated to ${newStatus}.`;
        }

        await notificationService.createNotification({
          userId: existing.customerId,
          role: "CUSTOMER",
          type: notifType,
          title: `Complaint ${newStatus.replace("_", " ")}: ${existing.complaintCode}`,
          message: msg,
          entityType: "COMPLAINT",
          entityId: parsedId,
          orderType: existing.orderType,
          orderId: existing.orderId,
          priority: newStatus === "RESOLVED" ? "HIGH" : "NORMAL",
          actionUrl: `/admin/products?tab=orders`
        });
      }
    } catch (err) {
      console.error("[updateAdminComplaint notification error]", err);
    }
  })();

  return updated;
}

/**
 * Admin: List all feedbacks with search and rating filters
 */
async function getAdminFeedbacks({ search = "", rating = "ALL" }) {
  const where = {};

  if (rating && rating !== "ALL") {
    where.rating = parseInt(rating, 10);
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { review: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { deliveryBoy: { name: { contains: q, mode: "insensitive" } } }
    ];
  }

  const feedbacks = await prisma.orderFeedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      deliveryBoy: { select: { id: true, name: true, email: true } }
    }
  });

  // Enrich with order info
  const enriched = await Promise.all(
    feedbacks.map(async (f) => {
      let orderDetail = null;
      if (f.orderType === "trial") {
        orderDetail = await prisma.milkTrial.findUnique({
          where: { id: f.orderId },
          select: { id: true, milkType: true, dailyQuantity: true, startDate: true }
        });
      } else {
        orderDetail = await prisma.milkSubscription.findUnique({
          where: { id: f.orderId },
          select: { id: true, milkType: true, dailyQuantity: true, requestedStartDate: true }
        });
      }
      return {
        ...f,
        orderDetail
      };
    })
  );

  return enriched;
}

/**
 * Admin: Get active staff & admins for complaint assignment dropdown
 */
async function getStaffList() {
  const staff = await prisma.admin.findMany({
    where: { status: "Active" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      customRole: { select: { name: true } }
    },
    orderBy: { name: "asc" }
  });

  return staff;
}

module.exports = {
  COMPLAINT_CATEGORIES,
  checkEligibility,
  submitFeedback,
  getOrderFeedback,
  submitComplaint,
  getCustomerComplaints,
  reopenCustomerComplaint,
  getAdminStats,
  getAdminComplaints,
  getAdminComplaintById,
  updateAdminComplaint,
  getAdminFeedbacks,
  getStaffList
};
