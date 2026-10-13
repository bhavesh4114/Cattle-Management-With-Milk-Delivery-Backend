-- AlterTable
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "referralCode" TEXT,
ADD COLUMN IF NOT EXISTS "referredById" INTEGER;

-- AlterTable
ALTER TABLE "DeliveryAssignment" ADD COLUMN IF NOT EXISTS "arrivedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "customerConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "delayAlertSentAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveryCompletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveryConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveryStartTime" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "estimatedDeliveryTime" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "outForDeliveryAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "productCollectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Item" DROP COLUMN IF EXISTS "category",
DROP COLUMN IF EXISTS "quantity";

-- AlterTable
ALTER TABLE "MilkDeliveryRequest" ADD COLUMN IF NOT EXISTS "acceptedQuantity" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "assignedDeliveryBoyId" INTEGER,
ADD COLUMN IF NOT EXISTS "assignmentId" INTEGER,
ADD COLUMN IF NOT EXISTS "availableQuantity" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT,
ADD COLUMN IF NOT EXISTS "offeredQuantity" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MilkRecord" DROP COLUMN IF EXISTS "liters",
DROP COLUMN IF EXISTS "milkedAt",
DROP COLUMN IF EXISTS "shift";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN IF EXISTS "amount",
DROP COLUMN IF EXISTS "customer",
DROP COLUMN IF EXISTS "itemName",
DROP COLUMN IF EXISTS "orderedAt",
DROP COLUMN IF EXISTS "quantity",
DROP COLUMN IF EXISTS "status";

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderFeedback" (
    "id" SERIAL NOT NULL,
    "orderType" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "deliveryBoyId" INTEGER,
    "rating" INTEGER NOT NULL,
    "deliveryBoyRating" INTEGER,
    "productQualityRating" INTEGER,
    "review" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerComplaint" (
    "id" SERIAL NOT NULL,
    "complaintCode" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "deliveryBoyId" INTEGER,
    "assignedStaffId" INTEGER,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ComplaintStatusHistory" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "actionBy" TEXT NOT NULL,
    "changedById" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatConversation" (
    "id" SERIAL NOT NULL,
    "participantId" INTEGER NOT NULL,
    "participantRole" TEXT NOT NULL,
    "adminId" INTEGER,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "senderRole" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryProof" (
    "id" SERIAL NOT NULL,
    "orderType" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "assignmentId" INTEGER,
    "customerId" INTEGER,
    "customerName" TEXT,
    "deliveryBoyId" INTEGER NOT NULL,
    "deliveryBoyName" TEXT,
    "productId" INTEGER,
    "productName" TEXT,
    "itemLabel" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "photoUrl" TEXT NOT NULL,
    "qrToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "minOrderAmount" DOUBLE PRECISION DEFAULT 0,
    "maxDiscount" DOUBLE PRECISION,
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "targetProductName" TEXT,
    "usageLimit" INTEGER,
    "redemptionsCount" INTEGER NOT NULL DEFAULT 0,
    "isReferralReward" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserCoupon" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "couponId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'REFERRAL',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "orderId" INTEGER,

    CONSTRAINT "UserCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReferralSetting" (
    "id" SERIAL NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardTarget" TEXT NOT NULL DEFAULT 'BOTH',
    "referrerCouponId" INTEGER,
    "refereeCouponId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Referral" (
    "id" SERIAL NOT NULL,
    "referrerId" INTEGER NOT NULL,
    "refereeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "referrerRewardStatus" TEXT NOT NULL DEFAULT 'NONE',
    "refereeRewardStatus" TEXT NOT NULL DEFAULT 'NONE',
    "referrerCouponCode" TEXT,
    "refereeCouponCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderFeedback_customerId_idx" ON "OrderFeedback"("customerId");
CREATE INDEX IF NOT EXISTS "OrderFeedback_deliveryBoyId_idx" ON "OrderFeedback"("deliveryBoyId");
CREATE INDEX IF NOT EXISTS "OrderFeedback_rating_idx" ON "OrderFeedback"("rating");
CREATE UNIQUE INDEX IF NOT EXISTS "OrderFeedback_orderType_orderId_key" ON "OrderFeedback"("orderType", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerComplaint_complaintCode_key" ON "CustomerComplaint"("complaintCode");
CREATE INDEX IF NOT EXISTS "CustomerComplaint_customerId_idx" ON "CustomerComplaint"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerComplaint_status_idx" ON "CustomerComplaint"("status");
CREATE INDEX IF NOT EXISTS "CustomerComplaint_orderType_orderId_idx" ON "CustomerComplaint"("orderType", "orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComplaintStatusHistory_complaintId_idx" ON "ComplaintStatusHistory"("complaintId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_participantRole_idx" ON "ChatConversation"("participantRole");
CREATE INDEX IF NOT EXISTS "ChatConversation_lastMessageAt_idx" ON "ChatConversation"("lastMessageAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversation_participantId_participantRole_key" ON "ChatConversation"("participantId", "participantRole");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");
CREATE INDEX IF NOT EXISTS "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");
CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryProof_orderType_orderId_idx" ON "DeliveryProof"("orderType", "orderId");
CREATE INDEX IF NOT EXISTS "DeliveryProof_assignmentId_idx" ON "DeliveryProof"("assignmentId");
CREATE INDEX IF NOT EXISTS "DeliveryProof_deliveryBoyId_idx" ON "DeliveryProof"("deliveryBoyId");
CREATE INDEX IF NOT EXISTS "DeliveryProof_customerId_idx" ON "DeliveryProof"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX IF NOT EXISTS "Coupon_status_idx" ON "Coupon"("status");
CREATE INDEX IF NOT EXISTS "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserCoupon_userId_status_idx" ON "UserCoupon"("userId", "status");
CREATE INDEX IF NOT EXISTS "UserCoupon_couponId_idx" ON "UserCoupon"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_refereeId_key" ON "Referral"("refereeId");
CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId");
CREATE INDEX IF NOT EXISTS "Referral_refereeId_idx" ON "Referral"("refereeId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Admin_referralCode_key" ON "Admin"("referralCode");

-- AddForeignKey
ALTER TABLE "Admin" DROP CONSTRAINT IF EXISTS "Admin_referredById_fkey";
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFeedback" DROP CONSTRAINT IF EXISTS "OrderFeedback_customerId_fkey";
ALTER TABLE "OrderFeedback" ADD CONSTRAINT "OrderFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFeedback" DROP CONSTRAINT IF EXISTS "OrderFeedback_deliveryBoyId_fkey";
ALTER TABLE "OrderFeedback" ADD CONSTRAINT "OrderFeedback_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerComplaint" DROP CONSTRAINT IF EXISTS "CustomerComplaint_customerId_fkey";
ALTER TABLE "CustomerComplaint" ADD CONSTRAINT "CustomerComplaint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerComplaint" DROP CONSTRAINT IF EXISTS "CustomerComplaint_deliveryBoyId_fkey";
ALTER TABLE "CustomerComplaint" ADD CONSTRAINT "CustomerComplaint_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerComplaint" DROP CONSTRAINT IF EXISTS "CustomerComplaint_assignedStaffId_fkey";
ALTER TABLE "CustomerComplaint" ADD CONSTRAINT "CustomerComplaint_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintStatusHistory" DROP CONSTRAINT IF EXISTS "ComplaintStatusHistory_complaintId_fkey";
ALTER TABLE "ComplaintStatusHistory" ADD CONSTRAINT "ComplaintStatusHistory_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "CustomerComplaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintStatusHistory" DROP CONSTRAINT IF EXISTS "ComplaintStatusHistory_changedById_fkey";
ALTER TABLE "ComplaintStatusHistory" ADD CONSTRAINT "ComplaintStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" DROP CONSTRAINT IF EXISTS "ChatConversation_participantId_fkey";
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" DROP CONSTRAINT IF EXISTS "ChatConversation_adminId_fkey";
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_conversationId_fkey";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_senderId_fkey";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" DROP CONSTRAINT IF EXISTS "UserCoupon_userId_fkey";
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" DROP CONSTRAINT IF EXISTS "UserCoupon_couponId_fkey";
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralSetting" DROP CONSTRAINT IF EXISTS "ReferralSetting_referrerCouponId_fkey";
ALTER TABLE "ReferralSetting" ADD CONSTRAINT "ReferralSetting_referrerCouponId_fkey" FOREIGN KEY ("referrerCouponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralSetting" DROP CONSTRAINT IF EXISTS "ReferralSetting_refereeCouponId_fkey";
ALTER TABLE "ReferralSetting" ADD CONSTRAINT "ReferralSetting_refereeCouponId_fkey" FOREIGN KEY ("refereeCouponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT IF EXISTS "Referral_referrerId_fkey";
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT IF EXISTS "Referral_refereeId_fkey";
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
