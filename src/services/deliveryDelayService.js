const prisma = require("../config/db");
const notificationService = require("./notificationService");

const DEFAULT_GRACE_PERIOD_MINS = 5; // Configurable grace period in minutes

/**
 * Checks for ongoing deliveries exceeding their ETA + grace period and sends delay alerts to Admin.
 * Prevents duplicates by atomically verifying delayAlertSentAt is null and setting it on alert dispatch.
 */
async function checkAndAlertDelayedDeliveries({ gracePeriodMins = DEFAULT_GRACE_PERIOD_MINS } = {}) {
  try {
    const now = new Date();
    const graceMs = gracePeriodMins * 60 * 1000;

    // Find all active delivery assignments where delivery started, ETA is set, not completed/delivered,
    // and delay alert has not yet been sent
    const candidateAssignments = await prisma.deliveryAssignment.findMany({
      where: {
        isActive: true,
        deliveryStatus: {
          notIn: ["Delivered", "DELIVERED", "Cancelled", "CANCELLED", "REJECTED"]
        },
        deliveryStartTime: { not: null },
        estimatedDeliveryTime: { not: null },
        delayAlertSentAt: null, // Strictly prevent duplicate notifications!
        deliveryCompletedAt: null,
        deliveredAt: null
      },
      include: {
        deliveryBoy: {
          include: { deliveryProfile: true }
        }
      }
    });

    const alertsSent = [];

    for (const assignment of candidateAssignments) {
      const eta = new Date(assignment.estimatedDeliveryTime);
      const delayThreshold = new Date(eta.getTime() + graceMs);

      // If current time exceeds ETA + grace period
      if (now > delayThreshold) {
        // Atomically claim sending this alert by setting delayAlertSentAt to prevent race conditions
        const updateResult = await prisma.deliveryAssignment.updateMany({
          where: {
            id: assignment.id,
            delayAlertSentAt: null,
            deliveryStatus: {
              notIn: ["Delivered", "DELIVERED", "Cancelled", "CANCELLED", "REJECTED"]
            }
          },
          data: {
            delayAlertSentAt: now
          }
        });

        // If another concurrent runner claimed it, skip
        if (updateResult.count === 0) continue;

        // Fetch order details (Customer name, order details)
        let customerName = "Customer";
        let adminId = assignment.assignedById;

        if (assignment.orderType === "trial") {
          const trial = await prisma.milkTrial.findUnique({ where: { id: assignment.orderId } });
          if (trial) {
            customerName = trial.customerName || customerName;
            adminId = trial.adminId || adminId;
          }
        } else if (assignment.orderType === "extra") {
          const req = await prisma.milkDeliveryRequest.findUnique({
            where: { id: assignment.orderId },
            include: { customer: true }
          });
          if (req) {
            customerName = req.customer?.name || customerName;
            adminId = req.approvedById || adminId;
          }
        } else {
          const sub = await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId } });
          if (sub) {
            customerName = sub.customerName || customerName;
            adminId = sub.adminId || adminId;
          }
        }

        const boyName = assignment.deliveryBoy?.name || "Delivery Boy";
        const boyPhone = assignment.deliveryBoy?.deliveryProfile?.mobile || assignment.deliveryBoy?.mobile || "";
        const delayMinutes = Math.max(1, Math.round((now.getTime() - eta.getTime()) / (1000 * 60)));

        // Send delay notification to admin
        await notificationService.notifyDeliveryDelay({
          orderId: assignment.orderId,
          orderType: assignment.orderType,
          customerName,
          boyName,
          boyPhone,
          deliveryStartTime: assignment.deliveryStartTime,
          expectedDeliveryTime: assignment.estimatedDeliveryTime,
          delayMinutes,
          deliveryStatus: assignment.deliveryStatus,
          adminId
        });

        alertsSent.push({
          assignmentId: assignment.id,
          orderId: assignment.orderId,
          customerName,
          boyName,
          delayMinutes,
          sentAt: now
        });
      }
    }

    return { success: true, count: alertsSent.length, alerts: alertsSent };
  } catch (err) {
    console.error("[deliveryDelayService.checkAndAlertDelayedDeliveries error]", err);
    return { success: false, error: err.message };
  }
}

// Background recurring scheduler
let monitorIntervalId = null;

function startMonitoring(intervalMs = 60000) {
  if (monitorIntervalId) return; // already running
  console.log(`[deliveryDelayService] Delivery delay monitor started (interval: ${intervalMs / 1000}s)`);

  // Initial check shortly after startup
  setTimeout(() => {
    checkAndAlertDelayedDeliveries().catch((e) =>
      console.error("[deliveryDelayService initial check]", e)
    );
  }, 5000);

  // Periodic scheduled check
  monitorIntervalId = setInterval(() => {
    checkAndAlertDelayedDeliveries().catch((e) =>
      console.error("[deliveryDelayService interval check]", e)
    );
  }, intervalMs);
}

function stopMonitoring() {
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
  }
}

module.exports = {
  checkAndAlertDelayedDeliveries,
  startMonitoring,
  stopMonitoring
};
