-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOM';

-- DropIndex
DROP INDEX "Cow_tagNo_key";

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "customRoleId" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Active';

-- AlterTable
ALTER TABLE "Cow" ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "image2" TEXT;

-- AlterTable
ALTER TABLE "CowDeath" ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "disposalCost" DOUBLE PRECISION,
ADD COLUMN     "disposalDate" TIMESTAMP(3),
ADD COLUMN     "disposalMethod" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "CowFoodRecord" ADD COLUMN     "adminId" INTEGER;

-- AlterTable
ALTER TABLE "CowSale" ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "amountReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "buyerAddress" TEXT,
ADD COLUMN     "buyerCity" TEXT,
ADD COLUMN     "buyerPhone" TEXT,
ADD COLUMN     "buyerPincode" TEXT,
ADD COLUMN     "buyerState" TEXT,
ADD COLUMN     "lastFeedIntake" DOUBLE PRECISION,
ADD COLUMN     "lastMilkProd" DOUBLE PRECISION,
ADD COLUMN     "otherReason" TEXT,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'Cash',
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'Paid',
ADD COLUMN     "reason" TEXT NOT NULL DEFAULT 'Other',
ADD COLUMN     "remark" TEXT;

-- AlterTable
ALTER TABLE "FoodIntake" ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "afternoonIntake" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "cowId" INTEGER,
ADD COLUMN     "eveningIntake" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "foodItem" TEXT,
ADD COLUMN     "morningIntake" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "totalIntake" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "quantityKg" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FoodPurchase" ADD COLUMN     "adminId" INTEGER;

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "category",
DROP COLUMN "quantity",
ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "minimumLevel" DOUBLE PRECISION,
ADD COLUMN     "price" DOUBLE PRECISION,
ADD COLUMN     "remarks" TEXT;

-- AlterTable
ALTER TABLE "MilkRecord" DROP COLUMN "liters",
DROP COLUMN "milkedAt",
DROP COLUMN "shift",
ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "eveningMilk" DOUBLE PRECISION,
ADD COLUMN     "morningMilk" DOUBLE PRECISION,
ADD COLUMN     "recordDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "totalMilk" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "amount",
DROP COLUMN "customer",
DROP COLUMN "itemName",
DROP COLUMN "orderedAt",
DROP COLUMN "quantity",
DROP COLUMN "status",
ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "orderNumber" TEXT NOT NULL,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'Pending',
ADD COLUMN     "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "vendorName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ReproductionRecord" ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "aiType" TEXT,
ADD COLUMN     "breedingStatus" TEXT,
ADD COLUMN     "expectedNextHeatDate" TIMESTAMP(3),
ADD COLUMN     "lastBreedingDate" TIMESTAMP(3),
ADD COLUMN     "pregnancyMonth" TEXT,
ADD COLUMN     "serviceCount" INTEGER,
ADD COLUMN     "veterinaryRemarks" TEXT;

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "currentMilk" DOUBLE PRECISION,
ADD COLUMN     "doctorName" TEXT,
ADD COLUMN     "dropPercentage" DOUBLE PRECISION,
ADD COLUMN     "milkDropSource" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previousMilk" DOUBLE PRECISION,
ADD COLUMN     "remarks" TEXT;

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionRule" (
    "id" SERIAL NOT NULL,
    "inputMaterial" TEXT NOT NULL DEFAULT 'Milk',
    "inputQty" DOUBLE PRECISION NOT NULL,
    "outputProduct" TEXT NOT NULL,
    "outputQty" DOUBLE PRECISION NOT NULL,
    "outputUnit" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "adminId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "previousStock" DOUBLE PRECISION NOT NULL,
    "adjustment" DOUBLE PRECISION NOT NULL,
    "newStock" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" INTEGER,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Kg',
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalFeedingPlan" (
    "id" SERIAL NOT NULL,
    "cowId" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "feedName" TEXT NOT NULL,
    "feedType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "feedingTime" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "instructions" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "prevDayMilkProd" DOUBLE PRECISION,
    "recommendedFeedQty" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "basedOnMilk" DOUBLE PRECISION,
    "entryType" TEXT,
    "milkEntryId" INTEGER,
    "adminId" INTEGER,

    CONSTRAINT "AnimalFeedingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkAllocation" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "staffId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "allocatedQty" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMilkReport" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "receivedQty" DOUBLE PRECISION NOT NULL,
    "totalUsedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ADMIN_REVIEW',
    "adminRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffMilkReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMilkOrder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "adminId" INTEGER,
    "customerName" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "milkType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "originalDate" TIMESTAMP(3),
    "proposedDate" TIMESTAMP(3),
    "deliveryBoyName" TEXT,
    "deliveryBoyPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ADMIN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" INTEGER,

    CONSTRAINT "CustomerMilkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderHistoryLine" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorName" TEXT,
    "actionDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderHistoryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "size" TEXT,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkTrial" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "adminId" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "pincode" TEXT,
    "milkType" TEXT NOT NULL,
    "dailyQuantity" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING_ADMIN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryBoyId" INTEGER,
    "deliveryStatus" TEXT DEFAULT 'Pending',
    "productId" INTEGER,

    CONSTRAINT "MilkTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "adminId" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "pincode" TEXT,
    "milkType" TEXT NOT NULL,
    "dailyQuantity" DOUBLE PRECISION NOT NULL,
    "requestedStartDate" TIMESTAMP(3) NOT NULL,
    "requestedEndDate" TIMESTAMP(3) NOT NULL,
    "offeredStartDate" TIMESTAMP(3),
    "offeredEndDate" TIMESTAMP(3),
    "finalStartDate" TIMESTAMP(3),
    "finalEndDate" TIMESTAMP(3),
    "pricePerLitre" DOUBLE PRECISION,
    "totalDays" INTEGER,
    "totalAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ADMIN',
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryBoyId" INTEGER,
    "deliveryStatus" TEXT DEFAULT 'Pending',
    "productId" INTEGER,

    CONSTRAINT "MilkSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkPayment" (
    "id" SERIAL NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "transactionId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryBoyProfile" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "mobile" TEXT,
    "pincodes" TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deliveryRadius" DOUBLE PRECISION DEFAULT 10,
    "accountStatus" TEXT NOT NULL DEFAULT 'Active',
    "dailyStatus" TEXT NOT NULL DEFAULT 'Available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryBoyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAvailability" (
    "id" SERIAL NOT NULL,
    "deliveryBoyId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAssignment" (
    "id" SERIAL NOT NULL,
    "orderType" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "deliveryBoyId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'Assigned',
    "qrCode" TEXT,
    "deliveryOtp" TEXT,
    "isQrScanned" BOOLEAN NOT NULL DEFAULT false,
    "isOtpVerified" BOOLEAN NOT NULL DEFAULT false,
    "deliveryProof" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAlert" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_name_key" ON "CustomRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryBoyProfile_adminId_key" ON "DeliveryBoyProfile"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAvailability_deliveryBoyId_date_key" ON "DeliveryAvailability"("deliveryBoyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAssignment_qrCode_key" ON "DeliveryAssignment"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "Cow_adminId_tagNo_key" ON "Cow"("adminId", "tagNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionRule" ADD CONSTRAINT "ConversionRule_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cow" ADD CONSTRAINT "Cow_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReproductionRecord" ADD CONSTRAINT "ReproductionRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPurchase" ADD CONSTRAINT "FoodPurchase_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CowFoodRecord" ADD CONSTRAINT "CowFoodRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodIntake" ADD CONSTRAINT "FoodIntake_cowId_fkey" FOREIGN KEY ("cowId") REFERENCES "Cow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodIntake" ADD CONSTRAINT "FoodIntake_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkRecord" ADD CONSTRAINT "MilkRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CowSale" ADD CONSTRAINT "CowSale_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CowDeath" ADD CONSTRAINT "CowDeath_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalFeedingPlan" ADD CONSTRAINT "AnimalFeedingPlan_cowId_fkey" FOREIGN KEY ("cowId") REFERENCES "Cow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalFeedingPlan" ADD CONSTRAINT "AnimalFeedingPlan_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkAllocation" ADD CONSTRAINT "MilkAllocation_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMilkOrder" ADD CONSTRAINT "CustomerMilkOrder_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMilkOrder" ADD CONSTRAINT "CustomerMilkOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHistoryLine" ADD CONSTRAINT "OrderHistoryLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerMilkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkTrial" ADD CONSTRAINT "MilkTrial_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkTrial" ADD CONSTRAINT "MilkTrial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkSubscription" ADD CONSTRAINT "MilkSubscription_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkSubscription" ADD CONSTRAINT "MilkSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkPayment" ADD CONSTRAINT "MilkPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MilkSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryBoyProfile" ADD CONSTRAINT "DeliveryBoyProfile_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAvailability" ADD CONSTRAINT "DeliveryAvailability_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAlert" ADD CONSTRAINT "UserAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

