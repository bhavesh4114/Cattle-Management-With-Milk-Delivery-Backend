const milkService = require("../services/milkService");

const getDailyMilk = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "Date is required" });
    const adminId = req.admin.id;
    const records = await milkService.getDailyMilk(date, adminId);
    res.json(records);
  } catch (error) {
    console.error("Fetch milk daily failed:", error);
    res.status(500).json({ message: "Failed to fetch milk records" });
  }
};

const getFeedPlan = async (req, res) => {
  try {
    const { date, animalType } = req.query;
    if (!date) return res.status(400).json({ message: "Date is required" });
    const adminId = req.admin.id;
    const formattedPlans = await milkService.getFeedPlan(date, animalType, adminId);
    res.json(formattedPlans);
  } catch (error) {
    console.error("Fetch feed plan failed:", error);
    res.status(500).json({ message: "Failed to fetch feed plans" });
  }
};

const saveDailyMilk = async (req, res) => {
  try {
    const { date, entries } = req.body;
    if (!date || !Array.isArray(entries)) {
      return res.status(400).json({ message: "Invalid payload" });
    }
    const adminId = req.admin.id;
    await milkService.saveDailyMilk(date, entries, adminId);
    res.status(200).json({ message: "Records and Feed Plans updated successfully" });
  } catch (error) {
    console.error("Save milk daily failed:", error);
    res.status(500).json({ message: "Failed to save milk records" });
  }
};

const getMilkRecordById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: "Invalid record ID" });
    const adminId = req.admin.id;
    const record = await milkService.getMilkRecordById(id, adminId);
    if (!record) return res.status(404).json({ message: "Record not found" });
    
    res.json(record);
  } catch (error) {
    console.error("Fetch milk record failed:", error);
    res.status(500).json({ message: "Failed to fetch milk record" });
  }
};

const updateMilkRecord = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: "Invalid record ID" });
    const adminId = req.admin.id;
    const updated = await milkService.updateMilkRecord(id, req.body, adminId);
    res.json(updated);
  } catch (error) {
    console.error("Update milk record failed:", error);
    res.status(500).json({ message: "Failed to update milk record" });
  }
};

const deleteMilkRecord = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: "Invalid record ID" });
    const adminId = req.admin.id;
    await milkService.deleteMilkRecord(id, adminId);
    res.json({ message: "Milk record deleted successfully" });
  } catch (error) {
    console.error("Delete milk record failed:", error);
    res.status(500).json({ message: "Failed to delete milk record" });
  }
};

module.exports = {
  getDailyMilk,
  getFeedPlan,
  saveDailyMilk,
  getMilkRecordById,
  updateMilkRecord,
  deleteMilkRecord
};
