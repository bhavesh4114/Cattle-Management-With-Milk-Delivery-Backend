-- QR based delivery confirmation support
ALTER TABLE "Admin"
ADD COLUMN IF NOT EXISTS "doorQrToken" TEXT,
ADD COLUMN IF NOT EXISTS "isQrEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_doorQrToken_key" ON "Admin"("doorQrToken");

ALTER TABLE "DeliveryAssignment"
ADD COLUMN IF NOT EXISTS "qrScannedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "userConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "selectedItems" JSONB,
ADD COLUMN IF NOT EXISTS "confirmationIssue" TEXT;

ALTER TABLE "UserAlert"
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN IF NOT EXISTS "orderType" TEXT,
ADD COLUMN IF NOT EXISTS "orderId" INTEGER,
ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE TABLE IF NOT EXISTS "DeliveryHistory" (
    "id" SERIAL NOT NULL,
    "orderType" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "userId" INTEGER,
    "deliveryBoyId" INTEGER,
    "qrToken" TEXT,
    "qrScannedAt" TIMESTAMP(3),
    "itemsSelected" JSONB,
    "userConfirmationAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryHistory_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryHistory_userId_fkey'
  ) THEN
    ALTER TABLE "DeliveryHistory"
    ADD CONSTRAINT "DeliveryHistory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
