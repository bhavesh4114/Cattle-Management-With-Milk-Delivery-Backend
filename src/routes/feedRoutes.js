const express = require("express");
const feedController = require("../controllers/feedController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/cow-food", requirePermission("feed", "view"), feedController.getCowFoodRecords);
router.post("/cow-food", requirePermission("feed", "add"), feedController.createCowFoodRecord);

router.get("/feeding-plans", requirePermission("feed", "view"), feedController.getFeedingPlans);
router.post("/feeding-plans", requirePermission("feed", "add"), feedController.createFeedingPlan);

module.exports = router;
