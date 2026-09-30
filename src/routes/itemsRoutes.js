const express = require("express");
const itemsController = require("../controllers/itemsController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const stockAdjustmentController = require("../controllers/stockAdjustmentController");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/stock-adjustments", requirePermission("stock", "view"), stockAdjustmentController.getAdjustments);
router.post("/stock-adjustments", requirePermission("stock", "add"), stockAdjustmentController.createAdjustment);

router.get("/items", requirePermission("items", "view"), itemsController.getItems);
router.post("/items", requirePermission("items", "add"), itemsController.createItem);
router.put("/items/:id", requirePermission("items", "edit"), itemsController.updateItem);
router.delete("/items/:id", requirePermission("items", "delete"), itemsController.deleteItem);

router.get("/food-purchases", requirePermission("items", "view"), itemsController.getFoodPurchases);
router.post("/food-purchases", requirePermission("items", "add"), itemsController.createFoodPurchase);

module.exports = router;
