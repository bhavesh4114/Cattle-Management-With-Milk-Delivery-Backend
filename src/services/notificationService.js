const prisma = require("../config/db");
const { sendPushNotification } = require("./pushNotificationService");

/**
 * Format a Date for clean display (e.g. "09 Oct 2026" or "09 Oct")
 */
function formatDate(d) {
  if (!d) return "N/A";
  const dateObj = new Date(d);
  return dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}

function sanitizeForDb(str) {
  if (!str) return str;
  return String(str)
    .replace(/→/g, '->')
    .replace(/[^\x00-\x7F]/g, '')
    .trim();
}

/**
 * Core function to create a notification (and optional special dashboard alert)
 */
async function createNotification({
  userId,
  role = null,
  type = "GENERAL",
  title = null,
  message,
  entityType = null,
  entityId = null,
  deliveryId = null,
  orderType = null,
  orderId = null,
  priority = "NORMAL",
  isSpecialAlert = false,
  actionType = null,
  actionUrl = null,
  metadata = {},
  eventKey = null
}) {
  if (!userId || !message) {
    console.warn("[NotificationService] Skipped: missing userId or message", { userId, message });
    return null;
  }

  // Duplicate / Idempotency check:
  // If eventKey or composite key exists within last 15 minutes, do not duplicate.
  const dedupeKey = eventKey || `${type}_${userId}_${Boolean(isSpecialAlert)}_${entityType || orderType || ""}_${entityId || orderId || ""}`;
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const existing = await prisma.userAlert.findFirst({
      where: {
        userId,
        type,
        isSpecialAlert: Boolean(isSpecialAlert),
        createdAt: { gte: fifteenMinAgo },
        metadata: {
          path: ["dedupeKey"],
          equals: dedupeKey
        }
      }
    });

    if (existing) {
      // Already created recently
      return existing;
    }
  } catch (err) {
    // If JSON path querying fails on some DB driver, proceed safely
  }

  const finalMetadata = {
    ...metadata,
    dedupeKey
  };

  try {
    const alert = await prisma.userAlert.create({
      data: {
        userId,
        role,
        type,
        title: sanitizeForDb(title || type.replace(/_/g, " ")),
        message: sanitizeForDb(message),
        entityType,
        entityId: entityId ? parseInt(entityId, 10) : (orderId ? parseInt(orderId, 10) : null),
        deliveryId: deliveryId ? parseInt(deliveryId, 10) : null,
        orderType,
        orderId: orderId ? parseInt(orderId, 10) : null,
        priority,
        isSpecialAlert: Boolean(isSpecialAlert),
        isDismissed: false,
        actionType,
        actionUrl,
        metadata: finalMetadata,
        isRead: false
      }
    });

    // Send push notification asynchronously (fail-safe)
    sendPushNotification({
      userId,
      title: title || "New Notification",
      body: message,
      data: {
        alertId: alert.id,
        type,
        orderId,
        orderType,
        isSpecialAlert: String(isSpecialAlert)
      }
    }).catch(() => {});

    return alert;
  } catch (err) {
    console.error("[NotificationService] Failed to create notification:", err);
    // Never crash caller
    return null;
  }
}

/**
 * Get all admin user IDs
 */
async function getAdminUserIds() {
  const admins = await prisma.admin.findMany({
    where: { role: "ADMIN", status: "Active" },
    select: { id: true }
  });
  if (admins.length === 0) {
    const fallback = await prisma.admin.findFirst({ where: { status: "Active" } });
    return fallback ? [fallback.id] : [];
  }
  return admins.map(a => a.id);
}

// =========================================================================
// 1. BOOKING FLOW
// =========================================================================

async function notifyNewBooking({ orderId, orderType, customerName, userId, adminId }) {
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  const label = orderType === "trial" ? "Trial Booking" : "Subscription Booking";
  const title = "New Delivery Booking";
  const message = `New delivery booking #${orderId} has been created for ${customerName || "Customer"}.`;

  // 1. Notify Admin(s)
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "NEW_BOOKING",
      title,
      message,
      entityType: "BOOKING",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_BOOKING",
      actionUrl: `/milk-admin/dashboard?tab=${orderType === "trial" ? "orders" : "orders"}`
    });
  }

  // 2. Notify Customer if registered userId exists
  if (userId) {
    await createNotification({
      userId,
      role: "USER",
      type: "BOOKING_CONFIRMED",
      title: "Booking Confirmed",
      message: `Your ${label.toLowerCase()} #${orderId} has been confirmed.`,
      entityType: "BOOKING",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_BOOKING",
      actionUrl: "/admin/products"
    });
  }
}

// =========================================================================
// 2. LEAVE MANAGEMENT FLOW
// =========================================================================

async function notifyLeaveRequested({ leaveId, deliveryBoyId, deliveryBoyName, startDate, endDate, adminId }) {
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  const sStr = formatDate(startDate);
  const eStr = formatDate(endDate);
  const title = "Delivery Leave Request";
  const message = `${deliveryBoyName || "Delivery Boy"} has requested leave from ${sStr} to ${eStr}.`;

  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "LEAVE_REQUEST",
      title,
      message,
      entityType: "LEAVE",
      entityId: leaveId,
      actionType: "VIEW_REQUEST",
      actionUrl: "/milk-admin/dashboard?tab=delivery-leaves",
      priority: "HIGH"
    });
  }
}

async function notifyLeaveApproved({ leaveId, deliveryBoyId, deliveryBoyName, startDate, endDate, adminId }) {
  const sStr = formatDate(startDate);
  const eStr = formatDate(endDate);
  const title = "Leave Approved";

  // Notify Delivery Boy
  await createNotification({
    userId: deliveryBoyId,
    role: "DELIVERY_BOY",
    type: "LEAVE_APPROVED",
    title,
    message: `Your leave request from ${sStr} to ${eStr} has been approved.`,
    entityType: "LEAVE",
    entityId: leaveId,
    actionType: "VIEW_REQUEST",
    actionUrl: "/milk-admin/dashboard?tab=my-leaves"
  });

  // Notify Admin
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "LEAVE_APPROVED",
      title,
      message: `${deliveryBoyName || "Delivery Boy"}'s leave from ${sStr} to ${eStr} has been approved.`,
      entityType: "LEAVE",
      entityId: leaveId,
      actionType: "VIEW_REQUEST",
      actionUrl: "/milk-admin/dashboard?tab=delivery-leaves"
    });
  }
}

// =========================================================================
// 3. REASSIGNMENT & REASSIGNMENT REQUIRED FLOW
// =========================================================================

async function notifyReassignmentRequired({ count, dates, adminId }) {
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  const dateStr = dates && dates.length > 0 ? (Array.isArray(dates) ? dates.join(", ") : String(dates)) : "upcoming dates";
  const title = "⚠️ Delivery Reassignment Required";
  const message = `${count} ${count === 1 ? "delivery" : "deliveries"} for ${dateStr} are currently unassigned and waiting for reassignment.`;

  for (const aId of adminIds) {
    // 1. Normal Notification
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "REASSIGNMENT_REQUIRED",
      title: "Reassignment Required",
      message: `${count} deliveries require reassignment because no Delivery Boy is currently assigned.`,
      entityType: "REASSIGNMENT",
      priority: "CRITICAL",
      actionType: "ASSIGN_NOW",
      actionUrl: "/milk-admin/dashboard?tab=reassignment-queue"
    });

    // 2. Special Dashboard Alert (Actionable!)
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "REASSIGNMENT_REQUIRED",
      title,
      message: `${count} deliveries for ${dateStr} are currently unassigned.`,
      entityType: "REASSIGNMENT",
      priority: "CRITICAL",
      isSpecialAlert: true,
      actionType: "ASSIGN_NOW",
      actionUrl: "/milk-admin/dashboard?tab=reassignment-queue"
    });
  }
}

async function notifyBulkDeliveriesReassigned({
  oldBoyId,
  oldBoyName,
  newBoyId,
  newBoyName,
  count,
  dates,
  adminId
}) {
  const dateStr = Array.isArray(dates) ? dates.join(" to ") : (dates || "scheduled dates");
  
  // 1. Admin Notification + Special Alert
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_REASSIGNED",
      title: "Delivery Reassigned",
      message: `${count} ${count === 1 ? "delivery has" : "deliveries have"} been reassigned from ${oldBoyName || "Delivery Boy"} to ${newBoyName || "Replacement"}.`,
      entityType: "REASSIGNMENT",
      actionType: "VIEW_DELIVERIES",
      actionUrl: "/milk-admin/dashboard?tab=delivery"
    });

    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_REASSIGNED",
      title: "⚠️ Delivery Schedule Changed",
      message: `${count} deliveries previously assigned to ${oldBoyName || "Delivery Boy"} have been reassigned to ${newBoyName || "Replacement"}.`,
      entityType: "REASSIGNMENT",
      isSpecialAlert: true,
      actionType: "VIEW_DELIVERIES",
      actionUrl: "/milk-admin/dashboard?tab=delivery"
    });
  }

  // 2. Replacement Delivery Boy Notification + Special Alert (DIRECT ASSIGNMENT - NO ACCEPT/REJECT)
  if (newBoyId) {
    const boyMsg = `${count} ${count === 1 ? "new delivery has" : "new deliveries have"} been assigned to you for ${dateStr} due to another Delivery Boy's leave.`;
    await createNotification({
      userId: newBoyId,
      role: "DELIVERY_BOY",
      type: "DELIVERY_ASSIGNED",
      title: "New Deliveries Assigned",
      message: boyMsg,
      entityType: "DELIVERY",
      actionType: "VIEW_DELIVERIES",
      actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
    });

    await createNotification({
      userId: newBoyId,
      role: "DELIVERY_BOY",
      type: "DELIVERY_ASSIGNED",
      title: "🔔 New Deliveries Assigned",
      message: boyMsg,
      entityType: "DELIVERY",
      isSpecialAlert: true,
      actionType: "VIEW_DELIVERIES",
      actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
    });
  }
}

// =========================================================================
// 4. DELIVERY ASSIGNMENT (Single / Direct)
// =========================================================================

async function notifyDeliveryAssigned({
  boyId,
  boyName,
  orderId,
  orderType,
  customerName,
  customerUserId,
  adminId,
  deliveryDate,
  isReassignment = false,
  previousBoyName = null
}) {
  const dateStr = formatDate(deliveryDate || new Date());

  // 1. Delivery Boy Notification
  const boyTitle = isReassignment ? "Delivery Reassigned" : "New Delivery Assigned";
  const boyMsg = isReassignment
    ? `Delivery #${orderId} has been reassigned to you due to another Delivery Boy's leave.`
    : `Delivery #${orderId} has been assigned to you for ${dateStr}.`;

  await createNotification({
    userId: boyId,
    role: "DELIVERY_BOY",
    type: isReassignment ? "DELIVERY_REASSIGNED" : "DELIVERY_ASSIGNED",
    title: boyTitle,
    message: boyMsg,
    entityType: "DELIVERY",
    entityId: orderId,
    orderType,
    orderId,
    actionType: "VIEW_DELIVERY",
    actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
  });

  // 2. Customer Notification (A Delivery Boy has been assigned)
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      role: "USER",
      type: "DELIVERY_ASSIGNED",
      title: "Delivery Boy Assigned",
      message: `A Delivery Boy has been assigned to your delivery #${orderId}.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/admin/products"
    });
  }

  // 3. Admin Notification (if reassignment)
  if (isReassignment && adminId) {
    await createNotification({
      userId: adminId,
      role: "ADMIN",
      type: "DELIVERY_REASSIGNED",
      title: "Delivery Reassigned",
      message: `Delivery #${orderId} reassigned to ${boyName || "Delivery Boy"}.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=delivery"
    });
  }
}

// =========================================================================
// 5. DELIVERY DATE CHANGED FLOW (Requirement Section 8)
// =========================================================================

async function notifyDeliveryDateChanged({
  orderId,
  orderType,
  oldDate,
  newDate,
  boyId,
  customerUserId,
  adminId,
  customerName
}) {
  const oldStr = formatDate(oldDate);
  const newStr = formatDate(newDate);

  // 1. ADMIN Notification + Special Alert
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_DATE_CHANGED",
      title: "Delivery Date Changed",
      message: `Delivery #${orderId} date changed: ${oldStr} → ${newStr}.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=orders"
    });

    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_DATE_CHANGED",
      title: `⚠️ Delivery #${orderId} Date Changed`,
      message: `Delivery #${orderId} (${customerName || "Customer"}) date rescheduled: ${oldStr} → ${newStr}.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      isSpecialAlert: true,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=orders"
    });
  }

  // 2. DELIVERY BOY Notification + Special Alert
  if (boyId) {
    const boyMsg = `Delivery #${orderId} is now scheduled for ${newStr} instead of ${oldStr}.`;
    await createNotification({
      userId: boyId,
      role: "DELIVERY_BOY",
      type: "DELIVERY_DATE_CHANGED",
      title: "Delivery Date Changed",
      message: `Delivery #${orderId} has been rescheduled from ${oldStr} to ${newStr}.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
    });

    await createNotification({
      userId: boyId,
      role: "DELIVERY_BOY",
      type: "DELIVERY_DATE_CHANGED",
      title: "⚠️ Delivery Date Changed",
      message: boyMsg,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      isSpecialAlert: true,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
    });
  }

  // 3. CUSTOMER / USER Notification + Prominent Dashboard Special Alert
  if (customerUserId) {
    const userMsg = `Your delivery #${orderId} has been rescheduled from ${oldStr} to ${newStr}.`;
    await createNotification({
      userId: customerUserId,
      role: "USER",
      type: "DELIVERY_DATE_CHANGED",
      title: "Delivery Rescheduled",
      message: userMsg,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/admin/products"
    });

    await createNotification({
      userId: customerUserId,
      role: "USER",
      type: "DELIVERY_DATE_CHANGED",
      title: "⚠️ Important: Delivery Date Changed",
      message: `Your delivery #${orderId} has been rescheduled.\nPrevious Date: ${oldStr}\nNew Date: ${newStr}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      isSpecialAlert: true,
      priority: "HIGH",
      actionType: "VIEW_DELIVERY",
      actionUrl: "/admin/products"
    });
  }
}

// =========================================================================
// 6. DELIVERY STATUS FLOWS (Out for delivery, Completed, Failed, Cancelled)
// =========================================================================

async function notifyOutForDelivery({ orderId, orderType, customerUserId, boyId, adminId }) {
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      role: "USER",
      type: "DELIVERY_OUT_FOR_DELIVERY",
      title: "Out for Delivery",
      message: `Your delivery #${orderId} is out for delivery today.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/admin/products"
    });
  }
}

async function notifyDeliveryCompleted({ orderId, orderType, customerUserId, boyId, boyName, adminId }) {
  // 1. Customer Notification
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      role: "USER",
      type: "DELIVERY_COMPLETED",
      title: "Delivery Completed",
      message: `Your delivery #${orderId} has been successfully delivered.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/admin/products"
    });
  }

  // 2. Delivery Boy Notification
  if (boyId) {
    await createNotification({
      userId: boyId,
      role: "DELIVERY_BOY",
      type: "DELIVERY_COMPLETED",
      title: "Delivery Completed",
      message: `Delivery #${orderId} has been marked as completed.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
    });
  }

  // 3. Admin Notification
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_COMPLETED",
      title: "Delivery Completed",
      message: `Delivery #${orderId} has been completed by ${boyName || "Delivery Boy"}.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=orders"
    });
  }
}

async function notifyDeliveryFailed({ orderId, orderType, customerUserId, boyId, adminId, reason }) {
  const reasonText = reason ? `: ${reason}` : ".";

  // 1. Customer Notification
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      role: "USER",
      type: "DELIVERY_FAILED",
      title: "Delivery Failed",
      message: `Delivery #${orderId} could not be completed${reasonText} Please check the delivery details.`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      priority: "HIGH",
      actionType: "VIEW_DELIVERY",
      actionUrl: "/admin/products"
    });
  }

  // 2. Admin Notification + Special Alert
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_FAILED",
      title: "Delivery Failed",
      message: `Delivery #${orderId} could not be completed${reasonText}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      priority: "HIGH",
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=orders"
    });

    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_FAILED",
      title: `⚠️ Critical Delivery Issue: #${orderId}`,
      message: `Delivery #${orderId} could not be completed${reasonText}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      priority: "HIGH",
      isSpecialAlert: true,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=orders"
    });
  }
}

async function notifyDeliveryCancelled({ orderId, orderType, customerUserId, boyId, adminId, reason }) {
  const reasonText = reason ? `: ${reason}` : ".";

  // Customer
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      role: "USER",
      type: "DELIVERY_CANCELLED",
      title: "Delivery Cancelled",
      message: `Your delivery #${orderId} has been cancelled${reasonText}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/admin/products"
    });
  }

  // Delivery Boy
  if (boyId) {
    await createNotification({
      userId: boyId,
      role: "DELIVERY_BOY",
      type: "DELIVERY_CANCELLED",
      title: "Delivery Cancelled",
      message: `Delivery #${orderId} has been cancelled${reasonText}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
    });
  }

  // Admin
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_CANCELLED",
      title: "Delivery Cancelled",
      message: `Delivery #${orderId} has been cancelled${reasonText}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=orders"
    });
  }
}

async function notifyDeliveryIssue({ orderId, orderType, customerUserId, boyId, adminId, issue }) {
  const issueText = issue || "Issue reported.";

  // Delivery Boy
  if (boyId) {
    await createNotification({
      userId: boyId,
      role: "DELIVERY_BOY",
      type: "DELIVERY_ISSUE",
      title: "Delivery Issue Reported",
      message: `Customer reported an issue for Delivery #${orderId}: ${issueText}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      priority: "HIGH",
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=my-deliveries"
    });
  }

  // Admin
  const adminIds = adminId ? [adminId] : await getAdminUserIds();
  for (const aId of adminIds) {
    await createNotification({
      userId: aId,
      role: "ADMIN",
      type: "DELIVERY_ISSUE",
      title: `⚠️ Delivery Issue Reported: #${orderId}`,
      message: `Issue reported for Delivery #${orderId}: ${issueText}`,
      entityType: "DELIVERY",
      entityId: orderId,
      orderType,
      orderId,
      priority: "HIGH",
      isSpecialAlert: true,
      actionType: "VIEW_DELIVERY",
      actionUrl: "/milk-admin/dashboard?tab=orders"
    });
  }
}

module.exports = {
  createNotification,
  formatDate,
  notifyNewBooking,
  notifyLeaveRequested,
  notifyLeaveApproved,
  notifyReassignmentRequired,
  notifyBulkDeliveriesReassigned,
  notifyDeliveryAssigned,
  notifyDeliveryDateChanged,
  notifyOutForDelivery,
  notifyDeliveryCompleted,
  notifyDeliveryFailed,
  notifyDeliveryCancelled,
  notifyDeliveryIssue
};
