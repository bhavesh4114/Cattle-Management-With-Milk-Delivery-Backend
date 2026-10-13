const referralService = require("../services/referralService");

const validateReferralCode = async (req, res) => {
  try {
    const { code } = req.body;
    const currentUserId = req.admin?.id || null;
    const result = await referralService.validateReferralCode(code, currentUserId);
    if (!result.valid) {
      return res.status(400).json({ valid: false, message: result.message });
    }
    return res.json({
      valid: true,
      referrer: {
        id: result.referrer.id,
        name: result.referrer.name,
      },
    });
  } catch (error) {
    console.error("[referralController.validateReferralCode]", error);
    return res.status(500).json({ valid: false, message: error.message || "Validation failed" });
  }
};

const getSettings = async (req, res) => {
  try {
    const settings = await referralService.getReferralSettings();
    return res.json(settings);
  } catch (error) {
    console.error("[referralController.getSettings]", error);
    return res.status(500).json({ message: error.message || "Failed to load settings" });
  }
};

const updateSettings = async (req, res) => {
  try {
    const updated = await referralService.updateReferralSettings(req.body);
    return res.json({
      message: "Referral policy settings saved successfully!",
      settings: updated,
    });
  } catch (error) {
    console.error("[referralController.updateSettings]", error);
    return res.status(500).json({ message: error.message || "Failed to update settings" });
  }
};

const getAllReferrals = async (req, res) => {
  try {
    const search = req.query.search || "";
    const data = await referralService.getAllReferrals(search);
    return res.json(data);
  } catch (error) {
    console.error("[referralController.getAllReferrals]", error);
    return res.status(500).json({ message: error.message || "Failed to load referrals" });
  }
};

const getUserReferralStats = async (req, res) => {
  try {
    const userId = req.admin.id;
    const stats = await referralService.getUserReferralInfo(userId);
    return res.json(stats);
  } catch (error) {
    console.error("[referralController.getUserReferralStats]", error);
    return res.status(500).json({ message: error.message || "Failed to load user referral stats" });
  }
};

module.exports = {
  validateReferralCode,
  getSettings,
  updateSettings,
  getAllReferrals,
  getUserReferralStats,
};
