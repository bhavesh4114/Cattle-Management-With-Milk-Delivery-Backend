const prisma = require("../config/db");
const { toNumber } = require("../utils/helpers");

const getAdjustments = async (startDate, endDate, adminId, itemId) => {
  const where = { adminId };
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    where.createdAt = {
      gte: start,
      lte: end,
    };
  }
  if (itemId) {
    where.itemId = toNumber(itemId);
  }

  const adjustments = await prisma.stockAdjustment.findMany({
    where,
    include: { item: true },
    orderBy: { createdAt: "desc" },
  });

  const totalRecords = adjustments.length;
  const stockAdded = adjustments.filter(a => a.type === "Add").reduce((sum, a) => sum + a.adjustment, 0);
  const stockRemoved = adjustments.filter(a => a.type === "Remove").reduce((sum, a) => sum + a.adjustment, 0);

  return {
    adjustments,
    summary: {
      totalRecords,
      stockAdded,
      stockRemoved,
    }
  };
};

const createAdjustment = async (data, adminId) => {
  const { itemId, type, adjustment, reason, remarks, createdBy } = data;
  
  if (!itemId || !type || !adjustment || adjustment <= 0) {
    throw new Error("Invalid adjustment data");
  }
  if (type !== "Add" && type !== "Remove") {
    throw new Error("Type must be 'Add' or 'Remove'");
  }

  const adjValue = toNumber(adjustment);

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findFirst({ where: { id: toNumber(itemId), adminId } });
    if (!item) {
      throw new Error("Item not found");
    }

    let newStock = 0;
    if (type === "Add") {
      newStock = item.currentStock + adjValue;
    } else {
      newStock = item.currentStock - adjValue;
      if (newStock < 0) {
        throw new Error(`Insufficient stock. Available stock is ${item.currentStock} ${item.unit}.`);
      }
    }

    const adjustmentRecord = await tx.stockAdjustment.create({
      data: {
        adminId,
        itemId: item.id,
        type,
        previousStock: item.currentStock,
        adjustment: adjValue,
        newStock,
        reason,
        remarks: remarks || null,
        createdBy: createdBy || "admin"
      }
    });

    await tx.item.update({
      where: { id: item.id },
      data: { currentStock: newStock }
    });

    return adjustmentRecord;
  });
};

module.exports = {
  getAdjustments,
  createAdjustment
};
