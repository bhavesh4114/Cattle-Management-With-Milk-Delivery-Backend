const express = require("express");
const reportController = require("../controllers/reportController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/", requirePermission("reports", "view"), reportController.getReports);

module.exports = router;
