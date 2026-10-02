const prisma = require('../config/db');

// Get users with pending payments
exports.getPendingPaymentUsers = async (req, res) => {
  try {
    // Find subscriptions with AWAITING_PAYMENT or AWAITING_CUSTOMER status
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

    // We can also check trials if trials have AWAITING_PAYMENT, but currently trials are just PENDING_ADMIN -> ACTIVE, wait, do trials have payment? Let's check status fields later if needed. For now subscriptions are the main ones with AWAITING_PAYMENT.
    
    // Group by user
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

// Send alert to users
exports.sendAlerts = async (req, res) => {
  try {
    const { userIds, message } = req.body;
    
    if (!userIds || userIds.length === 0 || !message) {
      return res.status(400).json({ error: 'Missing userIds or message' });
    }

    const alerts = userIds
      .filter(id => id != null)
      .map(userId => ({
        userId: parseInt(userId, 10),
        message
      }));

    if (alerts.length > 0) {
      await prisma.userAlert.createMany({
        data: alerts
      });
    }

    res.json({ success: true, message: 'Alerts sent successfully' });
  } catch (error) {
    console.error('Error sending alerts:', error);
    require('fs').appendFileSync('error.log', '\\nALERT ERROR: ' + error.stack);
    res.status(500).json({ error: 'Failed to send alerts', details: error.message, stack: error.stack });
  }
};

// Get my alerts (for user)
exports.getMyAlerts = async (req, res) => {
  try {
    const userId = (req.admin && req.admin.id) ? req.admin.id : (req.user && req.user.id ? req.user.id : null);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const alerts = await prisma.userAlert.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' }
    });
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

// Mark alert as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.userAlert.update({
      where: { id: parseInt(id) },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
};
