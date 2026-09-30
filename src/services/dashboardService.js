const prisma = require("../config/db");

const getDashboardStats = async (adminId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalCows, cowCount, buffaloCount, milkToday, lowStock, activeTreatments] = await Promise.all([
    prisma.cow.count({ where: { status: "Active", adminId } }),
    prisma.cow.count({ where: { status: "Active", adminId, animalType: "Cow" } }),
    prisma.cow.count({ where: { status: "Active", adminId, animalType: "Buffalo" } }),
    prisma.milkRecord.aggregate({
      _sum: { totalMilk: true },
      where: { recordDate: { gte: today }, adminId },
    }),
    prisma.item.count({ where: { adminId } }),
    prisma.treatment.count({ where: { adminId } }),
  ]);

  return {
    totalCows,
    cowCount,
    buffaloCount,
    milkToday: milkToday._sum.totalMilk || 0,
    lowStock,
    activeTreatments,
  };
};

module.exports = {
  getDashboardStats,
};
