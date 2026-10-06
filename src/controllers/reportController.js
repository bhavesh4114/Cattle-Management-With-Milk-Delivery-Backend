const reportService = require("../services/reportService");
const prisma = require("../config/db");

const getReports = async (req, res) => {
  try {
    const { type, from, to, cowId } = req.query;
    if (!type || !from || !to) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    const startDate = new Date(from);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setUTCHours(23, 59, 59, 999);

    const adminId = req.admin.id;
    const userAccount = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { customRole: true }
    });
    const roleName = (userAccount?.customRole?.name || "").toLowerCase();
    const isUser = userAccount?.role === "CUSTOM" && (roleName.includes("user") || (userAccount?.name || "").toLowerCase().includes("user"));

    let cowCondition = { adminId };
    if (cowId && cowId !== "all") {
      const cow = await prisma.cow.findFirst({ where: { name: cowId, adminId } });
      if (cow) {
        cowCondition.cowId = cow.id;
      }
    }

    const report = await reportService.generateReport(type, startDate, endDate, cowCondition, adminId, isUser);
    res.json(report);
  } catch (error) {
    if (error.message === "Invalid report type") {
      res.status(400).json({ message: error.message });
    } else {
      console.error("Report generation failed:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  }
};

module.exports = {
  getReports,
};
