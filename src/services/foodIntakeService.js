const prisma = require("../config/db");
const { toNumber, toDate, toNullableNumber } = require("../utils/helpers");

const getFoodIntakeRecords = async (adminId) => {
  return prisma.foodIntake.findMany({
    where: { adminId },
    include: { cow: true },
    orderBy: { recordedAt: "desc" }
  });
};

const createFoodIntakeRecord = async (data, adminId) => {
  const cowId = data.cowId ? toNumber(data.cowId) : null;
  let cow = null;
  if (cowId) {
    cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
    if (!cow) throw new Error("Cow not found");
  }

  const itemId = data.itemId ? toNumber(data.itemId) : null;
  const totalIntake = toNullableNumber(data.totalIntake) || 0;

  return prisma.$transaction(async (tx) => {
    if (itemId && totalIntake > 0) {
      const item = await tx.item.findFirst({ where: { id: itemId, adminId } });
      if (!item) throw new Error("Stock item not found");
      
      const newStock = item.currentStock - totalIntake;
      
      await tx.item.update({
        where: { id: itemId },
        data: { currentStock: newStock }
      });

      await tx.stockAdjustment.create({
        data: {
          adminId,
          itemId,
          type: "Remove",
          previousStock: item.currentStock,
          adjustment: totalIntake,
          newStock,
          reason: "Food to Cow",
          remarks: `Food to ${cow ? (cow.name || cow.tagNo || "Animal") : "Animal"}`,
          createdBy: "System"
        }
      });
    }

    return tx.foodIntake.create({
      data: {
        adminId,
        cowId,
        foodItem: data.foodItem || null,
        foodType: data.foodType,
        morningIntake: toNullableNumber(data.morningIntake) || 0,
        afternoonIntake: toNullableNumber(data.afternoonIntake) || 0,
        eveningIntake: toNullableNumber(data.eveningIntake) || 0,
        totalIntake,
        quantityKg: toNullableNumber(data.quantityKg),
        notes: data.notes || null,
        recordedAt: toDate(data.recordedAt) || new Date(),
      },
    });
  });
};

const updateFoodIntakeRecord = async (id, data, adminId) => {
  const existing = await prisma.foodIntake.findFirst({ where: { id, adminId } });
  if (!existing) throw new Error("Record not found");

  const cowId = data.cowId ? toNumber(data.cowId) : null;
  const totalIntake = toNullableNumber(data.totalIntake) || 0;

  return prisma.foodIntake.update({
    where: { id },
    data: {
      cowId,
      foodItem: data.foodItem || null,
      foodType: data.foodType,
      morningIntake: toNullableNumber(data.morningIntake) || 0,
      afternoonIntake: toNullableNumber(data.afternoonIntake) || 0,
      eveningIntake: toNullableNumber(data.eveningIntake) || 0,
      totalIntake,
      quantityKg: toNullableNumber(data.quantityKg),
      notes: data.notes || null,
      recordedAt: toDate(data.recordedAt) || existing.recordedAt,
    }
  });
};

const deleteFoodIntakeRecord = async (id, adminId) => {
  const record = await prisma.foodIntake.findFirst({ where: { id, adminId } });
  if (!record) throw new Error("Record not found");

  await prisma.foodIntake.delete({ where: { id } });
};

module.exports = {
  getFoodIntakeRecords,
  createFoodIntakeRecord,
  updateFoodIntakeRecord,
  deleteFoodIntakeRecord
};
