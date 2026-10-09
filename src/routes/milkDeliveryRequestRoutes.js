const express = require("express");
const router = express.Router();
const controller = require("../controllers/milkDeliveryRequestController");
const { authenticateAdmin } = require("../middleware/auth");

router.use(authenticateAdmin);

// Customer endpoints
router.get("/customer-context", controller.getCustomerContext);
router.post("/", controller.createRequest);
router.get("/my", controller.getMyRequests);
router.put("/:id", controller.updateRequest);
router.delete("/:id", controller.cancelRequest);
router.patch("/:id/cancel", controller.cancelRequest);
router.patch("/:id/customer-respond", controller.customerRespondToOffer);

// Admin endpoints
router.get("/", controller.getAllRequests);
router.get("/pending", controller.getPendingRequests);
router.patch("/:id/offer", controller.offerAvailableQuantity);
router.patch("/:id/assign-delivery-boy", controller.assignDeliveryBoy);
router.patch("/:id/approve", controller.approveRequest);
router.patch("/:id/reject", controller.rejectRequest);

module.exports = router;
