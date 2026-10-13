const express = require("express");
const router = express.Router();
const referralController = require("../controllers/referralController");
const { authenticateAdmin } = require("../middleware/auth");

// Public / Pre-registration validation
router.post("/validate", referralController.validateReferralCode);

// Authenticated User Stats & Info
router.get("/my-stats", authenticateAdmin, referralController.getUserReferralStats);

// Admin Referral Policy Settings & Reporting
router.get("/settings", authenticateAdmin, referralController.getSettings);
router.put("/settings", authenticateAdmin, referralController.updateSettings);
router.get("/list", authenticateAdmin, referralController.getAllReferrals);

module.exports = router;
