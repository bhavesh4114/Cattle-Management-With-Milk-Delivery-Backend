const prisma = require("../config/db");
const { toNumber, toDate } = require("../utils/helpers");

const getCowFoodRecords = async (adminId) => {
  return prisma.cowFoodRecord.findMany({
    where: { adminId },
    include: { cow: true },
    orderBy: { fedAt: "desc" },
  });
};

const createCowFoodRecord = async (data, adminId) => {
  const cowId = toNumber(data.cowId);
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");

  return prisma.cowFoodRecord.create({
    data: {
      adminId,
      cowId,
      foodType: data.foodType,
      quantityKg: toNumber(data.quantityKg),
      fedAt: toDate(data.fedAt),
    },
  });
};

const getFeedingPlans = async (adminId) => {
  return prisma.animalFeedingPlan.findMany({
    where: { adminId },
    include: { cow: true },
    orderBy: { startDate: "desc" },
  });
};

const createFeedingPlan = async (data, adminId) => {
  const cowId = toNumber(data.cowId);
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");

  return prisma.animalFeedingPlan.create({
    data: {
      adminId,
      cowId,
      planName: data.planName,
      startDate: toDate(data.startDate),
      endDate: toDate(data.endDate),
      feedName: data.feedName,
      feedType: data.feedType,
      quantity: toNumber(data.quantity),
      unit: data.unit || "kg",
      feedingTime: data.feedingTime,
      frequency: data.frequency,
      instructions: data.instructions || null,
      remarks: data.remarks || null,
      status: data.status || "Active",
      prevDayMilkProd: data.prevDayMilkProd ? toNumber(data.prevDayMilkProd) : null,
      recommendedFeedQty: data.recommendedFeedQty ? toNumber(data.recommendedFeedQty) : null,
    },
  });
};

module.exports = {
  getCowFoodRecords,
  createCowFoodRecord,
  getFeedingPlans,
  createFeedingPlan,
};
