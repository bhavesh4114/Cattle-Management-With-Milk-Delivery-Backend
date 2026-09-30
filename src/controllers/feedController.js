const feedService = require("../services/feedService");

const getCowFoodRecords = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const records = await feedService.getCowFoodRecords(adminId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch cow food records" });
  }
};

const createCowFoodRecord = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const record = await feedService.createCowFoodRecord(req.body, adminId);
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: "Failed to save cow food record" });
  }
};

const getFeedingPlans = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const plans = await feedService.getFeedingPlans(adminId);
    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch feeding plans" });
  }
};

const createFeedingPlan = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const plan = await feedService.createFeedingPlan(req.body, adminId);
    res.status(201).json(plan);
  } catch (error) {
    res.status(500).json({ message: "Failed to save feeding plan" });
  }
};

module.exports = {
  getCowFoodRecords,
  createCowFoodRecord,
  getFeedingPlans,
  createFeedingPlan,
};
