const stockAdjustmentService = require("../services/stockAdjustmentService");

const getAdjustments = async (req, res) => {
  try {
    const { startDate, endDate, itemId } = req.query;
    const adminId = req.admin.id;
    const result = await stockAdjustmentService.getAdjustments(startDate, endDate, adminId, itemId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch stock adjustments", error: error.message });
  }
};

const createAdjustment = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const adjustment = await stockAdjustmentService.createAdjustment(req.body, adminId);
    res.status(201).json(adjustment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getAdjustments,
  createAdjustment
};
