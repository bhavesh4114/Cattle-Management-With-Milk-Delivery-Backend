const salesService = require("../services/salesService");

const getSales = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const records = await salesService.getSales(adminId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sales" });
  }
};

const createSale = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const record = await salesService.createSale(req.body, adminId);
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: "Failed to create sale" });
  }
};

const getSoldCows = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const soldCows = await salesService.getSoldCows(adminId);
    res.json(soldCows);
  } catch (error) {
    console.error("Sold cow list failed:", error);
    res.status(500).json({ message: "Unable to load sold cows" });
  }
};

const deleteSale = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const saleId = req.params.id;
    await salesService.deleteSale(saleId, adminId);
    res.json({ success: true, message: "Sale deleted and cow restored" });
  } catch (error) {
    console.error("Delete sale failed:", error);
    res.status(500).json({ message: "Failed to delete sale record" });
  }
};

module.exports = {
  getSales,
  createSale,
  getSoldCows,
  deleteSale
};
