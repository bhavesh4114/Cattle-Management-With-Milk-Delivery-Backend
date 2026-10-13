const express = require("express");
const router = express.Router();
const couponController = require("../controllers/couponController");
const { authenticateAdmin, optionalAuthenticateAdmin } = require("../middleware/auth");

// Public / Order checkout routes
router.get("/active", couponController.getActiveCoupons);
router.post("/validate", optionalAuthenticateAdmin, couponController.validateCoupon);
router.post("/redeem", authenticateAdmin, couponController.redeemCoupon);

// User personal coupons (auth optional/required)
router.get("/my-coupons", authenticateAdmin, couponController.getMyCoupons);

// Admin Coupon Management
router.get("/", authenticateAdmin, couponController.getAllCoupons);
router.post("/", authenticateAdmin, couponController.createCoupon);
router.put("/:id", authenticateAdmin, couponController.updateCoupon);
router.delete("/:id", authenticateAdmin, couponController.deleteCoupon);

module.exports = router;
