ALTER TABLE "Cow" ADD COLUMN "animalType" TEXT NOT NULL DEFAULT 'Cow';
ALTER TABLE "Cow" ADD COLUMN "regNo" TEXT;
ALTER TABLE "Cow" ADD COLUMN "dob" TIMESTAMP(3);
ALTER TABLE "Cow" ADD COLUMN "purchaseDate" TIMESTAMP(3);
ALTER TABLE "Cow" ADD COLUMN "purchaseFrom" TEXT;
ALTER TABLE "Cow" ADD COLUMN "purchaseAddress" TEXT;
ALTER TABLE "Cow" ADD COLUMN "mobileNo" TEXT;
ALTER TABLE "Cow" ADD COLUMN "purchasePrice" DOUBLE PRECISION;
ALTER TABLE "Cow" ADD COLUMN "governmentTagNo" TEXT;
ALTER TABLE "Cow" ADD COLUMN "fatherName" TEXT;
ALTER TABLE "Cow" ADD COLUMN "motherName" TEXT;
ALTER TABLE "Cow" ADD COLUMN "fatherFatherName" TEXT;
ALTER TABLE "Cow" ADD COLUMN "fatherMotherName" TEXT;
ALTER TABLE "Cow" ADD COLUMN "motherFatherName" TEXT;
ALTER TABLE "Cow" ADD COLUMN "motherMotherName" TEXT;
ALTER TABLE "Cow" ADD COLUMN "isActiveForMilk" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ReproductionRecord" (
    "id" SERIAL NOT NULL,
    "cowId" INTEGER NOT NULL,
    "heatDate" TIMESTAMP(3),
    "aiDate" TIMESTAMP(3),
    "aiBullName" TEXT,
    "bullName" TEXT,
    "doctorName" TEXT,
    "doctorArrivingAt" TIMESTAMP(3),
    "pregnancyCheckDate" TIMESTAMP(3),
    "pregnancyStatus" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "calfName" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReproductionRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReproductionRecord" ADD CONSTRAINT "ReproductionRecord_cowId_fkey" FOREIGN KEY ("cowId") REFERENCES "Cow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
