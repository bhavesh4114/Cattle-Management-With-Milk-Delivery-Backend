const express = require('express');
const router = express.Router();
const staffMilkController = require('../controllers/staffMilkController');
const { authenticateAdmin } = require('../middleware/auth');

router.use(authenticateAdmin); // Ensure all routes are protected

// Get milk allocations for the logged-in staff member
router.get('/my-allocations', staffMilkController.getMyAllocations);

// Submit a processing report
router.post('/submit-report', staffMilkController.submitReport);

// Get today's total milk added by Admin (for staff auto-allocation)
router.get('/today-total', staffMilkController.getTodayTotalMilk);

router.get('/reports', staffMilkController.getAllReports);
router.get('/my-reports', staffMilkController.getMyReports);
router.put('/approve-report/:id', staffMilkController.approveReport);
router.put('/reject-report/:id', staffMilkController.rejectReport);

// Customer Milk Orders
router.post('/create-customer-order', staffMilkController.submitCustomerOrder);
router.get('/customer-orders-history', staffMilkController.getMyCustomerOrders);
router.get('/all-customer-orders', staffMilkController.getAllCustomerOrders);

// Admin Order Actions
router.put('/update-customer-order/:id/status', staffMilkController.updateCustomerOrderStatus); // generic fallback
router.post('/customer-orders/:id/accept', staffMilkController.acceptOrder);
router.post('/customer-orders/:id/reject', staffMilkController.rejectOrder);
router.post('/customer-orders/:id/propose-alternative', staffMilkController.proposeAlternative);
router.post('/customer-orders/:id/dispatch', staffMilkController.dispatchOrder);

// Customer Order Actions
router.post('/customer-orders/:id/respond', staffMilkController.respondToAlternative);
router.post('/customer-orders/:id/cancel', staffMilkController.cancelOrder);

module.exports = router;

