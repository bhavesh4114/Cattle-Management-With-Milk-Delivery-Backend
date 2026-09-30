const dashboardService = require("../services/dashboardService");

const getDashboardStats = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const stats = await dashboardService.getDashboardStats(adminId);
    res.json({ stats });
  } catch (error) {
    console.error("Dashboard load failed:", error);
    res.status(500).json({ message: "Unable to load dashboard" });
  }
};

module.exports = {
  getDashboardStats,
};
