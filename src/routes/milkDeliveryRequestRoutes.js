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

// Admin endpoints
router.get("/", controller.getAllRequests);
router.get("/pending", controller.getPendingRequests);
router.patch("/:id/approve", controller.approveRequest);
router.patch("/:id/reject", controller.rejectRequest);

module.exports = router;
