const express = require("express");
const orderController = require("../controllers/orderController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/", requirePermission("orders", "view"), orderController.getOrders);
router.post("/", requirePermission("orders", "add"), orderController.createOrder);
router.put("/:id", requirePermission("orders", "edit"), orderController.updateOrder);
router.delete("/:id", requirePermission("orders", "delete"), orderController.deleteOrder);

module.exports = router;
