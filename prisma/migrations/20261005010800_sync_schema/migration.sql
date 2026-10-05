-- AlterEnum
DO $$
BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CUSTOM';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- DropIndex (Non-destructive: replacing global unique constraint with multi-tenant compound unique index)
DROP INDEX IF EXISTS "Cow_tagNo_key";

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "customRoleId" INTEGER,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Active';

-- AlterTable
ALTER TABLE "Cow" ADD COLUMN IF NOT EXISTS "adminId" INTEGER,
ADD COLUMN IF NOT EXISTS "image" TEXT,
ADD COLUMN IF NOT EXISTS "image2" TEXT;

-- AlterTable
ALTER TABLE "CowDeath" ADD COLUMN IF NOT EXISTS "adminId" INTEGER,
ADD COLUMN IF NOT EXISTS "disposalCost" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "disposalDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "disposalMethod" TEXT,
ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- AlterTable
ALTER TABLE "CowFoodRecord" ADD COLUMN IF NOT EXISTS "adminId" INTEGER;

-- AlterTable
ALTER TABLE "CowSale" ADD COLUMN IF NOT EXISTS "adminId" INTEGER,
ADD COLUMN IF NOT EXISTS "amountReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "buyerAddress" TEXT,
ADD COLUMN IF NOT EXISTS "buyerCity" TEXT,
ADD COLUMN IF NOT EXISTS "buyerPhone" TEXT,
ADD COLUMN IF NOT EXISTS "buyerPincode" TEXT,
ADD COLUMN IF NOT EXISTS "buyerState" TEXT,
ADD COLUMN IF NOT EXISTS "lastFeedIntake" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "lastMilkProd" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "otherReason" TEXT,
ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'Cash',
ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'Paid',
ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT 'Other',
ADD COLUMN IF NOT EXISTS "remark" TEXT;

-- AlterTable
ALTER TABLE "FoodIntake" ADD COLUMN IF NOT EXISTS "adminId" INTEGER,
ADD COLUMN IF NOT EXISTS "afternoonIntake" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS "cowId" INTEGER,
ADD COLUMN IF NOT EXISTS "eveningIntake" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS "foodItem" TEXT,
ADD COLUMN IF NOT EXISTS "morningIntake" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalIntake" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "FoodIntake" ALTER COLUMN "quantityKg" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FoodPurchase" ADD COLUMN IF NOT EXISTS "adminId" INTEGER;

-- AlterTable (Item) - SAFE & NON-DESTRUCTIVE: Legacy columns category and quantity are preserved
ALTER TABLE "Item" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "Item" ALTER COLUMN "quantity" DROP NOT NULL;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "adminId" INTEGER;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "minimumLevel" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- AlterTable (MilkRecord) - SAFE & NON-DESTRUCTIVE: Legacy columns liters, milkedAt, shift are preserved
ALTER TABLE "MilkRecord" ALTER COLUMN "liters" DROP NOT NULL;
ALTER TABLE "MilkRecord" ALTER COLUMN "milkedAt" DROP NOT NULL;
ALTER TABLE "MilkRecord" ALTER COLUMN "shift" DROP NOT NULL;
ALTER TABLE "MilkRecord" ADD COLUMN IF NOT EXISTS "adminId" INTEGER;
ALTER TABLE "MilkRecord" ADD COLUMN IF NOT EXISTS "eveningMilk" DOUBLE PRECISION;
ALTER TABLE "MilkRecord" ADD COLUMN IF NOT EXISTS "morningMilk" DOUBLE PRECISION;
ALTER TABLE "MilkRecord" ADD COLUMN IF NOT EXISTS "recordDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MilkRecord" ADD COLUMN IF NOT EXISTS "totalMilk" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable (Order) - SAFE & NON-DESTRUCTIVE: Legacy customer order columns amount, customer, itemName, orderedAt, quantity, status are preserved
ALTER TABLE "Order" ALTER COLUMN "amount" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "customer" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "itemName" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "quantity" DROP NOT NULL;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "adminId" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'Pending';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "vendorName" TEXT DEFAULT 'General Vendor';

-- Populate unique orderNumber and default vendorName for existing legacy rows if any, then enforce NOT NULL
UPDATE "Order" SET "orderNumber" = CONCAT('ORD-LEGACY-', "id"::text) WHERE "orderNumber" IS NULL;
UPDATE "Order" SET "vendorName" = 'General Vendor' WHERE "vendorName" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "vendorName" SET NOT NULL;

-- AlterTable
ALTER TABLE "ReproductionRecord" ADD COLUMN IF NOT EXISTS "adminId" INTEGER,
ADD COLUMN IF NOT EXISTS "aiType" TEXT,
ADD COLUMN IF NOT EXISTS "breedingStatus" TEXT,
ADD COLUMN IF NOT EXISTS "expectedNextHeatDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastBreedingDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "pregnancyMonth" TEXT,
ADD COLUMN IF NOT EXISTS "serviceCount" INTEGER,
ADD COLUMN IF NOT EXISTS "veterinaryRemarks" TEXT;

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN IF NOT EXISTS "adminId" INTEGER,
ADD COLUMN IF NOT EXISTS "currentMilk" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "doctorName" TEXT,
ADD COLUMN IF NOT EXISTS "dropPercentage" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "milkDropSource" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "previousMilk" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomRole" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConversionRule" (
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
CREATE TABLE IF NOT EXISTS "StockAdjustment" (
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
CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Kg',
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnimalFeedingPlan" (
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
CREATE TABLE IF NOT EXISTS "MilkAllocation" (
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
CREATE TABLE IF NOT EXISTS "StaffMilkReport" (
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
CREATE TABLE IF NOT EXISTS "CustomerMilkOrder" (
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
CREATE TABLE IF NOT EXISTS "OrderHistoryLine" (
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
CREATE TABLE IF NOT EXISTS "Product" (
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
CREATE TABLE IF NOT EXISTS "MilkTrial" (
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
CREATE TABLE IF NOT EXISTS "MilkSubscription" (
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
CREATE TABLE IF NOT EXISTS "MilkPayment" (
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
CREATE TABLE IF NOT EXISTS "DeliveryBoyProfile" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryBoyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryAvailability" (
    "id" SERIAL NOT NULL,
    "deliveryBoyId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryAssignment" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserAlert" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomRole_name_key" ON "CustomRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryBoyProfile_adminId_key" ON "DeliveryBoyProfile"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryAvailability_deliveryBoyId_date_key" ON "DeliveryAvailability"("deliveryBoyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryAssignment_qrCode_key" ON "DeliveryAssignment"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Cow_adminId_tagNo_key" ON "Cow"("adminId", "tagNo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");

-- AddForeignKey (wrapped safely with constraint existence check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Admin_customRoleId_fkey') THEN
    ALTER TABLE "Admin" ADD CONSTRAINT "Admin_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConversionRule_adminId_fkey') THEN
    ALTER TABLE "ConversionRule" ADD CONSTRAINT "ConversionRule_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cow_adminId_fkey') THEN
    ALTER TABLE "Cow" ADD CONSTRAINT "Cow_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReproductionRecord_adminId_fkey') THEN
    ALTER TABLE "ReproductionRecord" ADD CONSTRAINT "ReproductionRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoodPurchase_adminId_fkey') THEN
    ALTER TABLE "FoodPurchase" ADD CONSTRAINT "FoodPurchase_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CowFoodRecord_adminId_fkey') THEN
    ALTER TABLE "CowFoodRecord" ADD CONSTRAINT "CowFoodRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoodIntake_cowId_fkey') THEN
    ALTER TABLE "FoodIntake" ADD CONSTRAINT "FoodIntake_cowId_fkey" FOREIGN KEY ("cowId") REFERENCES "Cow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoodIntake_adminId_fkey') THEN
    ALTER TABLE "FoodIntake" ADD CONSTRAINT "FoodIntake_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MilkRecord_adminId_fkey') THEN
    ALTER TABLE "MilkRecord" ADD CONSTRAINT "MilkRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CowSale_adminId_fkey') THEN
    ALTER TABLE "CowSale" ADD CONSTRAINT "CowSale_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Treatment_adminId_fkey') THEN
    ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Item_adminId_fkey') THEN
    ALTER TABLE "Item" ADD CONSTRAINT "Item_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_itemId_fkey') THEN
    ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_adminId_fkey') THEN
    ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_adminId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_orderId_fkey') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CowDeath_adminId_fkey') THEN
    ALTER TABLE "CowDeath" ADD CONSTRAINT "CowDeath_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnimalFeedingPlan_cowId_fkey') THEN
    ALTER TABLE "AnimalFeedingPlan" ADD CONSTRAINT "AnimalFeedingPlan_cowId_fkey" FOREIGN KEY ("cowId") REFERENCES "Cow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnimalFeedingPlan_adminId_fkey') THEN
    ALTER TABLE "AnimalFeedingPlan" ADD CONSTRAINT "AnimalFeedingPlan_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MilkAllocation_adminId_fkey') THEN
    ALTER TABLE "MilkAllocation" ADD CONSTRAINT "MilkAllocation_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerMilkOrder_adminId_fkey') THEN
    ALTER TABLE "CustomerMilkOrder" ADD CONSTRAINT "CustomerMilkOrder_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerMilkOrder_productId_fkey') THEN
    ALTER TABLE "CustomerMilkOrder" ADD CONSTRAINT "CustomerMilkOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderHistoryLine_orderId_fkey') THEN
    ALTER TABLE "OrderHistoryLine" ADD CONSTRAINT "OrderHistoryLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerMilkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_adminId_fkey') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MilkTrial_adminId_fkey') THEN
    ALTER TABLE "MilkTrial" ADD CONSTRAINT "MilkTrial_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MilkTrial_productId_fkey') THEN
    ALTER TABLE "MilkTrial" ADD CONSTRAINT "MilkTrial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MilkSubscription_adminId_fkey') THEN
    ALTER TABLE "MilkSubscription" ADD CONSTRAINT "MilkSubscription_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MilkSubscription_productId_fkey') THEN
    ALTER TABLE "MilkSubscription" ADD CONSTRAINT "MilkSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MilkPayment_subscriptionId_fkey') THEN
    ALTER TABLE "MilkPayment" ADD CONSTRAINT "MilkPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MilkSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryBoyProfile_adminId_fkey') THEN
    ALTER TABLE "DeliveryBoyProfile" ADD CONSTRAINT "DeliveryBoyProfile_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryAvailability_deliveryBoyId_fkey') THEN
    ALTER TABLE "DeliveryAvailability" ADD CONSTRAINT "DeliveryAvailability_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryAssignment_deliveryBoyId_fkey') THEN
    ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAlert_userId_fkey') THEN
    ALTER TABLE "UserAlert" ADD CONSTRAINT "UserAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
