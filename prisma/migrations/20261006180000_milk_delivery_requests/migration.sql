-- CreateTable MilkDeliveryRequest
CREATE TABLE IF NOT EXISTS "MilkDeliveryRequest" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "subscriptionId" INTEGER,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "requestType" TEXT NOT NULL,
    "regularQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkDeliveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MilkDeliveryRequest_customerId_deliveryDate_idx" ON "MilkDeliveryRequest"("customerId", "deliveryDate");
CREATE INDEX IF NOT EXISTS "MilkDeliveryRequest_status_deliveryDate_idx" ON "MilkDeliveryRequest"("status", "deliveryDate");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MilkDeliveryRequest_customerId_fkey'
  ) THEN
    ALTER TABLE "MilkDeliveryRequest"
    ADD CONSTRAINT "MilkDeliveryRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MilkDeliveryRequest_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "MilkDeliveryRequest"
    ADD CONSTRAINT "MilkDeliveryRequest_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "MilkSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MilkDeliveryRequest_approvedById_fkey'
  ) THEN
    ALTER TABLE "MilkDeliveryRequest"
    ADD CONSTRAINT "MilkDeliveryRequest_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
