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
router.put('/assignment/:assignmentId/reschedule', dc.rescheduleDelivery);
router.put('/reschedule/:orderType/:orderId', dc.rescheduleByOrder);

// Delivery Boy Dashboard
router.get('/my-deliveries', dc.getMyDeliveries);
router.put('/status/:assignmentId', dc.updateDeliveryStatus);
router.get('/my-notifications', dc.getMyNotifications);

// Order Tracking (User side)
router.get('/track', dc.getOrderTrackingStatus);

// Door QR + user confirmation
router.post('/generate-daily-qr', dc.generateDailyDeliveries);
router.post('/scan-qr', dc.scanQRCode);
router.post('/:orderId/request-confirmation', dc.requestDeliveryConfirmation);
router.post('/:orderId/confirm', dc.confirmDelivery);
router.post('/:orderId/report-issue', dc.reportDeliveryIssue);
router.get('/:orderId/history', dc.getDeliveryHistory);

// Leave Management (Delivery Boy)
router.post('/leaves', dc.applyLeave);
router.get('/my-leaves', dc.getMyLeaves);
router.patch('/leaves/:id/cancel', dc.cancelLeave);

// Leave Management (Admin)
router.get('/admin/leaves', dc.getAllLeaves);
router.get('/admin/leaves/:id/affected-deliveries', dc.getAffectedDeliveries);
router.post('/admin/leaves/:id/approve-and-assign', dc.approveAndAssign);
router.patch('/admin/leaves/:id/approve', dc.approveLeave);
router.patch('/admin/leaves/:id/reject', dc.rejectLeave);

// Reassignment Queue (Admin)
router.get('/admin/reassignments', dc.getReassignmentQueue);
router.patch('/admin/reassign/:assignmentId', dc.manualReassign);

module.exports = router;
