const prisma = require("../config/db");
const { toNumber, toDate, toNullableNumber } = require("../utils/helpers");

const getCows = async (adminId) => {
  return prisma.cow.findMany({
    where: { adminId },
    include: { reproductionRecords: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
};

const getCowHistory = async (cowId, adminId) => {
  return prisma.cow.findFirst({
    where: { id: toNumber(cowId), adminId },
    include: {
      reproductionRecords: { orderBy: { createdAt: "desc" } },
      milk: { orderBy: { recordDate: "desc" } },
      foodIntakes: { orderBy: { recordedAt: "desc" } },
      treatments: { orderBy: { treatedAt: "desc" } },
      sales: { orderBy: { soldAt: "desc" } },
    }
  });
};

const getNextRegNo = async (adminId) => {
  const lastCowWithReg = await prisma.cow.findFirst({
    where: { regNo: { not: null }, adminId },
    orderBy: { id: 'desc' }
  });
  let nextRegNo = 'reg001';
  if (lastCowWithReg && lastCowWithReg.regNo) {
    const match = lastCowWithReg.regNo.match(/\d+$/);
    const nextNumber = match ? parseInt(match[0], 10) + 1 : 1;
    nextRegNo = `reg${nextNumber.toString().padStart(3, '0')}`;
  }
  return nextRegNo;
};

const sellCow = async (cowId, data, adminId) => {
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");
  if (cow.status === "SOLD") throw new Error("Cow is already sold");

  return prisma.$transaction(async (tx) => {
    const sale = await tx.cowSale.create({
      data: {
        cowId,
        adminId,
        buyer: data.buyerName,
        amount: toNumber(data.salePrice),
        soldAt: toDate(data.saleDate) || new Date(),
        paymentMethod: data.paymentMethod || "Cash",
        paymentStatus: data.paymentStatus || "Paid",
        amountReceived: toNumber(data.amountReceived),
        buyerPhone: data.buyerPhone || null,
        buyerAddress: data.buyerAddress || null,
        buyerCity: data.buyerCity || null,
        buyerState: data.buyerState || null,
        buyerPincode: data.buyerPincode || null,
        reason: data.reason || "Other",
        otherReason: data.otherReason || null,
        lastMilkProd: toNullableNumber(data.lastMilkProd),
        lastFeedIntake: toNullableNumber(data.lastFeedIntake),
        remark: data.remark || null,
      },
    });

    await tx.cow.update({
      where: { id: cowId },
      data: { status: "SOLD" },
    });
    return sale;
  });
};

const createCow = async (data, adminId) => {
  let regNo = data.regNo || null;
  if (!regNo) {
    regNo = await getNextRegNo(adminId);
  }

  return prisma.cow.create({
    data: {
      adminId,
      tagNo: data.tagNo || regNo,
      name: data.name,
      breed: data.breed || data.animalType || "Cow",
      age: toNumber(data.age),
      gender: data.gender,
      status: data.status || "Active",
      animalType: data.animalType || "Cow",
      regNo: regNo,
      dob: toDate(data.dob),
      purchaseDate: toDate(data.purchaseDate),
      purchaseFrom: data.purchaseFrom || null,
      purchaseAddress: data.purchaseAddress || null,
      mobileNo: data.mobileNo || null,
      purchasePrice: toNullableNumber(data.purchasePrice),
      governmentTagNo: data.governmentTagNo || null,
      fatherName: data.fatherName || null,
      motherName: data.motherName || null,
      fatherFatherName: data.fatherFatherName || null,
      fatherMotherName: data.fatherMotherName || null,
      motherFatherName: data.motherFatherName || null,
      motherMotherName: data.motherMotherName || null,
      image: data.image || null,
      image2: data.image2 || null,
      isActiveForMilk: Boolean(data.isActiveForMilk),
    },
  });
};

const updateCow = async (cowId, data, adminId) => {
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");
  
  return prisma.cow.update({
    where: { id: cowId },
    data: {
      tagNo: data.tagNo || data.regNo,
      name: data.name,
      breed: data.breed || data.animalType || "Cow",
      age: toNumber(data.age),
      gender: data.gender,
      status: data.status || "Active",
      animalType: data.animalType || "Cow",
      regNo: data.regNo || null,
      dob: toDate(data.dob),
      purchaseDate: toDate(data.purchaseDate),
      purchaseFrom: data.purchaseFrom || null,
      purchaseAddress: data.purchaseAddress || null,
      mobileNo: data.mobileNo || null,
      purchasePrice: toNullableNumber(data.purchasePrice),
      governmentTagNo: data.governmentTagNo || null,
      fatherName: data.fatherName || null,
      motherName: data.motherName || null,
      fatherFatherName: data.fatherFatherName || null,
      fatherMotherName: data.fatherMotherName || null,
      motherFatherName: data.motherFatherName || null,
      motherMotherName: data.motherMotherName || null,
      image: data.image || null,
      image2: data.image2 || null,
      isActiveForMilk: Boolean(data.isActiveForMilk),
    },
  });
};

const deleteCow = async (cowId, adminId) => {
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Cow not found");

  await prisma.reproductionRecord.deleteMany({ where: { cowId } });
  await prisma.cowFoodRecord.deleteMany({ where: { cowId } });
  await prisma.milkRecord.deleteMany({ where: { cowId } });
  await prisma.cowSale.deleteMany({ where: { cowId } });
  await prisma.treatment.deleteMany({ where: { cowId } });
  await prisma.cowDeath.deleteMany({ where: { cowId } });
  await prisma.animalFeedingPlan.deleteMany({ where: { cowId } });

  await prisma.cow.delete({ where: { id: cowId } });
};

const createReproduction = async (cowId, data, adminId) => {
  const cow = await prisma.cow.findFirst({ where: { id: cowId, adminId } });
  if (!cow) throw new Error("Selected animal was not found");

  return prisma.reproductionRecord.create({
    data: {
      cowId,
      adminId,
      heatDate: toDate(data.heatDate),
      aiDate: toDate(data.aiDate),
      aiBullName: data.aiBullName || null,
      bullName: data.bullName || null,
      doctorName: data.doctorName || null,
      doctorArrivingAt: toDate(data.doctorArrivingAt),
      pregnancyCheckDate: toDate(data.pregnancyCheckDate),
      pregnancyStatus: data.pregnancyStatus || null,
      deliveryDate: toDate(data.deliveryDate),
      calfName: data.calfName || null,
      remark: data.remark || null,
      breedingStatus: data.breedingStatus || null,
      lastBreedingDate: toDate(data.lastBreedingDate),
      serviceCount: toNumber(data.serviceCount),
      aiType: data.aiType || null,
      expectedNextHeatDate: toDate(data.expectedNextHeatDate),
      pregnancyMonth: data.pregnancyMonth || null,
      veterinaryRemarks: data.veterinaryRemarks || null,
    },
  });
};

const updateReproduction = async (recordId, data, adminId) => {
  const record = await prisma.reproductionRecord.findFirst({ where: { id: recordId, adminId } });
  if (!record) throw new Error("Record not found");

  return prisma.reproductionRecord.update({
    where: { id: recordId },
    data: {
      heatDate: toDate(data.heatDate),
      aiDate: toDate(data.aiDate),
      aiBullName: data.aiBullName || null,
      bullName: data.bullName || null,
      doctorName: data.doctorName || null,
      doctorArrivingAt: toDate(data.doctorArrivingAt),
      pregnancyCheckDate: toDate(data.pregnancyCheckDate),
      pregnancyStatus: data.pregnancyStatus || null,
      deliveryDate: toDate(data.deliveryDate),
      calfName: data.calfName || null,
      remark: data.remark || null,
      breedingStatus: data.breedingStatus || null,
      lastBreedingDate: toDate(data.lastBreedingDate),
      serviceCount: toNumber(data.serviceCount),
      aiType: data.aiType || null,
      expectedNextHeatDate: toDate(data.expectedNextHeatDate),
      pregnancyMonth: data.pregnancyMonth || null,
      veterinaryRemarks: data.veterinaryRemarks || null,
    },
  });
};

const deleteReproduction = async (recordId, adminId) => {
  const record = await prisma.reproductionRecord.findFirst({ where: { id: recordId, adminId } });
  if (!record) throw new Error("Record not found");
  
  await prisma.reproductionRecord.delete({ where: { id: recordId } });
};

module.exports = {
  getCows,
  getNextRegNo,
  sellCow,
  createCow,
  updateCow,
  deleteCow,
  createReproduction,
  updateReproduction,
  deleteReproduction,
  getCowHistory
};
