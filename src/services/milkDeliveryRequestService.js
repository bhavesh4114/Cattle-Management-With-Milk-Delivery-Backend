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
      ALTER TABLE "MilkDeliveryRequest" ADD COLUMN IF NOT EXISTS "availableQuantity" DOUBLE PRECISION;
      ALTER TABLE "MilkDeliveryRequest" ADD COLUMN IF NOT EXISTS "offeredQuantity" DOUBLE PRECISION;
      ALTER TABLE "MilkDeliveryRequest" ADD COLUMN IF NOT EXISTS "acceptedQuantity" DOUBLE PRECISION;
      ALTER TABLE "MilkDeliveryRequest" ADD COLUMN IF NOT EXISTS "assignedDeliveryBoyId" INTEGER;
      ALTER TABLE "MilkDeliveryRequest" ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT;
      ALTER TABLE "MilkDeliveryRequest" ADD COLUMN IF NOT EXISTS "assignmentId" INTEGER;
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
  if (diffDays < 1) {
    throw new Error("Milk delivery requests must be submitted at least 1 day in advance.");
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
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

  // Find ONLY ACTIVE Monthly Subscriptions for this logged-in customer
  const userSubs = await prisma.milkSubscription.findMany({
    where: {
      userId: customerId,
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const activeSubs = userSubs.filter((s) => s.status === "ACTIVE");
  const nonExpiredActiveSubs = activeSubs.filter((s) => {
    const end = s.finalEndDate || s.requestedEndDate;
    if (!end) return true;
    return new Date(end) >= today;
  });

  const customer = await prisma.admin.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, email: true },
  });

  if (nonExpiredActiveSubs.length === 0) {
    return {
      customerId,
      customerName: customer?.name || "Customer",
      hasActiveSubscription: false,
      message: "Extra delivery is available only for customers with an active monthly subscription.",
      regularQuantity: 0,
      defaultSubscriptionId: null,
      milkType: null,
      subscriptions: [],
    };
  }

  const primarySub = nonExpiredActiveSubs[0];
  const regularQuantity = primarySub.dailyQuantity || 1;
  const defaultSubscriptionId = primarySub.id;
  const milkType = primarySub.product?.name || primarySub.milkType || "Fresh Milk";

  return {
    customerId,
    customerName: customer?.name || "Customer",
    hasActiveSubscription: true,
    regularQuantity,
    defaultSubscriptionId,
    milkType,
    subscriptions: nonExpiredActiveSubs.map((s) => ({
      id: s.id,
      productId: s.productId,
      productName: s.product?.name || s.milkType || "Fresh Milk",
      milkType: s.milkType || s.product?.name || "Fresh Milk",
      dailyQuantity: s.dailyQuantity,
      startDate: s.finalStartDate || s.requestedStartDate,
      endDate: s.finalEndDate || s.requestedEndDate,
      status: s.status,
      unit: s.product?.unit || "L",
      pricePerLitre: s.pricePerLitre || s.product?.price || 0,
    })),
  };
}

// ─── 2. Create Request (Customer) ───────────────────────────────────────────
async function createRequest(customerId, payload) {
  await ensureTableExists();
  const { deliveryDate, requestType, extraQuantity, note, subscriptionId } = payload;

  if (!["EXTRA_MILK", "SKIP_DELIVERY"].includes(requestType)) {
    const err = new Error("Invalid request type. Must be EXTRA_MILK or SKIP_DELIVERY.");
    err.statusCode = 400;
    throw err;
  }

  // 1. MANDATORY BACKEND ACTIVE MONTHLY SUBSCRIPTION VALIDATION
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

  const userSubs = await prisma.milkSubscription.findMany({
    where: {
      userId: customerId,
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const activeSubs = userSubs.filter((s) => s.status === "ACTIVE");
  const nonExpiredActiveSubs = activeSubs.filter((s) => {
    const end = s.finalEndDate || s.requestedEndDate;
    if (!end) return true;
    return new Date(end) >= today;
  });

  if (nonExpiredActiveSubs.length === 0) {
    const err = new Error("Extra delivery is available only for customers with an active monthly subscription.");
    err.statusCode = 400;
    throw err;
  }

  // Match specific subscription if provided, or default to first valid active subscription
  let matchedSub = null;
  if (subscriptionId) {
    const sId = parseInt(subscriptionId, 10);
    matchedSub = nonExpiredActiveSubs.find((s) => s.id === sId);
    if (!matchedSub) {
      const err = new Error("Extra delivery is available only for customers with an active monthly subscription.");
      err.statusCode = 400;
      throw err;
    }
  } else {
    matchedSub = nonExpiredActiveSubs[0];
  }

  // 2. 1-DAY ADVANCE VALIDATION (Requirement 4)
  const targetDate = validateAdvanceDate(deliveryDate);

  // Check if targetDate is after subscription end date
  const subEndDate = matchedSub.finalEndDate || matchedSub.requestedEndDate;
  if (subEndDate) {
    const endUtc = new Date(subEndDate);
    if (targetDate > endUtc) {
      const err = new Error(
        `Requested delivery date (${formatDisplayDate(targetDate)}) is after your active subscription end date (${formatDisplayDate(endUtc)}).`
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // Check for duplicate pending or approved requests for this customer and date
  const existing = await prisma.milkDeliveryRequest.findFirst({
    where: {
      customerId,
      deliveryDate: targetDate,
      status: { in: ["PENDING", "APPROVED"] },
    },
  });

  if (existing) {
    const err = new Error(
      `A ${existing.status.toLowerCase()} request already exists for ${formatDisplayDate(targetDate)}. Please update or cancel the existing request.`
    );
    err.statusCode = 400;
    throw err;
  }

  const regularQuantity = matchedSub.dailyQuantity || 1;
  const subId = matchedSub.id;

  let finalExtra = 0;
  let finalTotal = 0;

  if (requestType === "EXTRA_MILK") {
    finalExtra = parseFloat(extraQuantity);
    if (isNaN(finalExtra) || finalExtra <= 0) {
      const err = new Error("Extra quantity must be greater than 0 for Extra Milk requests.");
      err.statusCode = 400;
      throw err;
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
      subscriptionId: subId,
      deliveryDate: targetDate,
      requestType,
      regularQuantity,
      extraQuantity: finalExtra,
      totalQuantity: finalTotal,
      note: note ? String(note).trim() : null,
      status: requestType === "EXTRA_MILK" ? "EXTRA_REQUESTED" : "PENDING",
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

  // Verify customer still has an active monthly subscription
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
  const activeSubs = await prisma.milkSubscription.findMany({
    where: { userId: customerId, status: "ACTIVE" }
  });
  const validActiveSubs = activeSubs.filter(s => {
    const end = s.finalEndDate || s.requestedEndDate;
    return !end || new Date(end) >= today;
  });
  if (validActiveSubs.length === 0) {
    const err = new Error("Extra delivery is available only for customers with an active monthly subscription.");
    err.statusCode = 400;
    throw err;
  }

  const { deliveryDate, requestType, extraQuantity, note } = payload;
  let targetDate = request.deliveryDate;
  if (deliveryDate) {
    targetDate = validateAdvanceDate(deliveryDate);
  } else {
    // Re-verify existing deliveryDate is still >= 1 day in advance
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
    if (status === "PENDING") {
      where.status = { in: ["PENDING", "EXTRA_REQUESTED"] };
    } else {
      where.status = status;
    }
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

  const list = await prisma.milkDeliveryRequest.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
      subscription: {
        include: {
          product: true,
        },
      },
    },
    orderBy: [{ deliveryDate: "asc" }, { createdAt: "desc" }],
  });

  const enriched = await Promise.all(
    list.map(async (r) => {
      let regularBoy = null;
      let regularBoyId = r.subscription?.deliveryBoyId;
      if (!regularBoyId && r.subscriptionId) {
        const subAssign = await prisma.deliveryAssignment.findFirst({
          where: { orderType: { in: ["sub", "subscription"] }, orderId: r.subscriptionId, isActive: true },
          select: { deliveryBoyId: true },
        });
        if (subAssign) regularBoyId = subAssign.deliveryBoyId;
      }

      if (regularBoyId) {
        const boyUser = await prisma.admin.findUnique({
          where: { id: regularBoyId },
          select: { id: true, name: true, email: true, status: true },
        });
        if (boyUser) {
          const reqDate = new Date(r.deliveryDate);
          const startOfDay = new Date(reqDate);
          startOfDay.setUTCHours(0, 0, 0, 0);
          const endOfDay = new Date(reqDate);
          endOfDay.setUTCHours(23, 59, 59, 999);

          const leaveActive = await prisma.deliveryBoyLeave.findFirst({
            where: {
              deliveryBoyId: regularBoyId,
              status: "APPROVED",
              startDate: { lte: endOfDay },
              endDate: { gte: startOfDay },
            },
          });
          regularBoy = {
            id: boyUser.id,
            name: boyUser.name,
            email: boyUser.email,
            isOnLeave: !!leaveActive,
            leaveDetails: leaveActive
              ? {
                  startDate: leaveActive.startDate,
                  endDate: leaveActive.endDate,
                  reason: leaveActive.reason,
                }
              : null,
          };
        }
      }

      let assignedBoy = null;
      if (r.assignedDeliveryBoyId) {
        assignedBoy = await prisma.admin.findUnique({
          where: { id: r.assignedDeliveryBoyId },
          select: { id: true, name: true, email: true },
        });
      }

      return {
        ...r,
        customerAddress: r.subscription?.address || "",
        customerPincode: r.subscription?.pincode || "",
        customerPhone: r.subscription?.phone || "",
        productName: r.subscription?.product?.name || r.subscription?.milkType || "Milk",
        productUnit: r.subscription?.product?.unit || "L",
        regularDeliveryBoy: regularBoy,
        assignedDeliveryBoy: assignedBoy,
      };
    })
  );

  return enriched;
}

// ─── 7. Offer Available Quantity (Admin) ────────────────────────────────────
async function offerAvailableQuantity(requestId, adminId, { availableQuantity, offeredQuantity }) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: { include: { product: true } },
    },
  });

  if (!request) {
    const err = new Error("Request not found.");
    err.statusCode = 404;
    throw err;
  }

  const avail = parseFloat(availableQuantity);
  const offer = parseFloat(offeredQuantity);

  if (isNaN(avail) || avail <= 0) {
    const err = new Error("Available quantity must be greater than 0. Cannot offer or approve when available quantity is 0.");
    err.statusCode = 400;
    throw err;
  }

  if (isNaN(offer) || offer <= 0) {
    const err = new Error("Offered quantity must be greater than 0.");
    err.statusCode = 400;
    throw err;
  }

  if (offer > avail) {
    const err = new Error(`Offered quantity (${offer}L) cannot be greater than available quantity (${avail}L).`);
    err.statusCode = 400;
    throw err;
  }

  if (offer > request.extraQuantity) {
    const err = new Error(`Offered quantity (${offer}L) cannot be greater than customer requested quantity (${request.extraQuantity}L).`);
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.milkDeliveryRequest.update({
    where: { id },
    data: {
      availableQuantity: avail,
      offeredQuantity: offer,
      status: "ADMIN_OFFERED",
      approvedById: adminId,
      approvedAt: new Date(),
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      subscription: { include: { product: true } },
    },
  });

  // Notify customer
  try {
    await notificationService.notifyExtraDeliveryOffered({
      customerUserId: request.customerId,
      requestId: request.id,
      requestedQty: request.extraQuantity,
      offeredQty: offer,
      productName: request.subscription?.product?.name || "Milk",
    });
  } catch (e) {
    console.error("[offerAvailableQuantity notification err]", e.message);
  }

  return updated;
}

// ─── 8. Customer Accept / Reject Offer ──────────────────────────────────────
async function customerRespondToOffer(requestId, customerId, payload) {
  await ensureTableExists();
  const decision = typeof payload === "string" ? payload : payload?.decision;
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: { include: { product: true } },
    },
  });

  if (!request) {
    const err = new Error("Request not found.");
    err.statusCode = 404;
    throw err;
  }

  if (request.customerId !== customerId) {
    const err = new Error("Unauthorized to respond to this request.");
    err.statusCode = 403;
    throw err;
  }

  if (request.status !== "ADMIN_OFFERED") {
    const err = new Error(`Cannot respond to request with status ${request.status}. Only ADMIN_OFFERED requests can be accepted or rejected.`);
    err.statusCode = 400;
    throw err;
  }

  if (!["ACCEPT", "REJECT"].includes(decision)) {
    const err = new Error("Invalid decision. Must be ACCEPT or REJECT.");
    err.statusCode = 400;
    throw err;
  }

  if (decision === "ACCEPT") {
    const acceptedQty = request.offeredQuantity !== null && request.offeredQuantity !== undefined ? request.offeredQuantity : request.extraQuantity;
    const totalQty = parseFloat(((request.regularQuantity || 0) + acceptedQty).toFixed(2));
    const updated = await prisma.milkDeliveryRequest.update({
      where: { id },
      data: {
        acceptedQuantity: acceptedQty,
        totalQuantity: totalQty,
        status: "CUSTOMER_ACCEPTED",
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        subscription: { include: { product: true } },
      },
    });

    try {
      await notificationService.notifyExtraDeliveryAccepted({
        customerUserId: request.customerId,
        requestId: request.id,
        acceptedQty,
      });
    } catch (e) {
      console.error("[customerRespondToOffer accept notify err]", e.message);
    }

    return updated;
  } else {
    // REJECT
    const updated = await prisma.milkDeliveryRequest.update({
      where: { id },
      data: {
        status: "EXTRA_REQUEST_REJECTED",
        rejectedReason: "Offer rejected by customer",
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        subscription: { include: { product: true } },
      },
    });

    return updated;
  }
}

// ─── 9. Assign Delivery Boy to Extra Delivery (Admin) ───────────────────────
async function assignDeliveryBoy(requestId, adminId, payload) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const rawBoyId = (payload && typeof payload === "object") ? payload.deliveryBoyId : payload;
  const boyId = parseInt(rawBoyId, 10);

  if (isNaN(boyId)) {
    const err = new Error("Valid delivery boy ID is required.");
    err.statusCode = 400;
    throw err;
  }

  const request = await prisma.milkDeliveryRequest.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: { include: { product: true } },
    },
  });

  if (!request) {
    const err = new Error("Request not found.");
    err.statusCode = 404;
    throw err;
  }

  // Mandatory rule: Must be CUSTOMER_ACCEPTED
  if (request.status !== "CUSTOMER_ACCEPTED") {
    const err = new Error(
      `Cannot assign delivery boy: Request status is ${request.status}. Delivery boy can only be assigned after customer accepts the offer (CUSTOMER_ACCEPTED).`
    );
    err.statusCode = 400;
    throw err;
  }

  // Verify delivery boy exists
  const boy = await prisma.admin.findUnique({
    where: { id: boyId },
    select: { id: true, name: true, email: true, status: true },
  });
  if (!boy || boy.status !== "Active") {
    const err = new Error("Selected delivery boy is not active or does not exist.");
    err.statusCode = 400;
    throw err;
  }

  // Check approved leave for target delivery date
  const targetDate = parseDateUtc(request.deliveryDate);
  const startOfDay = new Date(targetDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const leaveActive = await prisma.deliveryBoyLeave.findFirst({
    where: {
      deliveryBoyId: boyId,
      status: "APPROVED",
      startDate: { lte: endOfDay },
      endDate: { gte: startOfDay },
    },
  });

  if (leaveActive) {
    const startStr = leaveActive.startDate.toISOString().split("T")[0];
    const endStr = leaveActive.endDate.toISOString().split("T")[0];
    const err = new Error(
      `Cannot assign: Delivery boy ${boy.name} is on approved leave (${startStr} to ${endStr}) for this delivery date.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Deactivate any prior active extra assignments for this request
  await prisma.deliveryAssignment.updateMany({
    where: { orderType: "extra", orderId: request.id, isActive: true },
    data: { isActive: false },
  });

  const acceptedQty = request.acceptedQuantity || request.extraQuantity;
  const assignment = await prisma.deliveryAssignment.create({
    data: {
      orderType: "extra",
      orderId: request.id,
      deliveryBoyId: boyId,
      assignedById: adminId,
      deliveryStatus: "EXTRA_ASSIGNED",
      deliveryDate: targetDate,
      notes: `Extra Delivery of ${acceptedQty} L`,
      isActive: true,
      assignedAt: new Date(),
    },
  });

  const updatedRequest = await prisma.milkDeliveryRequest.update({
    where: { id: request.id },
    data: {
      assignedDeliveryBoyId: boyId,
      status: "EXTRA_ASSIGNED",
      deliveryStatus: "EXTRA_ASSIGNED",
      assignmentId: assignment.id,
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      subscription: { include: { product: true } },
    },
  });

  // Notify Delivery Boy
  try {
    const prodName = request.subscription?.product?.name || request.subscription?.milkType || "Milk";
    const fullAddress = request.subscription?.pincode
      ? `${request.subscription.address} (${request.subscription.pincode})`
      : request.subscription?.address || "";

    await notificationService.notifyDeliveryAssigned({
      boyId,
      boyName: boy.name,
      orderId: request.id,
      orderType: "extra",
      customerName: request.customer?.name || "Customer",
      customerUserId: request.customerId,
      adminId,
      deliveryDate: targetDate,
      productName: prodName,
      quantity: acceptedQty, // Delivery boy sees ONLY accepted quantity!
      unit: request.subscription?.product?.unit || "L",
      customerAddress: fullAddress,
      isReassignment: false,
    });
  } catch (e) {
    console.error("[assignDeliveryBoy notification err]", e.message);
  }

  return { ...updatedRequest, request: updatedRequest, assignment };
}

// ─── 10. Approve Request (Direct / Legacy) ──────────────────────────────────
async function approveRequest(requestId, adminId) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({
    where: { id },
    include: { customer: true },
  });

  if (!request) throw new Error("Request not found.");
  if (request.status !== "PENDING" && request.status !== "EXTRA_REQUESTED") {
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

// ─── 11. Reject Request (Admin) ─────────────────────────────────────────────
async function rejectRequest(requestId, adminId, reason) {
  await ensureTableExists();
  const id = parseInt(requestId, 10);
  const request = await prisma.milkDeliveryRequest.findUnique({
    where: { id },
    include: { customer: true },
  });

  if (!request) throw new Error("Request not found.");

  const updated = await prisma.milkDeliveryRequest.update({
    where: { id },
    data: {
      status: "EXTRA_REQUEST_REJECTED",
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

// ─── 12. Delivery Boy Integration Helper ────────────────────────────────────
async function getApprovedRequestForCustomer(customerId, deliveryDate) {
  if (!customerId) return null;
  await ensureTableExists();
  const targetDate = parseDateUtc(deliveryDate || new Date());

  return prisma.milkDeliveryRequest.findFirst({
    where: {
      customerId,
      deliveryDate: targetDate,
      status: {
        in: [
          "APPROVED",
          "CUSTOMER_ACCEPTED",
          "EXTRA_ASSIGNED",
          "PRODUCT_COLLECTED",
          "OUT_FOR_DELIVERY",
          "ARRIVED",
          "DELIVERY_PENDING_CUSTOMER_CONFIRMATION",
          "DELIVERED",
        ],
      },
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
  offerAvailableQuantity,
  customerRespondToOffer,
  assignDeliveryBoy,
  approveRequest,
  rejectRequest,
  getApprovedRequestForCustomer,
};
