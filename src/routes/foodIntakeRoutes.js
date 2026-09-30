const express = require("express");
const foodIntakeController = require("../controllers/foodIntakeController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/", requirePermission("intake", "view"), foodIntakeController.getFoodIntakeRecords);
router.post("/", requirePermission("intake", "add"), foodIntakeController.createFoodIntakeRecord);
router.put("/:id", requirePermission("intake", "edit"), foodIntakeController.updateFoodIntakeRecord);
router.delete("/:id", requirePermission("intake", "delete"), foodIntakeController.deleteFoodIntakeRecord);

module.exports = router;
