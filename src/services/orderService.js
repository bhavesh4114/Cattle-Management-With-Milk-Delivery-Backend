const prisma = require("../config/db");
const { toNumber } = require("../utils/helpers");

const getOrders = async (adminId) => {
  return prisma.order.findMany({
    where: { adminId },
    orderBy: { createdAt: "desc" },
    include: { items: true }
  });
};

const createOrder = async (data, adminId) => {
  const orderNumber = `ORD-${Date.now()}`;
  let totalAmount = 0;
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach(it => {
      totalAmount += (toNumber(it.quantity) * toNumber(it.price));
    });
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        adminId,
        orderNumber,
        vendorName: data.vendorName,
        location: data.location || null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
        paymentStatus: data.paymentStatus || "Pending",
        remarks: data.remarks || null,
        totalAmount,
        items: {
          create: data.items?.map(it => ({
            itemName: it.itemName,
            quantity: toNumber(it.quantity),
            unit: it.unit || "Kg",
            price: toNumber(it.price)
          })) || []
        }
      },
      include: { items: true }
    });

    if (data.items && Array.isArray(data.items)) {
      for (const it of data.items) {
        const inventoryItem = await tx.item.findFirst({
          where: { name: it.itemName, adminId }
        });

        if (inventoryItem) {
          const qty = toNumber(it.quantity);
          const newStock = inventoryItem.currentStock + qty;

          await tx.item.update({
            where: { id: inventoryItem.id },
            data: { currentStock: newStock }
          });

          await tx.stockAdjustment.create({
            data: {
              adminId,
              itemId: inventoryItem.id,
              type: "Add",
              previousStock: inventoryItem.currentStock,
              adjustment: qty,
              newStock,
              reason: "Order Purchase",
              remarks: `Purchased via Order ${orderNumber}`,
              createdBy: "System"
            }
          });
        }
      }
    }

    return order;
  });
};

const updateOrder = async (id, data, adminId) => {
  const order = await prisma.order.findFirst({ where: { id, adminId } });
  if (!order) throw new Error("Order not found");

  let totalAmount = 0;
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach(it => {
      totalAmount += (toNumber(it.quantity) * toNumber(it.price));
    });
  }

  // Delete old items and create new ones
  await prisma.orderItem.deleteMany({ where: { orderId: id } });

  return prisma.order.update({
    where: { id },
    data: {
      vendorName: data.vendorName,
      location: data.location || null,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
      paymentStatus: data.paymentStatus || "Pending",
      remarks: data.remarks || null,
      totalAmount,
      items: {
        create: data.items?.map(it => ({
          itemName: it.itemName,
          quantity: toNumber(it.quantity),
          unit: it.unit || "Kg",
          price: toNumber(it.price)
        })) || []
      }
    },
    include: { items: true }
  });
};

const deleteOrder = async (id, adminId) => {
  const order = await prisma.order.findFirst({ where: { id, adminId } });
  if (!order) throw new Error("Order not found");

  return prisma.order.delete({ where: { id } });
};

module.exports = {
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder
};
