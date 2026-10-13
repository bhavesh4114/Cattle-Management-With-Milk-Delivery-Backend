const couponService = require("../services/couponService");

const getAllCoupons = async (req, res) => {
  try {
    const list = await couponService.getAllCoupons();
    return res.json(list);
  } catch (error) {
    console.error("[couponController.getAllCoupons]", error);
    return res.status(500).json({ message: error.message || "Failed to fetch coupons" });
  }
};

const getActiveCoupons = async (req, res) => {
  try {
    const list = await couponService.getActiveCoupons();
    return res.json(list);
  } catch (error) {
    console.error("[couponController.getActiveCoupons]", error);
    return res.status(500).json({ message: error.message || "Failed to fetch active coupons" });
  }
};

const createCoupon = async (req, res) => {
  try {
    const created = await couponService.createCoupon(req.body);
    return res.status(201).json({
      message: "Coupon created successfully!",
      coupon: created,
    });
  } catch (error) {
    console.error("[couponController.createCoupon]", error);
    return res.status(400).json({ message: error.message || "Failed to create coupon" });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const updated = await couponService.updateCoupon(req.params.id, req.body);
    return res.json({
      message: "Coupon updated successfully!",
      coupon: updated,
    });
  } catch (error) {
    console.error("[couponController.updateCoupon]", error);
    return res.status(400).json({ message: error.message || "Failed to update coupon" });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    await couponService.deleteCoupon(req.params.id);
    return res.json({ message: "Coupon deleted successfully!" });
  } catch (error) {
    console.error("[couponController.deleteCoupon]", error);
    return res.status(400).json({ message: error.message || "Failed to delete coupon" });
  }
};

const getMyCoupons = async (req, res) => {
  try {
    const userId = req.admin.id;
    const list = await couponService.getMyCoupons(userId);
    return res.json(list);
  } catch (error) {
    console.error("[couponController.getMyCoupons]", error);
    return res.status(500).json({ message: error.message || "Failed to fetch your coupons" });
  }
};

const validateCoupon = async (req, res) => {
  try {
    const { code, orderTotal, productName } = req.body;
    const userId = req.admin?.id || null;
    const result = await couponService.validateCouponForOrder({
      code,
      userId,
      orderTotal: parseFloat(orderTotal) || 0,
      productName,
    });

    if (!result.valid) {
      return res.status(400).json({ valid: false, message: result.message });
    }

    return res.json(result);
  } catch (error) {
    console.error("[couponController.validateCoupon]", error);
    return res.status(500).json({ valid: false, message: error.message || "Validation failed" });
  }
};

const redeemCoupon = async (req, res) => {
  try {
    const { code, orderId } = req.body;
    const userId = req.admin?.id || null;
    const result = await couponService.redeemCoupon({
      code,
      userId,
      orderId,
    });
    return res.json({ message: "Coupon redeemed successfully", coupon: result });
  } catch (error) {
    console.error("[couponController.redeemCoupon]", error);
    return res.status(500).json({ message: error.message || "Failed to redeem coupon" });
  }
};

module.exports = {
  getAllCoupons,
  getActiveCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getMyCoupons,
  validateCoupon,
  redeemCoupon,
};
