const prisma = require("../config/db");

const getDailyMilk = async (dateStr, adminId) => {
  const targetDate = new Date(dateStr);
  targetDate.setUTCHours(0, 0, 0, 0);

  const nextDate = new Date(targetDate);
  nextDate.setDate(targetDate.getDate() + 1);

  return prisma.milkRecord.findMany({
    where: {
      adminId,
      recordDate: {
        gte: targetDate,
        lt: nextDate
      }
    },
    include: { cow: true }
  });
};

const getFeedPlan = async (dateStr, animalType, adminId) => {
  const targetDate = new Date(dateStr);
  targetDate.setUTCHours(0, 0, 0, 0);

  const nextDate = new Date(targetDate);
  nextDate.setDate(targetDate.getDate() + 1);

  const whereClause = {
    adminId,
    startDate: { gte: targetDate, lt: nextDate }
  };

  if (animalType && animalType !== "All") {
    whereClause.cow = { animalType };
  }

  const plans = await prisma.animalFeedingPlan.findMany({
    where: whereClause,
    include: { cow: true },
    orderBy: { cow: { name: 'asc' } }
  });

  return plans.map(p => ({
    cowId: p.cowId,
    cowName: p.cow.name,
    regNo: p.cow.regNo || p.cow.tagNo,
    animalType: p.cow.animalType,
    milkDate: new Date(p.startDate.getTime() - 86400000).toISOString(),
    feedDate: p.startDate,
    totalMilk: p.basedOnMilk || p.prevDayMilkProd || 0,
    requiredFood: p.quantity || 0,
  }));
};

const saveDailyMilk = async (dateStr, entries, adminId) => {
  const targetDate = new Date(dateStr);
  targetDate.setUTCHours(0, 0, 0, 0);

  const nextDate = new Date(targetDate);
  nextDate.setDate(targetDate.getDate() + 1);

  const planDate = new Date(targetDate);
  planDate.setDate(targetDate.getDate() + 1);

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      if (!entry.morningMilk && !entry.eveningMilk) continue;

      const morning = parseFloat(entry.morningMilk) || 0;
      const evening = parseFloat(entry.eveningMilk) || 0;
      const total = parseFloat(entry.totalMilk) || (morning + evening);

      const isSingleMilking = (!morning || !evening) && (morning > 0 || evening > 0);
      const entryType = isSingleMilking ? "SINGLE_MILKING" : "FULL_DAY";

      let milkRecord = await tx.milkRecord.findFirst({
        where: {
          cowId: entry.cowId,
          adminId,
          recordDate: {
            gte: targetDate,
            lt: nextDate
          }
        }
      });

      if (milkRecord) {
        milkRecord = await tx.milkRecord.update({
          where: { id: milkRecord.id },
          data: {
            morningMilk: morning || null,
            eveningMilk: evening || null,
            totalMilk: total
          }
        });
      } else {
        milkRecord = await tx.milkRecord.create({
          data: {
            cowId: entry.cowId,
            adminId,
            morningMilk: morning || null,
            eveningMilk: evening || null,
            totalMilk: total,
            recordDate: targetDate
          }
        });
      }

      const calculatedFeed = (total / 2) + 1;

      const tomorrowNextDay = new Date(planDate);
      tomorrowNextDay.setDate(planDate.getDate() + 1);

      let feedPlan = await tx.animalFeedingPlan.findFirst({
        where: {
          cowId: entry.cowId,
          adminId,
          startDate: {
            gte: planDate,
            lt: tomorrowNextDay
          }
        }
      });

      const feedPlanData = {
        planName: "Auto Generated Feed Plan",
        startDate: planDate,
        endDate: planDate,
        feedName: "Standard Feed",
        feedType: "Mixed",
        quantity: calculatedFeed,
        unit: "kg",
        feedingTime: "Morning & Evening",
        frequency: "Twice a day",
        basedOnMilk: total,
        entryType: entryType,
        milkEntryId: milkRecord.id,
        status: "Generated"
      };

      if (feedPlan) {
        await tx.animalFeedingPlan.update({
          where: { id: feedPlan.id },
          data: feedPlanData
        });
      } else {
        await tx.animalFeedingPlan.create({
          data: {
            cowId: entry.cowId,
            adminId,
            ...feedPlanData
          }
        });
      }
    }
  });
};

const getMilkRecordById = async (id, adminId) => {
  return prisma.milkRecord.findFirst({
    where: { id, adminId },
    include: { cow: true },
  });
};

const updateMilkRecord = async (id, data, adminId) => {
  const morning = parseFloat(data.morningMilk) || 0;
  const evening = parseFloat(data.eveningMilk) || 0;
  const total = morning + evening;

  const record = await prisma.milkRecord.findFirst({ where: { id, adminId } });
  if (!record) throw new Error("Record not found");

  return prisma.milkRecord.update({
    where: { id },
    data: {
      morningMilk: morning || null,
      eveningMilk: evening || null,
      totalMilk: total,
    },
    include: { cow: true },
  });
};

const deleteMilkRecord = async (id, adminId) => {
  const record = await prisma.milkRecord.findFirst({ where: { id, adminId } });
  if (!record) throw new Error("Record not found");

  await prisma.milkRecord.delete({ where: { id } });
};

module.exports = {
  getDailyMilk,
  getFeedPlan,
  saveDailyMilk,
  getMilkRecordById,
  updateMilkRecord,
  deleteMilkRecord
};
