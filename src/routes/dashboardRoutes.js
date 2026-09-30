const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticateAdmin, dashboardController.getDashboardStats);

module.exports = router;
