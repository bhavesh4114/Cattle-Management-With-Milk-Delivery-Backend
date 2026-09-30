const deathService = require("../services/deathService");

const getDeaths = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const deaths = await deathService.getDeaths(adminId);
    res.json(deaths);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dead cows" });
  }
};

const createDeath = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const death = await deathService.createDeath(req.body, adminId);
    res.status(201).json(death);
  } catch (error) {
    res.status(500).json({ message: "Failed to record cow death" });
  }
};

const deleteDeath = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Invalid request" });
    
    await deathService.deleteDeath(Number(id), adminId);
    res.json({ message: "Death record deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to delete cow death record" });
  }
};

module.exports = {
  getDeaths,
  createDeath,
  deleteDeath

};
