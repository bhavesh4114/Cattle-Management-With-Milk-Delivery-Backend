const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { authenticateAdmin } = require('../middleware/auth');

// Public auto-migration trigger for live environment
router.get('/migrate-db', alertController.runAutoMigration);

router.use(authenticateAdmin);

// Admin-only payment reminder
router.get('/pending-payments', alertController.getPendingPaymentUsers);
router.post('/send', alertController.sendAlerts);

// Notification Center & Special Alerts (Role-based for authenticated user)
router.get('/notifications', alertController.getNotifications);
router.get('/special-alerts', alertController.getSpecialAlerts);
router.get('/unread-count', alertController.getUnreadCount);
router.put('/mark-all-read', alertController.markAllAsRead);
router.put('/:id/read', alertController.markAsRead);
router.put('/:id/dismiss', alertController.dismissSpecialAlert);

// Backward-compatible endpoint for existing AlertPopup.jsx
router.get('/my-alerts', alertController.getMyAlerts);

module.exports = router;
