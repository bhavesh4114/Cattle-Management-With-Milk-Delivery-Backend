const express = require("express");
const milkController = require("../controllers/milkController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/daily", requirePermission("milk", "view"), milkController.getDailyMilk);
router.post("/daily", requirePermission("milk", "add"), milkController.saveDailyMilk);
router.get("/feed-plan", requirePermission("milk", "view"), milkController.getFeedPlan);
router.get("/:id", requirePermission("milk", "view"), milkController.getMilkRecordById);
router.put("/:id", requirePermission("milk", "edit"), milkController.updateMilkRecord);
router.delete("/:id", requirePermission("milk", "delete"), milkController.deleteMilkRecord);

module.exports = router;
