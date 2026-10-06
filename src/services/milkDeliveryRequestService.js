const prisma = require("../config/db");
const notificationService = require("./notificationService");

let tableChecked = false;
async function ensureTableExists() {
  if (tableChecked) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MilkDeliveryRequest" (
          "id" SERIAL PRIMARY KEY,
          "customerId" INTEGER NOT NULL,
          "subscriptionId" INTEGER,
          "deliveryDate" TIMESTAMP(3) NOT NULL,
          "requestType" TEXT NOT NULL,
          "regularQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "extraQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "totalQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "note" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "approvedById" INTEGER,
          "approvedAt" TIMESTAMP(3),
          "rejectedReason" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "MilkDeliveryRequest_customerId_deliveryDate_idx" ON "MilkDeliveryRequest"("customerId", "deliveryDate");
      CREATE INDEX IF NOT EXISTS "MilkDeliveryRequest_status_deliveryDate_idx" ON "MilkDeliveryRequest"("status", "deliveryDate");
    `);
    tableChecked = true;
  } catch (err) {
    console.error("[milkDeliveryRequestService] Table ensure error:", err.message);
  }
}

function parseDateUtc(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    const y = dateInput.getUTCFullYear();
    const m = dateInput.getUTCMonth();
    const d = dateInput.getUTCDate();
    return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  }
  const dateStr = String(dateInput).split("T")[0];
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
}

function validateAdvanceDate(dateInput) {
  const target = parseDateUtc(dateInput);
  if (!target) throw new Error("Delivery date is required.");

  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    throw new Error("Delivery date cannot be in the past.");
  }
  if (diffDays < 2) {
    throw new Error("Milk delivery requests must be submitted at least 2 days in advance.");
  }
  return target;
}

function formatDisplayDate(dateObj) {
  if (!dateObj) return "N/A";
  const d = new Date(dateObj);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── 1. Get Customer Context (Active Subscriptions & Default Qty) ────────────
async function getCustomerContext(customerId) {
  await ensureTableExists();
  const activeSubs = await prisma.milkSubscription.findMany({
    where: {
      userId: customerId,
      status: { in: ["ACTIVE", "AWAITING_PAYMENT", "ADMIN_OFFERED"] },
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const activeTrial = await prisma.milkTrial.findFirst({
    where: {
      userId: customerId,
      status: { in: ["ACTIVE", "PENDING_ADMIN"] },
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  let regularQuantity = 0;
  let defaultSubscriptionId = null;
  let milkType = "Fresh Milk";

  if (activeSubs.length > 0) {
    regularQuantity = activeSubs[0].dailyQuantity || 1;
    defaultSubscriptionId = activeSubs[0].id;
    milkType = activeSubs[0].milkType || activeSubs[0].product?.name || "Fresh Milk";
  } else if (activeTrial) {
    regularQuantity = activeTrial.dailyQuantity || 1;
    milkType = activeTrial.milkType || activeTrial.product?.name || "Fresh Milk";
  } else {
    regularQuantity = 1; // Default fall-back
  }

  const customer = await prisma.admin.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, email: true },
  });

  return {
    customerId,
    customerName: customer?.name || "Customer",
    regularQuantity,
    defaultSubscriptionId,
    milkType,
    subscriptions: activeSubs.map((s) => ({
      id: s.id,
      milkType: s.milkType,
      dailyQuantity: s.dailyQuantity,
      startDate: s.finalStartDate || s.requestedStartDate,
      endDate: s.finalEndDate || s.requestedEndDate,
      status: s.status,
    })),
  };
}

// ─── 2. Create Request (Customer) ───────────────────────────────────────────
async function createRequest(customerId, payload) {
  await ensureTableExists();
  const { deliveryDate, requestType, extraQuantity, note, subscriptionId } = payload;

  if (!["EXTRA_MILK", "SKIP_DELIVERY"].includes(requestType)) {
    throw new Error("Invalid request type. Must be EXTRA_MILK or SKIP_DELIVERY.");
  }

  const targetDate = validateAdvanceDate(deliveryDate);

  // Check for duplicate pending or approved requests for this customer and date
  const existing = await prisma.milkDeliveryRequest.findFirst({
    where: {
      customerId,
      deliveryDate: targetDate,
      status: { in: ["PENDING", "APPROVED"] },
    },
  });

  if (existing) {
    throw new Error(
      `A ${existing.status.toLowerCase()} request already exists for ${formatDisplayDate(targetDate)}. Please update or cancel the existing request.`
    );
  }

  // Calculate regularQuantity from active subscription or provided
  let regularQuantity = Number(payload.regularQuantity);
  let subId = subscriptionId ? parseInt(subscriptionId, 10) : null;

  if (!regularQuantity || regularQuantity <= 0) {
    const ctx = await getCustomerContext(customerId);
    regularQuantity = ctx.regularQuantity || 1;
    if (!subId) subId = ctx.defaultSubscriptionId;
  }

  let finalExtra = 0;
  let finalTotal = 0;

  if (requestType === "EXTRA_MILK") {
    finalExtra = parseFloat(extraQuantity);
    if (isNaN(finalExtra) || finalExtra <= 0) {
      throw new Error("Extra quantity must be greater than 0 for Extra Milk requests.");
    }
    finalTotal = parseFloat((regularQuantity + finalExtra).toFixed(2));
  } else {
    // SKIP_DELIVERY
    finalExtra = 0;
    finalTotal = 0;
  }

  const newRequest = await prisma.milkDeliveryRequest.create({
    data: {
      customerId,
      subscriptionId: subId || null,
      deliveryDate: targetDate,
      requestType,
      regularQuantity,
      extraQuantity: finalExtra,
      totalQuantity: finalTotal,
      note: note ? String(note).trim() : null,
      status: "PENDING",
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify Admins
  try {
    const mainAdmin = await prisma.admin.findFirst({ where: { role: "ADMIN" } });
    if (mainAdmin) {
      const typeLabel = requestType === "EXTRA_MILK" ? "Extra Milk (+ " + finalExtra + "L)" : "Skip Delivery";
      await notificationService.createNotification({
        userId: mainAdmin.id,
        role: "ADMIN",
        type: "MILK_DELIVERY_REQUEST",
        title: "New Milk Delivery Request",
        message: `${newRequest.customer?.name || "Customer"} submitted a ${typeLabel} request for ${formatDisplayDate(targetDate)}.`,
        entityType: "MilkDeliveryRequest",
        entityId: newRequest.id,
        priority: "HIGH",
        actionType: "NAVIGATE_TAB",
        actionUrl: "/milk-admin/dashboard?tab=milk-requests",
      });
    }
  } catch (e) {
    console.error("[milkDeliveryRequestService] Notification error:", e.message);
  }

  return newRequest;
}

// ─── 3. Get Customer's Own Requests ──────────────────────────────────────────
async function getCustomerRequests(customerId) {
  await ensureTableExists();
  return prisma.milkDeliveryRequest.findMany({
    where: { customerId },
    include: {
      approvedBy: { select: { id: true, name: true } },
      subscription: { select: { id: true, milkType: true } },
    },
    orderBy: [{ deliveryDate: "desc" }, { createdAt: "desc" }],
  });
}

// ─── 4. Update Pending Request (Customer) ────────────────────────────────────
async function updateCustomerRequest(requestId, customerId, payload) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({ where: { id } });

  if (!request) throw new Error("Request not found.");
  if (request.customerId !== customerId) throw new Error("Unauthorized to update this request.");
  if (request.status !== "PENDING") {
    throw new Error(`Cannot modify request with status ${request.status}. Only PENDING requests can be updated.`);
  }

  const { deliveryDate, requestType, extraQuantity, note } = payload;
  let targetDate = request.deliveryDate;
  if (deliveryDate) {
    targetDate = validateAdvanceDate(deliveryDate);
  } else {
    // Re-verify existing deliveryDate is still >= 2 days in advance
    validateAdvanceDate(request.deliveryDate);
  }

  const nextType = requestType || request.requestType;
  if (!["EXTRA_MILK", "SKIP_DELIVERY"].includes(nextType)) {
    throw new Error("Invalid request type. Must be EXTRA_MILK or SKIP_DELIVERY.");
  }

  let finalExtra = 0;
  let finalTotal = 0;
  const regularQuantity = payload.regularQuantity !== undefined ? parseFloat(payload.regularQuantity) : request.regularQuantity;

  if (nextType === "EXTRA_MILK") {
    finalExtra = parseFloat(extraQuantity !== undefined ? extraQuantity : request.extraQuantity);
    if (isNaN(finalExtra) || finalExtra <= 0) {
      throw new Error("Extra quantity must be greater than 0 for Extra Milk requests.");
    }
    finalTotal = parseFloat((regularQuantity + finalExtra).toFixed(2));
  } else {
    finalExtra = 0;
    finalTotal = 0;
  }

  return prisma.milkDeliveryRequest.update({
    where: { id },
    data: {
      deliveryDate: targetDate,
      requestType: nextType,
      regularQuantity,
      extraQuantity: finalExtra,
      totalQuantity: finalTotal,
      note: note !== undefined ? (note ? String(note).trim() : null) : request.note,
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
    },
  });
}

// ─── 5. Cancel Pending Request (Customer) ───────────────────────────────────
async function cancelCustomerRequest(requestId, customerId) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({ where: { id } });

  if (!request) throw new Error("Request not found.");
  if (request.customerId !== customerId) throw new Error("Unauthorized to cancel this request.");
  if (request.status !== "PENDING") {
    throw new Error(`Cannot cancel request with status ${request.status}. Only PENDING requests can be cancelled.`);
  }

  return prisma.milkDeliveryRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

// ─── 6. Get All Requests (Admin) with Filters ───────────────────────────────
async function getAllRequests(filters = {}) {
  await ensureTableExists();
  const { status, requestType, date, search } = filters;
  const where = {};

  if (status && status !== "ALL") {
    where.status = status;
  }
  if (requestType && requestType !== "ALL") {
    where.requestType = requestType;
  }
  if (date) {
    const targetDate = parseDateUtc(date);
    where.deliveryDate = targetDate;
  }
  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { customer: { name: { contains: term, mode: "insensitive" } } },
      { customer: { email: { contains: term, mode: "insensitive" } } },
      { note: { contains: term, mode: "insensitive" } },
    ];
  }

  return prisma.milkDeliveryRequest.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
      subscription: { select: { id: true, milkType: true } },
    },
    orderBy: [{ deliveryDate: "asc" }, { createdAt: "desc" }],
  });
}

// ─── 7. Approve Request (Admin) ─────────────────────────────────────────────
async function approveRequest(requestId, adminId) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({
    where: { id },
    include: { customer: true },
  });

  if (!request) throw new Error("Request not found.");
  if (request.status !== "PENDING") {
    throw new Error(`Request is already ${request.status.toLowerCase()}.`);
  }

  const updated = await prisma.milkDeliveryRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedById: adminId,
      approvedAt: new Date(),
      rejectedReason: null,
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  // Notify Customer
  try {
    const desc =
      request.requestType === "EXTRA_MILK"
        ? `Extra milk (+${request.extraQuantity}L, Total: ${request.totalQuantity}L)`
        : `Skip delivery (0L)`;
    await notificationService.createNotification({
      userId: request.customerId,
      role: "USER",
      type: "DELIVERY_REQUEST_APPROVED",
      title: "Milk Delivery Request Approved",
      message: `Your request for ${formatDisplayDate(request.deliveryDate)} has been approved (${desc}).`,
      entityType: "MilkDeliveryRequest",
      entityId: request.id,
      priority: "HIGH",
    });
  } catch (e) {
    console.error("[milkDeliveryRequestService] Notification error:", e.message);
  }

  return updated;
}

// ─── 8. Reject Request (Admin) ──────────────────────────────────────────────
async function rejectRequest(requestId, adminId, reason) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({
    where: { id },
    include: { customer: true },
  });

  if (!request) throw new Error("Request not found.");
  if (request.status !== "PENDING") {
    throw new Error(`Request is already ${request.status.toLowerCase()}.`);
  }

  const updated = await prisma.milkDeliveryRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      approvedById: adminId,
      approvedAt: new Date(),
      rejectedReason: reason ? String(reason).trim() : "Rejected by Admin",
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  // Notify Customer
  try {
    await notificationService.createNotification({
      userId: request.customerId,
      role: "USER",
      type: "DELIVERY_REQUEST_REJECTED",
      title: "Milk Delivery Request Declined",
      message: `Your milk request for ${formatDisplayDate(request.deliveryDate)} was rejected. Reason: ${updated.rejectedReason}`,
      entityType: "MilkDeliveryRequest",
      entityId: request.id,
      priority: "NORMAL",
    });
  } catch (e) {
    console.error("[milkDeliveryRequestService] Notification error:", e.message);
  }

  return updated;
}

// ─── 9. Delivery Boy Integration Helper ─────────────────────────────────────
/**
 * Returns any approved milk delivery request for a customer on a given delivery date.
 */
async function getApprovedRequestForCustomer(customerId, deliveryDate) {
  if (!customerId) return null;
  await ensureTableExists();
  const targetDate = parseDateUtc(deliveryDate || new Date());

  return prisma.milkDeliveryRequest.findFirst({
    where: {
      customerId,
      deliveryDate: targetDate,
      status: "APPROVED",
    },
  });
}

module.exports = {
  ensureTableExists,
  parseDateUtc,
  validateAdvanceDate,
  getCustomerContext,
  createRequest,
  getCustomerRequests,
  updateCustomerRequest,
  cancelCustomerRequest,
  getAllRequests,
  approveRequest,
  rejectRequest,
  getApprovedRequestForCustomer,
};
