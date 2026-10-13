const prisma = require("../config/db");

/**
 * Get all coupons (Admin)
 */
const getAllCoupons = async () => {
  return prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Get active coupons for customer order checkout
 */
const getActiveCoupons = async () => {
  const now = new Date();
  return prisma.coupon.findMany({
    where: {
      status: "ACTIVE",
      isReferralReward: false,
      OR: [
        { validUntil: null },
        { validUntil: { gte: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Create a new coupon
 */
const createCoupon = async (data) => {
  const cleanCode = String(data.code || "").trim().toUpperCase();
  if (!cleanCode) {
    throw new Error("Coupon code is required.");
  }
  if (!data.discountType || !["PERCENTAGE", "FLAT"].includes(data.discountType)) {
    throw new Error("Discount type must be PERCENTAGE or FLAT.");
  }
  const val = parseFloat(data.value);
  if (isNaN(val) || val <= 0) {
    throw new Error("Discount value must be greater than 0.");
  }

  const existing = await prisma.coupon.findUnique({
    where: { code: cleanCode },
  });
  if (existing) {
    throw new Error(`Coupon with code "${cleanCode}" already exists.`);
  }

  return prisma.coupon.create({
    data: {
      code: cleanCode,
      description: data.description || "",
      discountType: data.discountType,
      value: val,
      minOrderAmount: data.minOrderAmount ? parseFloat(data.minOrderAmount) : 0,
      maxDiscount: data.maxDiscount ? parseFloat(data.maxDiscount) : null,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      status: data.status || "ACTIVE",
      targetProductName: data.targetProductName || "",
      usageLimit: data.usageLimit ? parseInt(data.usageLimit, 10) : null,
      isReferralReward: Boolean(data.isReferralReward),
    },
  });
};

/**
 * Update an existing coupon
 */
const updateCoupon = async (id, data) => {
  const couponId = parseInt(id, 10);
  const existing = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!existing) {
    throw new Error("Coupon not found.");
  }

  const updateData = {};
  if (data.code) updateData.code = String(data.code).trim().toUpperCase();
  if (data.description !== undefined) updateData.description = data.description;
  if (data.discountType) updateData.discountType = data.discountType;
  if (data.value !== undefined) updateData.value = parseFloat(data.value);
  if (data.minOrderAmount !== undefined) updateData.minOrderAmount = parseFloat(data.minOrderAmount) || 0;
  if (data.maxDiscount !== undefined) updateData.maxDiscount = data.maxDiscount ? parseFloat(data.maxDiscount) : null;
  if (data.validUntil !== undefined) updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null;
  if (data.status) updateData.status = data.status;
  if (data.targetProductName !== undefined) updateData.targetProductName = data.targetProductName;
  if (data.usageLimit !== undefined) updateData.usageLimit = data.usageLimit ? parseInt(data.usageLimit, 10) : null;
  if (data.isReferralReward !== undefined) updateData.isReferralReward = Boolean(data.isReferralReward);

  return prisma.coupon.update({
    where: { id: couponId },
    data: updateData,
  });
};

/**
 * Delete a coupon
 */
const deleteCoupon = async (id) => {
  const couponId = parseInt(id, 10);
  return prisma.coupon.delete({
    where: { id: couponId },
  });
};

/**
 * Get coupons assigned specifically to a user (e.g. from referrals)
 */
const getMyCoupons = async (userId) => {
  return prisma.userCoupon.findMany({
    where: {
      userId: parseInt(userId, 10),
      status: "ACTIVE",
    },
    include: {
      coupon: true,
    },
    orderBy: { assignedAt: "desc" },
  });
};

/**
 * Validate and apply a coupon for an order
 */
const validateCouponForOrder = async ({ code, userId = null, orderTotal = 0, productName = "" }) => {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, message: "Please enter a coupon code." };
  }

  let coupon = await prisma.coupon.findUnique({
    where: { code: cleanCode },
  });

  let isReferralCode = false;
  let referrerUser = null;

  if (!coupon) {
    // Check if cleanCode is a user referral code (e.g. CM-HARE246)
    referrerUser = await prisma.admin.findUnique({
      where: { referralCode: cleanCode },
    });

    if (referrerUser) {
      if (userId && parseInt(userId, 10) === referrerUser.id) {
        return {
          valid: false,
          message: "You cannot use your own referral code for discount.",
        };
      }

      isReferralCode = true;

      // Look up referral setting
      const setting = await prisma.referralSetting.findFirst({
        include: { refereeCoupon: true },
      });

      if (setting && !setting.isEnabled) {
        return {
          valid: false,
          message: "Referral discount program is currently paused.",
        };
      }

      const refereeCoupon = setting?.refereeCoupon;

      coupon = {
        id: refereeCoupon ? refereeCoupon.id : 99999,
        code: cleanCode,
        description: `Referral Discount via ${referrerUser.name}`,
        discountType: refereeCoupon?.discountType || "FLAT",
        value: refereeCoupon?.value || 50,
        minOrderAmount: refereeCoupon?.minOrderAmount || 0,
        maxDiscount: refereeCoupon?.maxDiscount || 50,
        status: "ACTIVE",
        targetProductName: refereeCoupon?.targetProductName || null,
        isReferralReward: false,
        isReferralCode: true,
        referrerId: referrerUser.id,
      };
    }
  }

  if (!coupon) {
    return { valid: false, message: `Coupon code "${cleanCode}" is invalid or does not exist.` };
  }

  if (coupon.status !== "ACTIVE") {
    return { valid: false, message: `Coupon "${cleanCode}" is currently inactive or expired.` };
  }

  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
    return { valid: false, message: `Coupon "${cleanCode}" expired on ${new Date(coupon.validUntil).toLocaleDateString()}.` };
  }

  // Check product restriction if set
  if (coupon.targetProductName && coupon.targetProductName !== "ALL") {
    if (!productName || productName.trim().toLowerCase() !== coupon.targetProductName.trim().toLowerCase()) {
      return {
        valid: false,
        message: `Coupon "${cleanCode}" is only valid for "${coupon.targetProductName}".`,
      };
    }
  }

  // Check minimum order amount
  if (coupon.minOrderAmount && orderTotal < coupon.minOrderAmount) {
    return {
      valid: false,
      message: `Minimum order amount of ₹${coupon.minOrderAmount} is required for this coupon.`,
    };
  }

  // If this is a personal referral coupon, verify user ownership (skip for direct referral codes)
  if (coupon.isReferralReward && userId && !coupon.isReferralCode) {
    const userCoupon = await prisma.userCoupon.findFirst({
      where: {
        userId: parseInt(userId, 10),
        couponId: coupon.id,
        status: "ACTIVE",
      },
    });
    if (!userCoupon) {
      return {
        valid: false,
        message: `This referral reward coupon "${cleanCode}" is not assigned to your account or has already been used.`,
      };
    }
  }

  // Calculate discount amount
  let discountAmount = 0;
  if (coupon.discountType === "PERCENTAGE") {
    discountAmount = (orderTotal * coupon.value) / 100;
    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }
  } else if (coupon.discountType === "FLAT") {
    discountAmount = Math.min(orderTotal, coupon.value);
  }

  return {
    valid: true,
    coupon,
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalAmount: Math.max(0, Math.round((orderTotal - discountAmount) * 100) / 100),
    isReferralCode,
    message: isReferralCode ? `Referral code "${cleanCode}" from ${referrerUser?.name} applied! 🎉` : undefined,
  };
};

/**
 * Mark coupon as redeemed when order is completed
 */
const redeemCoupon = async ({ code, userId, orderId = null }) => {
  const cleanCode = String(code || "").trim().toUpperCase();
  let coupon = await prisma.coupon.findUnique({ where: { code: cleanCode } });

  // If code is a referral code, look up referrer & referee coupon
  if (!coupon) {
    const referrerUser = await prisma.admin.findUnique({
      where: { referralCode: cleanCode },
    });
    if (referrerUser) {
      const setting = await prisma.referralSetting.findFirst({
        include: { refereeCoupon: true, referrerCoupon: true },
      });
      coupon = setting?.refereeCoupon || null;

      // Link referredBy if user not yet linked
      if (userId && parseInt(userId, 10) !== referrerUser.id) {
        await prisma.admin.updateMany({
          where: { id: parseInt(userId, 10), referredById: null },
          data: { referredById: referrerUser.id },
        });

        // Award referrer reward coupon if not already given
        if (setting?.referrerCouponId) {
          const alreadyRewarded = await prisma.userCoupon.findFirst({
            where: {
              userId: referrerUser.id,
              couponId: setting.referrerCouponId,
              source: "REFERRAL",
            },
          });
          if (!alreadyRewarded) {
            await prisma.userCoupon.create({
              data: {
                userId: referrerUser.id,
                couponId: setting.referrerCouponId,
                status: "ACTIVE",
                source: "REFERRAL",
              },
            });
          }
        }
      }
    }
  }

  if (!coupon) return null;

  // Increment redemption count if standard coupon
  if (coupon.id && coupon.id > 0) {
    try {
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { redemptionsCount: { increment: 1 } },
      });
    } catch (e) {
      console.warn("[couponService.redeemCoupon] could not increment count", e.message);
    }
  }

  // If assigned to user, mark user coupon as REDEEMED
  if (userId && coupon.id && coupon.id > 0) {
    const userCoupon = await prisma.userCoupon.findFirst({
      where: {
        userId: parseInt(userId, 10),
        couponId: coupon.id,
        status: "ACTIVE",
      },
    });
    if (userCoupon) {
      await prisma.userCoupon.update({
        where: { id: userCoupon.id },
        data: {
          status: "REDEEMED",
          redeemedAt: new Date(),
          orderId: orderId ? parseInt(orderId, 10) : null,
        },
      });
    }
  }

  return coupon;
};

module.exports = {
  getAllCoupons,
  getActiveCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getMyCoupons,
  validateCouponForOrder,
  redeemCoupon,
};
