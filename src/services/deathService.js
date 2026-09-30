const prisma = require("../config/db");
const { toNumber, toDate, toNullableNumber } = require("../utils/helpers");

const getDeaths = async (adminId) => {
  return prisma.cowDeath.findMany({
    where: { adminId },
    include: { 
      cow: {
        include: {
          reproductionRecords: true,
          treatments: true
        }
      } 
    },
    orderBy: { deathAt: "desc" },
  });
};

const createDeath = async (data, adminId) => {
  const cowId = toNumber(data.cowId);
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");

  return prisma.$transaction(async (tx) => {
    const death = await tx.cowDeath.create({
      data: {
        cowId,
        adminId,
        reason: data.reason,
        deathAt: toDate(data.deathAt) || new Date(),
        disposalMethod: data.disposalMethod || null,
        disposalDate: toDate(data.disposalDate) || null,
        disposalCost: toNullableNumber(data.disposalCost) || null,
        notes: data.notes || null,
      },
    });

    await tx.cow.update({
      where: { id: cowId },
      data: { status: "Dead" },
    });

    return death;
  });
};

const deleteDeath = async (deathId, adminId) => {
  const deathRecord = await prisma.cowDeath.findFirst({
    where: { id: deathId, adminId },
  });
  if (!deathRecord) throw new Error("Death record not found");

  return prisma.$transaction(async (tx) => {
    await tx.cow.update({
      where: { id: deathRecord.cowId },
      data: { status: "Active" },
    });

    return tx.cowDeath.delete({
      where: { id: deathId },
    });
  });
};

module.exports = {
  getDeaths,
  createDeath,
  deleteDeath
};
