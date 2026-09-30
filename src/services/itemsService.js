const prisma = require("../config/db");
const { toNumber, toDate, toNullableNumber } = require("../utils/helpers");

const getItems = async (adminId) => {
  // Trigger restart for new prisma client 2
  return prisma.item.findMany({ where: { adminId } });
};

const createItem = async (data, adminId) => {
  return prisma.item.create({
    data: {
      adminId,
      name: data.name,
      unit: data.unit || "Kg",
      price: toNullableNumber(data.price),
      minimumLevel: toNullableNumber(data.minimumLevel),
      currentStock: toNullableNumber(data.currentStock) || 0,
      remarks: data.remarks || null,
    },
  });
};

const updateItem = async (id, data, adminId) => {
  const item = await prisma.item.findFirst({ where: { id, adminId } });
  if (!item) throw new Error("Item not found");

  return prisma.$transaction(async (tx) => {
    let newStock = item.currentStock;
    const providedStock = toNullableNumber(data.currentStock);

    if (providedStock !== null && providedStock !== item.currentStock) {
      newStock = providedStock;
      const adjustment = Math.abs(newStock - item.currentStock);
      const type = newStock > item.currentStock ? "Add" : "Remove";

      await tx.stockAdjustment.create({
        data: {
          adminId,
          itemId: item.id,
          type,
          previousStock: item.currentStock,
          adjustment,
          newStock,
          reason: "Manual Adjustment",
          remarks: "Adjusted via Items List",
          createdBy: "Admin"
        }
      });
    }

    return tx.item.update({
      where: { id },
      data: {
        name: data.name,
        unit: data.unit || "Kg",
        price: toNullableNumber(data.price),
        minimumLevel: toNullableNumber(data.minimumLevel),
        currentStock: newStock,
        remarks: data.remarks || null,
      },
    });
  });
};

const deleteItem = async (id, adminId) => {
  const item = await prisma.item.findFirst({ where: { id, adminId } });
  if (!item) throw new Error("Item not found");

  await prisma.item.delete({ where: { id } });
};

const getFoodPurchases = async (adminId) => {
  return prisma.foodPurchase.findMany({
    where: { adminId },
    orderBy: { purchaseDate: "desc" },
  });
};

const createFoodPurchase = async (data, adminId) => {
  return prisma.foodPurchase.create({
    data: {
      adminId,
      foodType: data.foodType,
      quantityKg: toNumber(data.quantityKg),
      pricePerKg: toNullableNumber(data.pricePerKg) || 0,
      totalAmount: toNullableNumber(data.totalAmount) || 0,
      vendorName: data.vendorName || null,
      purchaseDate: toDate(data.purchaseDate) || new Date(),
    },
  });
};

module.exports = {
  getItems,
  createItem,
  updateItem,
  deleteItem,
  getFoodPurchases,
  createFoodPurchase
};
