const prisma = require("../config/db");
const { toNumber, toDate } = require("../utils/helpers");

const getSales = async (adminId) => {
  return prisma.cowSale.findMany({
    where: { adminId },
    include: { cow: true },
    orderBy: { soldAt: "desc" },
  });
};

const createSale = async (data, adminId) => {
  const cowId = toNumber(data.cowId);
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");

  return prisma.cowSale.create({
    data: {
      adminId,
      cowId,
      buyer: data.buyer,
      amount: toNumber(data.amount),
      soldAt: toDate(data.soldAt),
    },
  });
};

const getSoldCows = async (adminId) => {
  return prisma.cowSale.findMany({
    where: { adminId },
    include: { cow: true },
    orderBy: { soldAt: "desc" },
  });
};

const deleteSale = async (saleId, adminId) => {
  const id = toNumber(saleId);
  const sale = await prisma.cowSale.findFirst({ where: { id, adminId } });
  if (!sale) throw new Error("Sale not found");

  return prisma.$transaction(async (tx) => {
    await tx.cowSale.delete({ where: { id } });
    await tx.cow.update({
      where: { id: sale.cowId },
      data: { status: "Active" }
    });
  });
};

module.exports = {
  getSales,
  createSale,
  getSoldCows,
  deleteSale
};
