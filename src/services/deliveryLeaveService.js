const prisma = require("../config/db");
const notificationService = require("./notificationService");

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

function getDayDiff(startDate, fromDate = new Date()) {
  const s = toDateOnly(startDate);
  const f = toDateOnly(fromDate);
  const diffMs = s.getTime() - f.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function formatDisplayDate(dateObj) {
  const d = new Date(dateObj);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── 1. Apply Leave (Delivery Boy) ─────────────────────────────────────────────
async function applyLeave(deliveryBoyId, { startDate, endDate, reason }) {
  if (!startDate || !endDate) {
    throw new Error("Start date and end date are required.");
  }
  if (!reason || !reason.trim()) {
    throw new Error("Reason is required.");
  }

  const startUtc = toDateOnly(startDate);
  const endUtc = toDateOnly(endDate);
  const nowUtc = toDateOnly(new Date());

  if (endUtc < startUtc) {
    throw new Error("End date cannot be earlier than start date.");
  }

  // 1-day advance validation rule:
  // e.g. Today Oct 8 -> Oct 9 allowed (diff 1), Oct 8 not allowed (diff 0)
  const advanceDays = getDayDiff(startUtc, nowUtc);
  if (advanceDays < 1) {
    throw new Error("Leave must be applied at least 1 day in advance.");
  }

  // Verify delivery boy exists & active
  const boy = await prisma.admin.findUnique({
    where: { id: deliveryBoyId },
    include: { deliveryProfile: true }
  });
  if (!boy || boy.status !== "Active") {
    throw new Error("Delivery boy account is invalid or inactive.");
  }

  // Check overlapping active/pending leave
  const existingOverlap = await prisma.deliveryBoyLeave.findFirst({
    where: {
      deliveryBoyId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endUtc },
      endDate: { gte: startUtc }
    }
  });

  if (existingOverlap) {
    const sStr = existingOverlap.startDate.toISOString().split("T")[0];
    const eStr = existingOverlap.endDate.toISOString().split("T")[0];
    throw new Error(
      `You already have a ${existingOverlap.status.toLowerCase()} leave request overlapping these dates (${sStr} to ${eStr}).`
    );
  }

  const leave = await prisma.deliveryBoyLeave.create({
    data: {
      deliveryBoyId,
      startDate: startUtc,
      endDate: endUtc,
      reason: reason.trim(),
      status: "PENDING",
      appliedAt: new Date()
    },
    include: {
      deliveryBoy: {
        select: { id: true, name: true, email: true }
      }
    }
  });

  // Notify Admin of Leave Request
  notificationService.notifyLeaveRequested({
    leaveId: leave.id,
    deliveryBoyId,
    deliveryBoyName: boy.name,
    startDate: startUtc,
    endDate: endUtc
  }).catch(err => console.error('[notifyLeaveRequested error]', err));

  return leave;
}

// ─── 2. Get My Leaves (Delivery Boy) ───────────────────────────────────────────
async function getMyLeaves(deliveryBoyId) {
  return await prisma.deliveryBoyLeave.findMany({
    where: { deliveryBoyId },
    orderBy: { createdAt: "desc" },
    include: {
      approvedBy: {
        select: { id: true, name: true, email: true }
      }
    }
  });
}

// ─── 3. Cancel Leave (Delivery Boy or Admin) ───────────────────────────────────
async function cancelLeave(leaveId, userId, userRole) {
  const leave = await prisma.deliveryBoyLeave.findUnique({
    where: { id: parseInt(leaveId) }
  });

  if (!leave) {
    throw new Error("Leave request not found");
  }

  const isAdmin = userRole === "ADMIN";
  if (!isAdmin && leave.deliveryBoyId !== userId) {
    throw new Error("Unauthorized to cancel this leave request");
  }

  if (leave.status === "CANCELLED") {
    throw new Error("Leave is already cancelled.");
  }
  if (leave.status === "REJECTED") {
    throw new Error("Cannot cancel a rejected leave.");
  }

  const todayUtc = toDateOnly(new Date());
  if (leave.status === "APPROVED" && toDateOnly(leave.endDate) < todayUtc) {
    throw new Error("Cannot cancel a leave that has already concluded.");
  }

  return await prisma.$transaction(async (tx) => {
    if (leave.status === "APPROVED") {
      const startUtc = toDateOnly(leave.startDate);
      const endUtc = toDateOnly(leave.endDate);
      const curr = new Date(startUtc < todayUtc ? todayUtc : startUtc);

      while (curr <= endUtc) {
        const dObj = new Date(curr);
        await tx.deliveryAvailability.upsert({
          where: {
            deliveryBoyId_date: {
              deliveryBoyId: leave.deliveryBoyId,
              date: dObj
            }
          },
          update: { status: "Available" },
          create: {
            deliveryBoyId: leave.deliveryBoyId,
            date: dObj,
            status: "Available"
          }
        });
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    }

    return await tx.deliveryBoyLeave.update({
      where: { id: leave.id },
      data: { status: "CANCELLED" }
    });
  });
}

// ─── 4. Admin: Get All Leaves ──────────────────────────────────────────────────
async function getAllLeaves({ status, deliveryBoyId } = {}) {
  const where = {};
  if (status && status !== "ALL") {
    where.status = status;
  }
  if (deliveryBoyId) {
    where.deliveryBoyId = parseInt(deliveryBoyId);
  }

  return await prisma.deliveryBoyLeave.findMany({
    where,
    include: {
      deliveryBoy: {
        select: {
          id: true,
          name: true,
          email: true,
          deliveryProfile: true,
          customRole: true
        }
      },
      approvedBy: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

// ─── 5. Admin: Get Affected Deliveries For Leave (Preview before Direct Assign) ─
async function getAffectedDeliveriesForLeave(leaveId) {
  const leave = await prisma.deliveryBoyLeave.findUnique({
    where: { id: parseInt(leaveId) },
    include: {
      deliveryBoy: {
        select: { id: true, name: true, email: true, deliveryProfile: true }
      }
    }
  });

  if (!leave) throw new Error("Leave request not found");

  const startUtc = toDateOnly(leave.startDate);
  const endUtc = toDateOnly(leave.endDate);

  // 1. Ensure DeliveryAssignments exist for active subscriptions and trials during the leave window
  const activeSubs = await prisma.milkSubscription.findMany({
    where: {
      deliveryBoyId: leave.deliveryBoyId,
      status: "ACTIVE"
    }
  });

  const activeTrials = await prisma.milkTrial.findMany({
    where: {
      deliveryBoyId: leave.deliveryBoyId,
      status: { in: ["ACTIVE", "ACCEPTED", "APPROVED"] }
    }
  });

  let ensureDate = new Date(startUtc);
  while (ensureDate <= endUtc) {
    const curDateOnly = toDateOnly(ensureDate);

    // Active subscriptions for this date
    for (const sub of activeSubs) {
      const sStart = toDateOnly(sub.finalStartDate || sub.offeredStartDate || sub.requestedStartDate || sub.createdAt);
      const sEnd = toDateOnly(sub.finalEndDate || sub.offeredEndDate || sub.requestedEndDate || "2099-01-01");
      if (curDateOnly >= sStart && curDateOnly <= sEnd) {
        const existing = await prisma.deliveryAssignment.findFirst({
          where: {
            orderType: "sub",
            orderId: sub.id,
            deliveryDate: curDateOnly,
            isActive: true
          }
        });
        if (!existing) {
          await prisma.deliveryAssignment.create({
            data: {
              orderType: "sub",
              orderId: sub.id,
              deliveryBoyId: leave.deliveryBoyId,
              assignedById: leave.approvedById || leave.deliveryBoyId,
              deliveryDate: curDateOnly,
              deliveryStatus: "Assigned",
              isActive: true
            }
          });
        }
      }
    }

    // Active trials for this date
    for (const trial of activeTrials) {
      const tStart = toDateOnly(trial.startDate || trial.createdAt);
      const tEnd = toDateOnly(trial.endDate || trial.startDate || trial.createdAt);
      if (curDateOnly >= tStart && curDateOnly <= tEnd) {
        const existing = await prisma.deliveryAssignment.findFirst({
          where: {
            orderType: "trial",
            orderId: trial.id,
            deliveryDate: curDateOnly,
            isActive: true
          }
        });
        if (!existing) {
          await prisma.deliveryAssignment.create({
            data: {
              orderType: "trial",
              orderId: trial.id,
              deliveryBoyId: leave.deliveryBoyId,
              assignedById: leave.approvedById || leave.deliveryBoyId,
              deliveryDate: curDateOnly,
              deliveryStatus: "Assigned",
              isActive: true
            }
          });
        }
      }
    }

    ensureDate.setUTCDate(ensureDate.getUTCDate() + 1);
  }

  // Find active assignments during leave window
  const assignments = await prisma.deliveryAssignment.findMany({
    where: {
      OR: [
        { deliveryBoyId: leave.deliveryBoyId },
        { previousDeliveryBoyId: leave.deliveryBoyId, needsReassignment: true }
      ],
      isActive: true,
      deliveryDate: {
        gte: startUtc,
        lte: endUtc
      },
      deliveryStatus: { notIn: ["Delivered", "Cancelled", "Rejected"] }
    },
    orderBy: { deliveryDate: "asc" }
  });

  // Enrich with order details
  const enrichedAssignments = await Promise.all(
    assignments.map(async (a) => {
      let order =
        a.orderType === "trial"
          ? await prisma.milkTrial.findUnique({ where: { id: a.orderId }, include: { product: true } })
          : await prisma.milkSubscription.findUnique({ where: { id: a.orderId }, include: { product: true } });

      return {
        id: a.id,
        orderId: a.orderId,
        orderType: a.orderType,
        deliveryDate: a.deliveryDate,
        dateKey: a.deliveryDate.toISOString().split("T")[0],
        deliveryStatus: a.deliveryStatus,
        customerName: order?.customerName || "Customer",
        address: order?.address || "",
        pincode: order?.pincode || "",
        milkType: order?.milkType || order?.product?.name || "Milk",
        dailyQuantity: order?.dailyQuantity || 1
      };
    })
  );

  // Find all active custom delivery staff
  const allBoys = await prisma.admin.findMany({
    where: {
      id: { not: leave.deliveryBoyId },
      role: "CUSTOM",
      status: "Active"
    },
    include: {
      deliveryProfile: true,
      customRole: true,
      deliveryBoyLeaves: {
        where: { status: "APPROVED" }
      }
    }
  });

  const validBoys = allBoys.filter((b) => {
    const n = (b.customRole?.name || "").toLowerCase();
    const p = Array.isArray(b.customRole?.permissions) ? b.customRole.permissions : [];
    const isDelivery =
      n.includes("deliver") || n.includes("delever") || p.some((x) => String(x).toLowerCase().includes("deliver"));
    if (!isDelivery) return false;
    if (b.deliveryProfile && b.deliveryProfile.accountStatus !== "Active") return false;
    return true;
  });

  // Group deliveries by each calendar date in range [startUtc .. endUtc]
  const datesMap = {};
  const curr = new Date(startUtc);
  while (curr <= endUtc) {
    const dStr = curr.toISOString().split("T")[0];
    const targetDate = toDateOnly(curr);

    // Filter delivery boys available on this specific date (not on approved leave)
    const eligibleForDate = validBoys
      .filter((boy) => {
        const onLeave = boy.deliveryBoyLeaves.some((l) => {
          const s = toDateOnly(l.startDate);
          const e = toDateOnly(l.endDate);
          return targetDate >= s && targetDate <= e;
        });
        return !onLeave;
      })
      .map((boy) => ({
        id: boy.id,
        name: boy.name,
        email: boy.email,
        mobile: boy.deliveryProfile?.mobile || "",
        pincodes: boy.deliveryProfile?.pincodes || []
      }));

    datesMap[dStr] = {
      date: dStr,
      displayDate: formatDisplayDate(curr),
      deliveries: [],
      eligibleDeliveryBoys: eligibleForDate
    };

    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  // Populate assignments into dates
  for (const item of enrichedAssignments) {
    if (datesMap[item.dateKey]) {
      datesMap[item.dateKey].deliveries.push(item);
    }
  }

  const datesArray = Object.values(datesMap).map((d) => ({
    ...d,
    count: d.deliveries.length
  }));

  // Overall eligible delivery boys across the period
  const allEligibleDeliveryBoys = validBoys.map((boy) => ({
    id: boy.id,
    name: boy.name,
    email: boy.email,
    mobile: boy.deliveryProfile?.mobile || "",
    pincodes: boy.deliveryProfile?.pincodes || []
  }));

  return {
    leave: {
      id: leave.id,
      deliveryBoyId: leave.deliveryBoyId,
      deliveryBoyName: leave.deliveryBoy?.name || "Staff",
      deliveryBoyEmail: leave.deliveryBoy?.email || "",
      startDate: leave.startDate.toISOString().split("T")[0],
      endDate: leave.endDate.toISOString().split("T")[0],
      reason: leave.reason,
      status: leave.status
    },
    totalAffected: enrichedAssignments.length,
    dates: datesArray,
    allEligibleDeliveryBoys
  };
}

// ─── 6. Admin: Direct Approve & Assign Deliveries (No Accept/Reject flow) ──────
async function directApproveAndAssign(leaveId, adminId, { assignmentsByDate = {}, globalDeliveryBoyId, notes } = {}) {
  return await prisma.$transaction(async (tx) => {
    const leave = await tx.deliveryBoyLeave.findUnique({
      where: { id: parseInt(leaveId) },
      include: {
        deliveryBoy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!leave) throw new Error("Leave request not found");
    if (leave.status === "REJECTED" || leave.status === "CANCELLED") {
      throw new Error(`Cannot approve leave with status: ${leave.status}`);
    }

    const now = new Date();
    const startUtc = toDateOnly(leave.startDate);
    const endUtc = toDateOnly(leave.endDate);

    // 1. Mark leave as APPROVED
    const approvedLeave = await tx.deliveryBoyLeave.update({
      where: { id: leave.id },
      data: {
        status: "APPROVED",
        approvedById: adminId,
        approvedAt: now
      }
    });

    // 2. Set DeliveryAvailability to 'On Leave' for each day in range
    const curr = new Date(startUtc);
    while (curr <= endUtc) {
      const dateObj = new Date(curr);
      await tx.deliveryAvailability.upsert({
        where: {
          deliveryBoyId_date: {
            deliveryBoyId: leave.deliveryBoyId,
            date: dateObj
          }
        },
        update: { status: "On Leave" },
        create: {
          deliveryBoyId: leave.deliveryBoyId,
          date: dateObj,
          status: "On Leave"
        }
      });
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    // 3. Find affected active deliveries
    const affectedAssignments = await tx.deliveryAssignment.findMany({
      where: {
        OR: [
          { deliveryBoyId: leave.deliveryBoyId },
          { previousDeliveryBoyId: leave.deliveryBoyId, needsReassignment: true }
        ],
        isActive: true,
        deliveryDate: {
          gte: startUtc,
          lte: endUtc
        },
        deliveryStatus: { notIn: ["Delivered", "Cancelled", "Rejected"] }
      }
    });

    const parsedGlobalBoyId = globalDeliveryBoyId ? parseInt(globalDeliveryBoyId) : null;
    let reassignedCount = 0;
    let queuedCount = 0;
    const assignmentsSummary = [];
    const boyNotificationsMap = {}; // targetBoyId -> { count, dates: Set }

    for (const assignment of affectedAssignments) {
      const dateKey = assignment.deliveryDate.toISOString().split("T")[0];
      const selectedForDate = assignmentsByDate[dateKey] ? parseInt(assignmentsByDate[dateKey]) : null;
      const targetBoyId = selectedForDate || parsedGlobalBoyId;

      if (targetBoyId) {
        // Direct assignment to targetBoyId
        const newBoy = await tx.admin.findUnique({
          where: { id: targetBoyId },
          select: { id: true, name: true, email: true, status: true }
        });

        if (!newBoy || newBoy.status !== "Active") {
          throw new Error(`Target delivery boy (ID: ${targetBoyId}) is not active`);
        }

        // Check target boy not on approved leave on this date
        const targetDate = toDateOnly(assignment.deliveryDate);
        const onLeave = await tx.deliveryBoyLeave.findFirst({
          where: {
            deliveryBoyId: targetBoyId,
            status: "APPROVED",
            startDate: { lte: targetDate },
            endDate: { gte: targetDate }
          }
        });
        if (onLeave) {
          throw new Error(
            `Selected delivery boy ${newBoy.name} is on approved leave on ${dateKey}. Please select another delivery boy.`
          );
        }

        // Direct assignment update: Old boy replaced with New boy immediately
        await tx.deliveryAssignment.update({
          where: { id: assignment.id },
          data: {
            deliveryBoyId: targetBoyId,
            previousDeliveryBoyId: leave.deliveryBoyId,
            needsReassignment: false,
            reassignmentReason: null,
            notes: (assignment.notes ? assignment.notes + " | " : "") +
              `Directly assigned to ${newBoy.name} by Admin due to leave of ${leave.deliveryBoy?.name || "staff"}`
          }
        });

        // Update corresponding order
        if (assignment.orderType === "trial") {
          await tx.milkTrial.update({
            where: { id: assignment.orderId },
            data: { deliveryBoyId: targetBoyId }
          });
        } else {
          await tx.milkSubscription.update({
            where: { id: assignment.orderId },
            data: { deliveryBoyId: targetBoyId }
          });
        }

        // Log into history
        await tx.deliveryHistory.create({
          data: {
            orderType: assignment.orderType,
            orderId: assignment.orderId,
            deliveryBoyId: targetBoyId,
            status: assignment.deliveryStatus,
            action: "ADMIN_DIRECT_REASSIGN",
            metadata: {
              leaveId: leave.id,
              previousDeliveryBoyId: leave.deliveryBoyId,
              previousDeliveryBoyName: leave.deliveryBoy?.name || "staff",
              newDeliveryBoyId: targetBoyId,
              newDeliveryBoyName: newBoy.name,
              deliveryDate: dateKey
            }
          }
        });

        reassignedCount++;
        assignmentsSummary.push({
          assignmentId: assignment.id,
          orderId: assignment.orderId,
          date: dateKey,
          status: "DIRECTLY_ASSIGNED",
          newDeliveryBoyId: targetBoyId,
          newDeliveryBoyName: newBoy.name
        });

        // Track for notification
        if (!boyNotificationsMap[targetBoyId]) {
          boyNotificationsMap[targetBoyId] = { boyName: newBoy.name, count: 0, dates: new Set() };
        }
        boyNotificationsMap[targetBoyId].count++;
        boyNotificationsMap[targetBoyId].dates.add(formatDisplayDate(assignment.deliveryDate));
      } else {
        // No replacement selected by Admin -> move to Reassignment Queue
        await tx.deliveryAssignment.update({
          where: { id: assignment.id },
          data: {
            previousDeliveryBoyId: leave.deliveryBoyId,
            needsReassignment: true,
            reassignmentReason: `Leave approved for ${leave.deliveryBoy?.name || "staff"}. Awaiting admin assignment.`
          }
        });

        queuedCount++;
        assignmentsSummary.push({
          assignmentId: assignment.id,
          orderId: assignment.orderId,
          date: dateKey,
          status: "QUEUED_FOR_ADMIN",
          reason: "No replacement selected"
        });
      }
    }

    // 4. Send Informational Notification to each selected replacement delivery boy
    // NOTE: Informational only. No Accept / Reject buttons.
    for (const boyIdStr of Object.keys(boyNotificationsMap)) {
      const bId = parseInt(boyIdStr);
      const notifData = boyNotificationsMap[bId];
      const datesArr = Array.from(notifData.dates);
      const count = notifData.count;

      let msg = "";
      if (datesArr.length === 1) {
        msg = `New Deliveries Assigned: ${count} deliveries have been assigned to you for ${datesArr[0]}.`;
      } else {
        msg = `New Deliveries Assigned: ${count} deliveries have been assigned to you from ${datesArr[0]} to ${datesArr[datesArr.length - 1]}.`;
      }

      await tx.userAlert.create({
        data: {
          userId: bId,
          message: msg,
          type: "DELIVERY_ASSIGNMENT",
          orderType: "BATCH",
          metadata: {
            leaveId: leave.id,
            count,
            dates: datesArr,
            assignedByAdminId: adminId
          }
        }
      });
    }

    // Trigger Role-Based Notifications & Special Alerts (outside transaction or safe fire-and-forget)
    notificationService.notifyLeaveApproved({
      leaveId: leave.id,
      deliveryBoyId: leave.deliveryBoyId,
      deliveryBoyName: leave.deliveryBoy?.name,
      startDate: leave.startDate,
      endDate: leave.endDate,
      adminId
    }).catch(err => console.error('[notifyLeaveApproved error]', err));

    for (const boyIdStr of Object.keys(boyNotificationsMap)) {
      const bId = parseInt(boyIdStr);
      const notifData = boyNotificationsMap[bId];
      const datesArr = Array.from(notifData.dates);
      notificationService.notifyBulkDeliveriesReassigned({
        oldBoyId: leave.deliveryBoyId,
        oldBoyName: leave.deliveryBoy?.name,
        newBoyId: bId,
        newBoyName: notifData.boyName,
        count: notifData.count,
        dates: datesArr,
        adminId
      }).catch(err => console.error('[notifyBulkDeliveriesReassigned error]', err));
    }

    if (queuedCount > 0) {
      const queuedDates = [...new Set(assignmentsSummary.filter(s => s.status === "QUEUED_FOR_ADMIN").map(s => s.date))];
      notificationService.notifyReassignmentRequired({
        count: queuedCount,
        dates: queuedDates,
        adminId
      }).catch(err => console.error('[notifyReassignmentRequired error]', err));
    }

    return {
      leave: approvedLeave,
      totalAffected: affectedAssignments.length,
      reassignedCount,
      queuedCount,
      summary: assignmentsSummary
    };
  });
}

// ─── 7. Admin: Reject Leave ────────────────────────────────────────────────────
async function rejectLeave(leaveId, adminId, rejectionReason) {
  const leave = await prisma.deliveryBoyLeave.findUnique({
    where: { id: parseInt(leaveId) }
  });
  if (!leave) throw new Error("Leave request not found");
  if (leave.status !== "PENDING") {
    throw new Error(`Cannot reject leave with status: ${leave.status}. Only PENDING leaves can be rejected.`);
  }

  return await prisma.deliveryBoyLeave.update({
    where: { id: leave.id },
    data: {
      status: "REJECTED",
      approvedById: adminId,
      approvedAt: new Date(),
      rejectionReason: rejectionReason ? rejectionReason.trim() : null
    }
  });
}

// ─── 8. Admin: Get Reassignment Queue ──────────────────────────────────────────
async function getReassignmentQueue() {
  const assignments = await prisma.deliveryAssignment.findMany({
    where: {
      needsReassignment: true,
      isActive: true,
      deliveryStatus: { notIn: ["Delivered", "Cancelled", "Rejected"] }
    },
    include: {
      deliveryBoy: { select: { id: true, name: true, email: true } }
    },
    orderBy: { deliveryDate: "asc" }
  });

  const allBoys = await prisma.admin.findMany({
    where: { role: "CUSTOM", status: "Active" },
    include: {
      deliveryProfile: true,
      customRole: true,
      deliveryBoyLeaves: {
        where: { status: "APPROVED" }
      }
    }
  });

  const eligibleBoys = allBoys.filter((b) => {
    const n = (b.customRole?.name || "").toLowerCase();
    const p = Array.isArray(b.customRole?.permissions) ? b.customRole.permissions : [];
    return n.includes("deliver") || n.includes("delever") || p.some((x) => String(x).toLowerCase().includes("deliver"));
  });

  const enriched = await Promise.all(
    assignments.map(async (a) => {
      let order =
        a.orderType === "trial"
          ? await prisma.milkTrial.findUnique({ where: { id: a.orderId }, include: { product: true } })
          : await prisma.milkSubscription.findUnique({ where: { id: a.orderId }, include: { product: true } });

      let prevBoy = null;
      if (a.previousDeliveryBoyId) {
        prevBoy = await prisma.admin.findUnique({
          where: { id: a.previousDeliveryBoyId },
          select: { id: true, name: true, email: true, deliveryProfile: true }
        });
      }

      const targetDate = toDateOnly(a.deliveryDate);
      const availableBoys = eligibleBoys
        .filter((boy) => {
          const onLeave = boy.deliveryBoyLeaves.some((l) => {
            const s = toDateOnly(l.startDate);
            const e = toDateOnly(l.endDate);
            return targetDate >= s && targetDate <= e;
          });
          return !onLeave;
        })
        .map((boy) => ({
          id: boy.id,
          name: boy.name,
          email: boy.email,
          mobile: boy.deliveryProfile?.mobile,
          pincodes: boy.deliveryProfile?.pincodes || [],
          pincodeMatch: order?.pincode ? (boy.deliveryProfile?.pincodes || []).includes(order.pincode) : false
        }));

      return {
        id: a.id,
        orderId: a.orderId,
        orderType: a.orderType,
        deliveryDate: a.deliveryDate,
        deliveryStatus: a.deliveryStatus,
        reassignmentReason: a.reassignmentReason,
        customerName: order?.customerName || "Unknown Customer",
        address: order?.address || "",
        pincode: order?.pincode || "",
        milkType: order?.milkType || order?.product?.name || "Milk",
        dailyQuantity: order?.dailyQuantity || 1,
        currentDeliveryBoy: a.deliveryBoy,
        previousDeliveryBoy: prevBoy,
        availableDeliveryBoys: availableBoys
      };
    })
  );

  return enriched;
}

// ─── 9. Admin: Direct Manual Reassignment From Queue (No Accept/Reject) ────────
async function manualReassign(assignmentId, newDeliveryBoyId, adminId, notes) {
  return await prisma.$transaction(async (tx) => {
    const assignment = await tx.deliveryAssignment.findUnique({
      where: { id: parseInt(assignmentId) }
    });
    if (!assignment) throw new Error("Assignment not found");

    const boyId = parseInt(newDeliveryBoyId);
    const boy = await tx.admin.findUnique({
      where: { id: boyId },
      include: { deliveryProfile: true }
    });
    if (!boy || boy.status !== "Active") throw new Error("Selected delivery boy is invalid or inactive");

    const targetDate = toDateOnly(assignment.deliveryDate);
    const onLeave = await tx.deliveryBoyLeave.findFirst({
      where: {
        deliveryBoyId: boyId,
        status: "APPROVED",
        startDate: { lte: targetDate },
        endDate: { gte: targetDate }
      }
    });

    if (onLeave) {
      throw new Error(
        `Cannot reassign: ${boy.name} is on approved leave on ${targetDate.toISOString().split("T")[0]}.`
      );
    }

    const oldBoyId = assignment.deliveryBoyId;

    const updated = await tx.deliveryAssignment.update({
      where: { id: assignment.id },
      data: {
        deliveryBoyId: boyId,
        previousDeliveryBoyId: oldBoyId,
        needsReassignment: false,
        reassignmentReason: null,
        notes: (notes ? notes : assignment.notes) || null
      }
    });

    if (assignment.orderType === "trial") {
      await tx.milkTrial.update({
        where: { id: assignment.orderId },
        data: { deliveryBoyId: boyId }
      });
    } else {
      await tx.milkSubscription.update({
        where: { id: assignment.orderId },
        data: { deliveryBoyId: boyId }
      });
    }

    await tx.deliveryHistory.create({
      data: {
        orderType: assignment.orderType,
        orderId: assignment.orderId,
        deliveryBoyId: boyId,
        status: assignment.deliveryStatus,
        action: "MANUAL_DIRECT_REASSIGN_BY_ADMIN",
        metadata: {
          reassignedByAdminId: adminId,
          previousDeliveryBoyId: oldBoyId,
          newDeliveryBoyId: boyId
        }
      }
    });

    // Send informational alert to assigned delivery boy
    const dateFormatted = formatDisplayDate(assignment.deliveryDate);
    await tx.userAlert.create({
      data: {
        userId: boyId,
        message: `New Delivery Assigned: Order #${assignment.orderId} (${assignment.orderType}) has been assigned to you for ${dateFormatted}.`,
        type: "DELIVERY_ASSIGNMENT",
        orderType: assignment.orderType,
        orderId: assignment.orderId,
        metadata: {
          assignmentId: assignment.id,
          assignedByAdminId: adminId,
          previousDeliveryBoyId: oldBoyId
        }
      }
    });

    // Trigger Role-Based Notification for manual direct reassignment
    const orderInfo = assignment.orderType === "trial"
      ? await prisma.milkTrial.findUnique({ where: { id: assignment.orderId } })
      : await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId } });

    notificationService.notifyDeliveryAssigned({
      boyId,
      boyName: targetBoy.name,
      orderId: assignment.orderId,
      orderType: assignment.orderType,
      customerName: orderInfo?.customerName,
      customerUserId: orderInfo?.userId,
      adminId,
      deliveryDate: assignment.deliveryDate,
      isReassignment: true,
      previousBoyName: oldBoy?.name
    }).catch(err => console.error('[notifyDeliveryAssigned manual error]', err));

    return updated;
  });
}

// ─── 10. Check if Boy is on Approved Leave ────────────────────────────────────
async function isBoyOnLeave(deliveryBoyId, date) {
  const targetDate = toDateOnly(date);
  const leave = await prisma.deliveryBoyLeave.findFirst({
    where: {
      deliveryBoyId,
      status: "APPROVED",
      startDate: { lte: targetDate },
      endDate: { gte: targetDate }
    }
  });
  return Boolean(leave);
}

module.exports = {
  applyLeave,
  getMyLeaves,
  cancelLeave,
  getAllLeaves,
  getAffectedDeliveriesForLeave,
  directApproveAndAssign,
  approveLeave: directApproveAndAssign,
  rejectLeave,
  getReassignmentQueue,
  manualReassign,
  isBoyOnLeave,
  toDateOnly,
  getDayDiff,
  formatDisplayDate
};
