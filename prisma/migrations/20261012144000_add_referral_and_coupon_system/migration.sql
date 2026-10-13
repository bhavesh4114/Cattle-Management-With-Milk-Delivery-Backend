-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" INTEGER;

-- AlterTable
ALTER TABLE "DeliveryAssignment" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "assignedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "customerConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "delayAlertSentAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCompletedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryStartTime" TIMESTAMP(3),
ADD COLUMN     "estimatedDeliveryTime" TIMESTAMP(3),
ADD COLUMN     "outForDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "productCollectedAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryBoyLeave" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryBoyProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryHistory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Item" DROP COLUMN IF EXISTS "category",
DROP COLUMN IF EXISTS "quantity";

-- AlterTable
ALTER TABLE "MilkDeliveryRequest" ADD COLUMN     "acceptedQuantity" DOUBLE PRECISION,
ADD COLUMN     "assignedDeliveryBoyId" INTEGER,
ADD COLUMN     "assignmentId" INTEGER,
ADD COLUMN     "availableQuantity" DOUBLE PRECISION,
ADD COLUMN     "deliveryStatus" TEXT,
ADD COLUMN     "offeredQuantity" DOUBLE PRECISION,
ALTER COLUMN "status" SET DEFAULT 'EXTRA_REQUESTED',
ALTER COLUMN "updatedAt" DROP DEFAULT;

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
DROP COLUMN IF EXISTS "status",
ALTER COLUMN "vendorName" DROP DEFAULT;

-- CreateTable
CREATE TABLE "OrderFeedback" (
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
CREATE TABLE "CustomerComplaint" (
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
CREATE TABLE "ComplaintStatusHistory" (
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
CREATE TABLE "ChatConversation" (
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
CREATE TABLE "ChatMessage" (
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
CREATE TABLE "DeliveryProof" (
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
CREATE TABLE "Coupon" (
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
CREATE TABLE "UserCoupon" (
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
CREATE TABLE "ReferralSetting" (
    "id" SERIAL NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardTarget" TEXT NOT NULL DEFAULT 'BOTH',
    "referrerCouponId" INTEGER,
    "refereeCouponId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
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
CREATE INDEX "OrderFeedback_customerId_idx" ON "OrderFeedback"("customerId");

-- CreateIndex
CREATE INDEX "OrderFeedback_deliveryBoyId_idx" ON "OrderFeedback"("deliveryBoyId");

-- CreateIndex
CREATE INDEX "OrderFeedback_rating_idx" ON "OrderFeedback"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFeedback_orderType_orderId_key" ON "OrderFeedback"("orderType", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerComplaint_complaintCode_key" ON "CustomerComplaint"("complaintCode");

-- CreateIndex
CREATE INDEX "CustomerComplaint_customerId_idx" ON "CustomerComplaint"("customerId");

-- CreateIndex
CREATE INDEX "CustomerComplaint_status_idx" ON "CustomerComplaint"("status");

-- CreateIndex
CREATE INDEX "CustomerComplaint_orderType_orderId_idx" ON "CustomerComplaint"("orderType", "orderId");

-- CreateIndex
CREATE INDEX "ComplaintStatusHistory_complaintId_idx" ON "ComplaintStatusHistory"("complaintId");

-- CreateIndex
CREATE INDEX "ChatConversation_participantRole_idx" ON "ChatConversation"("participantRole");

-- CreateIndex
CREATE INDEX "ChatConversation_lastMessageAt_idx" ON "ChatConversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_participantId_participantRole_key" ON "ChatConversation"("participantId", "participantRole");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "DeliveryProof_orderType_orderId_idx" ON "DeliveryProof"("orderType", "orderId");

-- CreateIndex
CREATE INDEX "DeliveryProof_assignmentId_idx" ON "DeliveryProof"("assignmentId");

-- CreateIndex
CREATE INDEX "DeliveryProof_deliveryBoyId_idx" ON "DeliveryProof"("deliveryBoyId");

-- CreateIndex
CREATE INDEX "DeliveryProof_customerId_idx" ON "DeliveryProof"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_status_idx" ON "Coupon"("status");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "UserCoupon_userId_status_idx" ON "UserCoupon"("userId", "status");

-- CreateIndex
CREATE INDEX "UserCoupon_couponId_idx" ON "UserCoupon"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Referral_refereeId_idx" ON "Referral"("refereeId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_referralCode_key" ON "Admin"("referralCode");

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFeedback" ADD CONSTRAINT "OrderFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFeedback" ADD CONSTRAINT "OrderFeedback_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerComplaint" ADD CONSTRAINT "CustomerComplaint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerComplaint" ADD CONSTRAINT "CustomerComplaint_deliveryBoyId_fkey" FOREIGN KEY ("deliveryBoyId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerComplaint" ADD CONSTRAINT "CustomerComplaint_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintStatusHistory" ADD CONSTRAINT "ComplaintStatusHistory_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "CustomerComplaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintStatusHistory" ADD CONSTRAINT "ComplaintStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralSetting" ADD CONSTRAINT "ReferralSetting_referrerCouponId_fkey" FOREIGN KEY ("referrerCouponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralSetting" ADD CONSTRAINT "ReferralSetting_refereeCouponId_fkey" FOREIGN KEY ("refereeCouponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

