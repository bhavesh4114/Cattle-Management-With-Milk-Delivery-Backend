-- AlterTable DeliveryAssignment
ALTER TABLE "DeliveryAssignment"
ADD COLUMN IF NOT EXISTS "previousDeliveryBoyId" INTEGER,
ADD COLUMN IF NOT EXISTS "needsReassignment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "reassignmentReason" TEXT;

-- CreateTable DeliveryBoyLeave
CREATE TABLE IF NOT EXISTS "DeliveryBoyLeave" (
    "id" SERIAL NOT NULL,
    "deliveryBoyId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryBoyLeave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryBoyLeave_deliveryBoyId_status_idx" ON "DeliveryBoyLeave"("deliveryBoyId", "status");
CREATE INDEX IF NOT EXISTS "DeliveryBoyLeave_startDate_endDate_idx" ON "DeliveryBoyLeave"("startDate", "endDate");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryBoyLeave_deliveryBoyId_fkey'
  ) THEN
    ALTER TABLE "DeliveryBoyLeave"
    ADD CONSTRAINT "DeliveryBoyLeave_deliveryBoyId_fkey"
    FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryBoyLeave_approvedById_fkey'
  ) THEN
    ALTER TABLE "DeliveryBoyLeave"
    ADD CONSTRAINT "DeliveryBoyLeave_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
