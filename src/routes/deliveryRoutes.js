const express = require('express');
const router = express.Router();
const dc = require('../controllers/deliveryController');
const { authenticateAdmin } = require('../middleware/auth');

router.use(authenticateAdmin);

// Delivery Boy Profile (Admin manages all, delivery boy manages own)
router.get('/boys', dc.getAllDeliveryBoys);
router.get('/boys/my-profile', dc.getMyProfile);
router.post('/boys/:targetAdminId/profile', dc.upsertDeliveryBoyProfile);
router.post('/boys/my-profile', dc.upsertDeliveryBoyProfile);

// Availability
router.post('/boys/:targetAdminId/availability', dc.setAvailability);
router.post('/boys/my-availability', dc.setAvailability);
router.get('/boys/:targetAdminId/availability', dc.getAvailability);
router.get('/boys/my-availability', dc.getAvailability);

// Suggestions & Assignment (Admin)
router.get('/suggest/:orderType/:orderId', dc.getSuggestedDeliveryBoys);
router.post('/assign/:orderType/:orderId', dc.assignDelivery);
router.get('/history/:orderType/:orderId', dc.getAssignmentHistory);

// Delivery Boy Dashboard
router.get('/my-deliveries', dc.getMyDeliveries);
router.put('/status/:assignmentId', dc.updateDeliveryStatus);
router.get('/my-notifications', dc.getMyNotifications);

// Order Tracking (User side)
router.get('/track', dc.getOrderTrackingStatus);
router.get('/otp-info', dc.getTodayDeliveryOTP);

// Security: QR and OTP
router.post('/generate-daily-qr', dc.generateDailyDeliveries);
router.post('/scan-qr', dc.scanQRCode);
router.post('/verify-otp', dc.verifyDeliveryOTP);

module.exports = router;
