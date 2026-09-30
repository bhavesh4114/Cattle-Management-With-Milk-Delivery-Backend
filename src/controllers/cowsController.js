const cowsService = require("../services/cowsService");
const { toNumber } = require("../utils/helpers");

const getCows = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const cows = await cowsService.getCows(adminId);
    res.json(cows);
  } catch (error) {
    console.error("Cow list failed:", error);
    res.status(500).json({ message: "Unable to load cows" });
  }
};

const getCowHistory = async (req, res) => {
  try {
    const cowId = toNumber(req.params.cowId);
    const adminId = req.admin.id;
    if (!cowId) return res.status(400).json({ message: "Valid cow ID required" });

    const cow = await cowsService.getCowHistory(cowId, adminId);
    if (!cow) return res.status(404).json({ message: "Animal not found" });

    res.json(cow);
  } catch (error) {
    console.error("Cow history fetch failed:", error);
    res.status(500).json({ message: "Unable to load cow history" });
  }
};

const getNextRegNo = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const nextRegNo = await cowsService.getNextRegNo(adminId);
    res.json({ nextRegNo });
  } catch (error) {
    res.status(500).json({ message: "Unable to generate next Reg No" });
  }
};

const sellCow = async (req, res) => {
  try {
    const cowId = toNumber(req.params.cowId);
    const adminId = req.admin.id;
    if (!cowId) return res.status(400).json({ message: "Valid cow ID required" });

    const sale = await cowsService.sellCow(cowId, req.body, adminId);
    res.status(201).json({ message: "Sale recorded successfully", sale });
  } catch (error) {
    console.error("Cow sell failed:", error);
    res.status(400).json({ message: error.message || "Unable to process cow sale" });
  }
};

const createCow = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const cow = await cowsService.createCow(req.body, adminId);
    res.status(201).json(cow);
  } catch (error) {
    console.error("Cow creation error:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: "An animal with this Tag No or Reg No already exists." });
    }
    res.status(400).json({ message: "Unable to save cow record: " + (error.message || "") });
  }
};

const updateCow = async (req, res) => {
  try {
    const cowId = toNumber(req.params.cowId);
    const adminId = req.admin.id;
    if (!cowId) return res.status(400).json({ message: "Please select a valid animal" });

    const cow = await cowsService.updateCow(cowId, req.body, adminId);
    res.json(cow);
  } catch (error) {
    console.error("Cow update failed:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: "An animal with this Tag No or Reg No already exists." });
    }
    res.status(400).json({ message: "Unable to update cow record" });
  }
};

const deleteCow = async (req, res) => {
  try {
    const cowId = toNumber(req.params.cowId);
    const adminId = req.admin.id;
    if (!cowId) return res.status(400).json({ message: "Please select a valid animal" });

    await cowsService.deleteCow(cowId, adminId);
    res.json({ message: "Cow deleted successfully" });
  } catch (error) {
    console.error("Cow delete failed:", error);
    res.status(400).json({ message: error.message || "Unable to delete cow record" });
  }
};

const createReproduction = async (req, res) => {
  try {
    const cowId = toNumber(req.params.cowId);
    const adminId = req.admin.id;
    if (!cowId) return res.status(400).json({ message: "Please select a valid animal" });

    const record = await cowsService.createReproduction(cowId, req.body, adminId);
    res.status(201).json(record);
  } catch (error) {
    console.error("Reproduction record save failed:", error);
    res.status(400).json({ message: error.message || "Unable to save reproduction record" });
  }
};

const updateReproduction = async (req, res) => {
  try {
    const cowId = toNumber(req.params.cowId);
    const recordId = toNumber(req.params.recordId);
    const adminId = req.admin.id;
    if (!cowId || !recordId) return res.status(400).json({ message: "Invalid request parameters" });

    const record = await cowsService.updateReproduction(recordId, req.body, adminId);
    res.json(record);
  } catch (error) {
    console.error("Reproduction record update failed:", error);
    res.status(400).json({ message: "Unable to update reproduction record" });
  }
};

const deleteReproduction = async (req, res) => {
  try {
    const recordId = toNumber(req.params.recordId);
    const adminId = req.admin.id;
    if (!recordId) return res.status(400).json({ message: "Invalid record ID" });

    await cowsService.deleteReproduction(recordId, adminId);
    res.json({ message: "Record deleted successfully" });
  } catch (error) {
    console.error("Reproduction record delete failed:", error);
    res.status(400).json({ message: "Unable to delete reproduction record" });
  }
};

module.exports = {
  getCows,
  getNextRegNo,
  sellCow,
  createCow,
  updateCow,
  deleteCow,
  createReproduction,
  updateReproduction,
  deleteReproduction,
  getCowHistory
};
