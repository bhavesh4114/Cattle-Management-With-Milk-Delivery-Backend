const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { authenticateAdmin } = require('../middleware/auth');

router.get('/pending-payments', authenticateAdmin, alertController.getPendingPaymentUsers);
router.post('/send', authenticateAdmin, alertController.sendAlerts);
router.get('/my-alerts', authenticateAdmin, alertController.getMyAlerts);
router.put('/:id/read', authenticateAdmin, alertController.markAsRead);

module.exports = router;
