const prisma = require("../config/db");
const { toNumber, toDate } = require("../utils/helpers");

const getTreatments = async (adminId) => {
  return prisma.treatment.findMany({
    where: { adminId },
    include: { cow: true },
    orderBy: { treatedAt: "desc" },
  });
};

const createTreatment = async (data, adminId) => {
  const cowId = toNumber(data.cowId);
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");

  return prisma.treatment.create({
    data: {
      adminId,
      cowId: cowId,
      diagnosis: data.diagnosis,
      medicine: data.medicine,
      treatedAt: toDate(data.treatedAt),
      doctorName: data.doctorName || null,
      cost: toNumber(data.cost) || 0,
      remarks: data.remarks || null,
      milkDropSource: data.milkDropSource || false,
      previousMilk: toNumber(data.previousMilk) || null,
      currentMilk: toNumber(data.currentMilk) || null,
      dropPercentage: toNumber(data.dropPercentage) || null,
    },
  });
};

const updateTreatment = async (id, data, adminId) => {
  const record = await prisma.treatment.findFirst({ where: { id, adminId } });
  if (!record) throw new Error("Record not found");

  const cowId = toNumber(data.cowId);
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");

  return prisma.treatment.update({
    where: { id },
    data: {
      cowId: cowId,
      diagnosis: data.diagnosis,
      medicine: data.medicine,
      treatedAt: toDate(data.treatedAt),
      doctorName: data.doctorName || null,
      cost: toNumber(data.cost) || 0,
      remarks: data.remarks || null,
      milkDropSource: data.milkDropSource || false,
      previousMilk: toNumber(data.previousMilk) || null,
      currentMilk: toNumber(data.currentMilk) || null,
      dropPercentage: toNumber(data.dropPercentage) || null,
    },
  });
};

const deleteTreatment = async (id, adminId) => {
  const record = await prisma.treatment.findFirst({ where: { id, adminId } });
  if (!record) throw new Error("Record not found");

  await prisma.treatment.delete({ where: { id } });
};

module.exports = {
  getTreatments,
  createTreatment,
  updateTreatment,
  deleteTreatment
};
