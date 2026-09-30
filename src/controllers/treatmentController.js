const treatmentService = require("../services/treatmentService");
const { toNumber } = require("../utils/helpers");

const getTreatments = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const treatments = await treatmentService.getTreatments(adminId);
    res.json(treatments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch treatments" });
  }
};

const createTreatment = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const treatment = await treatmentService.createTreatment(req.body, adminId);
    res.status(201).json(treatment);
  } catch (error) {
    res.status(500).json({ message: "Failed to create treatment record" });
  }
};

const updateTreatment = async (req, res) => {
  try {
    const id = toNumber(req.params.id);
    const adminId = req.admin.id;
    if (!id) return res.status(400).json({ message: "Invalid record ID" });
    const treatment = await treatmentService.updateTreatment(id, req.body, adminId);
    res.json(treatment);
  } catch (error) {
    res.status(500).json({ message: "Failed to update treatment record" });
  }
};

const deleteTreatment = async (req, res) => {
  try {
    const id = toNumber(req.params.id);
    const adminId = req.admin.id;
    if (!id) return res.status(400).json({ message: "Invalid record ID" });
    
    await treatmentService.deleteTreatment(id, adminId);
    res.json({ message: "Treatment record deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete treatment record" });
  }
};

module.exports = {
  getTreatments,
  createTreatment,
  updateTreatment,
  deleteTreatment
};
