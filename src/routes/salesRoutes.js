const express = require("express");
const salesController = require("../controllers/salesController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/sales", requirePermission("sales", "view"), salesController.getSales);
router.post("/sales", requirePermission("sales", "add"), salesController.createSale);
router.get("/sold-cows", requirePermission("sales", "view"), salesController.getSoldCows);
router.delete("/sold-cows/:id", requirePermission("sales", "delete"), salesController.deleteSale);

module.exports = router;
