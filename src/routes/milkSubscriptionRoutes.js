const express = require('express');
const router = express.Router();
const milkSubscriptionController = require('../controllers/milkSubscriptionController');
const { authenticateAdmin } = require('../middleware/auth');

// Delivery Boy Routes
router.get('/delivery-boys', authenticateAdmin, milkSubscriptionController.getDeliveryBoys);
router.post('/assign-delivery/:type/:id', authenticateAdmin, milkSubscriptionController.assignDelivery);
router.get('/my-deliveries', authenticateAdmin, milkSubscriptionController.getMyDeliveries);
router.put('/delivery-status/:type/:id', authenticateAdmin, milkSubscriptionController.updateDeliveryStatus);

// Dashboard Routes
router.get('/dashboard/stats', authenticateAdmin, milkSubscriptionController.getDashboardStats);

// Pricing Routes
router.get('/pricing/price-list', authenticateAdmin, milkSubscriptionController.getMilkPrices);
router.post('/pricing/update', authenticateAdmin, milkSubscriptionController.updateMilkPrice);

// Trial Routes
router.post('/trial/submit-request', authenticateAdmin, milkSubscriptionController.requestTrial);
router.get('/trial/all-trials', authenticateAdmin, milkSubscriptionController.getAllTrials);
router.get('/trial/my-trials', authenticateAdmin, milkSubscriptionController.getMyTrials);
router.put('/trial/:id/status', authenticateAdmin, milkSubscriptionController.updateTrialStatus);
router.delete('/trial/:id', authenticateAdmin, milkSubscriptionController.deleteTrial);
router.put('/trial/:id', authenticateAdmin, milkSubscriptionController.editTrial);

// Subscription Routes
router.post('/subscription/submit-request', authenticateAdmin, milkSubscriptionController.requestSubscription);
router.get('/subscription/all-subscriptions', authenticateAdmin, milkSubscriptionController.getAllSubscriptions);
router.get('/subscription/my-subscriptions', authenticateAdmin, milkSubscriptionController.getMySubscriptions);
router.post('/subscription/:id/admin-offer', authenticateAdmin, milkSubscriptionController.adminOfferSubscription);
router.post('/subscription/:id/user-respond', authenticateAdmin, milkSubscriptionController.customerRespondSubscription);
router.delete('/subscription/:id', authenticateAdmin, milkSubscriptionController.deleteSubscription);
router.put('/subscription/:id', authenticateAdmin, milkSubscriptionController.editSubscription);

// Payment Routes
router.post('/subscription/:id/pay', authenticateAdmin, milkSubscriptionController.paySubscription);
router.post('/subscription/verify-payment', authenticateAdmin, milkSubscriptionController.verifyPayment);

module.exports = router;
