const prisma = require("../config/db");

// Get users with pending payments (Admin only)
exports.getPendingPaymentUsers = async (req, res) => {
  try {
    const pendingSubscriptions = await prisma.milkSubscription.findMany({
      where: { 
        status: { in: ['AWAITING_PAYMENT', 'AWAITING_CUSTOMER'] } 
      },
      include: {
        admin: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    const usersMap = new Map();
    pendingSubscriptions.forEach(sub => {
      if (sub.userId) {
        usersMap.set(sub.userId, {
          id: sub.userId,
          name: sub.customerName,
          phone: sub.phone,
          email: sub.admin?.email || 'N/A',
          pendingAmount: (usersMap.get(sub.userId)?.pendingAmount || 0) + (sub.totalAmount || 0),
          orderCount: (usersMap.get(sub.userId)?.orderCount || 0) + 1
        });
      }
    });

    res.json(Array.from(usersMap.values()));
  } catch (error) {
    console.error('Error fetching pending payment users:', error);
    res.status(500).json({ error: 'Failed to fetch pending payment users' });
  }
};

// Send custom alert to users (Admin broadcast)
exports.sendAlerts = async (req, res) => {
  try {
    const { userIds, message, title } = req.body;
    
    if (!userIds || userIds.length === 0 || !message) {
      return res.status(400).json({ error: 'Missing userIds or message' });
    }

    const alerts = userIds
      .filter(id => id != null)
      .map(userId => ({
        userId: parseInt(userId, 10),
        title: title || 'Admin Announcement',
        message,
        type: 'GENERAL',
        priority: 'NORMAL'
      }));

    if (alerts.length > 0) {
      await prisma.userAlert.createMany({
        data: alerts
      });
    }

    res.json({ success: true, message: 'Alerts sent successfully' });
  } catch (error) {
    console.error('Error sending alerts:', error);
    res.status(500).json({ error: 'Failed to send alerts', details: error.message });
  }
};

// =========================================================================
// ROLE-BASED NOTIFICATION CENTER APIS
// =========================================================================

// GET /api/alerts/notifications
// Retrieves notifications for the currently authenticated user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.admin?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const { unreadOnly, limit = 50, includeSpecial } = req.query;
    const where = { userId };
    
    if (unreadOnly === 'true') {
      where.isRead = false;
    }
    if (includeSpecial !== 'true') {
      where.isSpecialAlert = false;
    }

    const notifications = await prisma.userAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10)
    });

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// Self-healing function: Automatically applies missing columns to live DB if not present
let isMigrationDone = false;
async function ensureUserAlertColumns() {
  if (isMigrationDone) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "UserAlert"
      ADD COLUMN IF NOT EXISTS "title" TEXT,
      ADD COLUMN IF NOT EXISTS "role" TEXT,
      ADD COLUMN IF NOT EXISTS "entityType" TEXT,
      ADD COLUMN IF NOT EXISTS "entityId" INTEGER,
      ADD COLUMN IF NOT EXISTS "deliveryId" INTEGER,
      ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMAL',
      ADD COLUMN IF NOT EXISTS "isSpecialAlert" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "isDismissed" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "actionType" TEXT,
      ADD COLUMN IF NOT EXISTS "actionUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "UserAlert_userId_isRead_idx" ON "UserAlert"("userId", "isRead");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "UserAlert_userId_isSpecialAlert_isDismissed_idx" ON "UserAlert"("userId", "isSpecialAlert", "isDismissed");
    `);
    isMigrationDone = true;
    console.log('[alertController] Live DB UserAlert columns verified/added.');
  } catch (e) {
    console.error('[ensureUserAlertColumns error]', e.message);
  }
}

// Endpoint to run manual DB migration if needed
exports.runAutoMigration = async (req, res) => {
  try {
    await ensureUserAlertColumns();
    res.json({ success: true, message: 'Live database schema auto-migrated successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Migration failed', details: e.message });
  }
};

// GET /api/alerts/special-alerts
// Retrieves active special dashboard alerts for the currently authenticated user
exports.getSpecialAlerts = async (req, res) => {
  try {
    const userId = req.admin?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    try {
      const alerts = await prisma.userAlert.findMany({
        where: {
          userId,
          isSpecialAlert: true,
          isDismissed: false
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(alerts);
    } catch (dbErr) {
      // If live database is missing columns, run self-healing migration and retry
      await ensureUserAlertColumns();
      const alerts = await prisma.userAlert.findMany({
        where: {
          userId,
          isSpecialAlert: true,
          isDismissed: false
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(alerts);
    }
  } catch (error) {
    console.error('Error fetching special alerts:', error);
    res.status(500).json({ error: 'Failed to fetch special alerts' });
  }
};

// GET /api/alerts/unread-count
// Returns unread notifications count + active special alerts count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.admin?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    try {
      const [unreadCount, specialCount] = await Promise.all([
        prisma.userAlert.count({
          where: { userId, isRead: false, isSpecialAlert: false }
        }),
        prisma.userAlert.count({
          where: { userId, isSpecialAlert: true, isDismissed: false }
        })
      ]);
      return res.json({ unreadCount, specialCount });
    } catch (dbErr) {
      // If live database is missing columns, run self-healing migration and retry
      await ensureUserAlertColumns();
      const [unreadCount, specialCount] = await Promise.all([
        prisma.userAlert.count({
          where: { userId, isRead: false, isSpecialAlert: false }
        }),
        prisma.userAlert.count({
          where: { userId, isSpecialAlert: true, isDismissed: false }
        })
      ]);
      return res.json({ unreadCount, specialCount });
    }
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

// PUT /api/alerts/:id/read
// Mark a notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.admin?.id;

    // Verify ownership
    const alert = await prisma.userAlert.findUnique({ where: { id: parseInt(id, 10) } });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.userId !== userId && req.admin?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized to mark this alert as read' });
    }

    await prisma.userAlert.update({
      where: { id: parseInt(id, 10) },
      data: { isRead: true, readAt: new Date() }
    });

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
};

// PUT /api/alerts/mark-all-read
// Mark all notifications for authenticated user as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.admin?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    await prisma.userAlert.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
};

// PUT /api/alerts/:id/dismiss
// Dismiss a special dashboard alert
exports.dismissSpecialAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.admin?.id;

    const alert = await prisma.userAlert.findUnique({ where: { id: parseInt(id, 10) } });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.userId !== userId && req.admin?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized to dismiss this alert' });
    }

    const now = new Date();
    await prisma.userAlert.update({
      where: { id: parseInt(id, 10) },
      data: { isDismissed: true, dismissedAt: now, isRead: true, readAt: now }
    });

    // If it's a delivery confirmation alert, dismiss any duplicate confirmation alerts for the same order as well
    if (alert.orderId && (alert.type === 'DELIVERY_CONFIRMATION' || alert.type === 'CONFIRM_DELIVERY')) {
      await prisma.userAlert.updateMany({
        where: {
          userId: alert.userId,
          orderId: alert.orderId,
          orderType: alert.orderType,
          type: 'DELIVERY_CONFIRMATION',
          isDismissed: false
        },
        data: { isDismissed: true, dismissedAt: now, isRead: true, readAt: now }
      });
    }

    res.json({ success: true, message: 'Alert dismissed' });
  } catch (error) {
    console.error('Error dismissing alert:', error);
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
};

// Endpoint for modal AlertPopup (ONLY urgent actionable alerts, NOT routine notifications)
exports.getMyAlerts = async (req, res) => {
  try {
    const userId = req.admin?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    await ensureUserAlertColumns();
    const candidateAlerts = await prisma.userAlert.findMany({
      where: {
        userId,
        isRead: false,
        isDismissed: false,
        // Only actual actionable alerts belong in the modal popup, regular notifications belong in the bell center
        OR: [
          { type: 'DELIVERY_CONFIRMATION' },
          { isSpecialAlert: true, priority: 'CRITICAL' }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!candidateAlerts || candidateAlerts.length === 0) {
      return res.json([]);
    }

    // Filter candidate alerts: if an order is already DELIVERED or COMPLETED, or if active assignment is no longer pending confirmation,
    // auto-mark the alert as dismissed and do not return it to prevent repeating popups
    const validAlerts = [];
    const now = new Date();

    for (const a of candidateAlerts) {
      if (a.type === 'DELIVERY_CONFIRMATION' && a.orderId) {
        const orderType = (a.orderType || 'sub').toLowerCase();
        let isStillPending = false;
        try {
          if (orderType === 'trial') {
            const trial = await prisma.milkTrial.findUnique({
              where: { id: a.orderId },
              select: { status: true, deliveryStatus: true }
            });
            if (trial && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(trial.status) && trial.deliveryStatus !== 'DELIVERED') {
              const activeAssign = await prisma.deliveryAssignment.findFirst({
                where: {
                  orderType: 'trial',
                  orderId: a.orderId,
                  isActive: true,
                  deliveryStatus: { in: ['DELIVERY_PENDING_CUSTOMER_CONFIRMATION', 'AWAITING_USER_CONFIRMATION', 'ARRIVED'] }
                }
              });
              if (activeAssign) isStillPending = true;
            }
          } else {
            const sub = await prisma.milkSubscription.findUnique({
              where: { id: a.orderId },
              select: { status: true, deliveryStatus: true }
            });
            if (sub && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(sub.status) && sub.deliveryStatus !== 'DELIVERED') {
              const activeAssign = await prisma.deliveryAssignment.findFirst({
                where: {
                  orderType: 'sub',
                  orderId: a.orderId,
                  isActive: true,
                  deliveryStatus: { in: ['DELIVERY_PENDING_CUSTOMER_CONFIRMATION', 'AWAITING_USER_CONFIRMATION', 'ARRIVED'] }
                }
              });
              if (activeAssign) isStillPending = true;
            }
          }
        } catch (checkErr) {
          console.error('[getMyAlerts order status check error]', checkErr);
          isStillPending = true;
        }

        if (isStillPending) {
          validAlerts.push(a);
        } else {
          // Auto-dismiss stale confirmation alert so it never asks again
          await prisma.userAlert.update({
            where: { id: a.id },
            data: { isDismissed: true, dismissedAt: now, isRead: true, readAt: now }
          }).catch(() => {});
        }
      } else {
        validAlerts.push(a);
      }
    }

    res.json(validAlerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};
