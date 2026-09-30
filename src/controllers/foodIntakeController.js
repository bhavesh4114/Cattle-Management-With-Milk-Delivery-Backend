const foodIntakeService = require("../services/foodIntakeService");
const { toNumber } = require("../utils/helpers");

const getFoodIntakeRecords = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const records = await foodIntakeService.getFoodIntakeRecords(adminId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch food intake records" });
  }
};

const createFoodIntakeRecord = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const record = await foodIntakeService.createFoodIntakeRecord(req.body, adminId);
    res.status(201).json(record);
  } catch (error) {
    console.error("Failed to add food intake:", error);
    res.status(500).json({ message: "Failed to save food intake record" });
  }
};

const updateFoodIntakeRecord = async (req, res) => {
  try {
    const id = toNumber(req.params.id);
    const adminId = req.admin.id;
    if (!id) return res.status(400).json({ message: "Invalid record ID" });
    const record = await foodIntakeService.updateFoodIntakeRecord(id, req.body, adminId);
    res.json(record);
  } catch (error) {
    console.error("Update food intake failed:", error);
    res.status(500).json({ message: "Failed to update food intake record" });
  }
};

const deleteFoodIntakeRecord = async (req, res) => {
  try {
    const id = toNumber(req.params.id);
    const adminId = req.admin.id;
    if (!id) return res.status(400).json({ message: "Invalid record ID" });
    await foodIntakeService.deleteFoodIntakeRecord(id, adminId);
    res.json({ message: "Food intake record deleted successfully" });
  } catch (error) {
    console.error("Delete food intake failed:", error);
    res.status(500).json({ message: "Failed to delete food intake record" });
  }
};

module.exports = {
  getFoodIntakeRecords,
  createFoodIntakeRecord,
  updateFoodIntakeRecord,
  deleteFoodIntakeRecord
};
