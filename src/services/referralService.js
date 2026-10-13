const prisma = require("../config/db");
const crypto = require("crypto");

/**
 * Generates a clean, unique referral code like CM-BHA78A
 */
const generateUniqueReferralCode = async (userName = "") => {
  const cleanPrefix = String(userName || "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase();
  const prefix = cleanPrefix.length >= 2 ? cleanPrefix : "CM";

  for (let attempts = 0; attempts < 10; attempts++) {
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    const candidate = `CM-${prefix}${randomHex}`.slice(0, 10);
    const existing = await prisma.admin.findUnique({
      where: { referralCode: candidate },
    });
    if (!existing) {
      return candidate;
    }
  }

  // Fallback guaranteed random code
  return `CM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
};

/**
 * Backfills unique referral codes for any existing users missing one
 */
const backfillExistingUsers = async () => {
  try {
    const usersWithoutCode = await prisma.admin.findMany({
      where: { referralCode: null },
      select: { id: true, name: true },
    });

    for (const u of usersWithoutCode) {
      const code = await generateUniqueReferralCode(u.name);
      await prisma.admin.update({
        where: { id: u.id },
        data: { referralCode: code },
      });
    }
  } catch (err) {
    console.error("[referralService.backfillExistingUsers] Error:", err.message);
  }
};

/**
 * Seed initial coupons and referral reward settings if not already present
 */
const initDefaultCouponsAndSettings = async () => {
  try {
    // 1. Check / Seed Default Referral Reward Coupons
    let refCoupon = await prisma.coupon.findUnique({ where: { code: "REF50" } });
    if (!refCoupon) {
      refCoupon = await prisma.coupon.create({
        data: {
          code: "REF50",
          description: "₹50 Instant Welcome Discount for New Referred Customer",
          discountType: "FLAT",
          value: 50,
          minOrderAmount: 200,
          maxDiscount: 50,
          status: "ACTIVE",
          isReferralReward: true,
        },
      });
    }

    let friendCoupon = await prisma.coupon.findUnique({ where: { code: "FRIEND100" } });
    if (!friendCoupon) {
      friendCoupon = await prisma.coupon.create({
        data: {
          code: "FRIEND100",
          description: "₹100 Referral Reward Discount for Existing Referrer Friend",
          discountType: "FLAT",
          value: 100,
          minOrderAmount: 500,
          maxDiscount: 100,
          status: "ACTIVE",
          isReferralReward: true,
        },
      });
    }

    // Seed other standard coupons from DiscountAdmin if empty
    const couponCount = await prisma.coupon.count();
    if (couponCount <= 2) {
      const standardCoupons = [
        { code: "WELCOME50", description: "50% Off on First Order", discountType: "PERCENTAGE", value: 50, minOrderAmount: 100, maxDiscount: 150 },
        { code: "FRESH10", description: "10% Off on Monthly Milk Subscriptions", discountType: "PERCENTAGE", value: 10, minOrderAmount: 1500, maxDiscount: 300, targetProductName: "Cow Milk" },
        { code: "DIWALI100", description: "Flat ₹100 Off on Bulk Orders", discountType: "FLAT", value: 100, minOrderAmount: 800, maxDiscount: 100 },
      ];
      for (const sc of standardCoupons) {
        const exists = await prisma.coupon.findUnique({ where: { code: sc.code } });
        if (!exists) {
          await prisma.coupon.create({
            data: { ...sc, status: "ACTIVE", isReferralReward: false },
          });
        }
      }
    }

    // 2. Check / Seed Referral Setting
    const existingSetting = await prisma.referralSetting.findFirst();
    if (!existingSetting) {
      await prisma.referralSetting.create({
        data: {
          isEnabled: true,
          rewardTarget: "BOTH",
          refereeCouponId: refCoupon.id,
          referrerCouponId: friendCoupon.id,
        },
      });
    }
  } catch (err) {
    console.error("[referralService.initDefaultCouponsAndSettings] Error:", err.message);
  }
};

/**
 * Validate a referral code provided during registration or checkout
 */
const validateReferralCode = async (rawCode, currentUserId = null) => {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) {
    return { valid: false, message: "Referral code is required for validation." };
  }

  const referrer = await prisma.admin.findUnique({
    where: { referralCode: code },
    select: { id: true, name: true, email: true, status: true },
  });

  if (!referrer) {
    return { valid: false, message: `Referral code "${code}" is invalid or does not exist.` };
  }

  if (referrer.status === "Inactive") {
    return { valid: false, message: "The referrer account associated with this code is inactive." };
  }

  if (currentUserId && referrer.id === currentUserId) {
    return { valid: false, message: "You cannot refer yourself." };
  }

  return { valid: true, referrer };
};

/**
 * Process referral linking and assign coupon rewards upon new user registration
 */
const processReferralOnRegister = async ({ newUserId, referralCode, tx = prisma }) => {
  if (!referralCode || !referralCode.trim()) {
    return null;
  }

  const cleanCode = referralCode.trim().toUpperCase();
  const validation = await validateReferralCode(cleanCode, newUserId);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const referrer = validation.referrer;

  // Check if this new user has already been referred
  const alreadyReferred = await tx.referral.findUnique({
    where: { refereeId: newUserId },
  });
  if (alreadyReferred) {
    throw new Error("This account has already used a referral attribution.");
  }

  // Update new user's referredById
  await tx.admin.update({
    where: { id: newUserId },
    data: { referredById: referrer.id },
  });

  // Fetch Referral Setting
  const setting = await tx.referralSetting.findFirst({
    include: {
      refereeCoupon: true,
      referrerCoupon: true,
    },
  });

  let refereeRewardStatus = "NONE";
  let referrerRewardStatus = "NONE";
  let refereeCouponCode = null;
  let referrerCouponCode = null;

  if (setting && setting.isEnabled) {
    // 1. Assign reward to Referee (New User)
    if (
      (setting.rewardTarget === "BOTH" || setting.rewardTarget === "REFEREE") &&
      setting.refereeCoupon &&
      setting.refereeCoupon.status === "ACTIVE"
    ) {
      await tx.userCoupon.create({
        data: {
          userId: newUserId,
          couponId: setting.refereeCoupon.id,
          status: "ACTIVE",
          source: "REFERRAL",
        },
      });
      refereeRewardStatus = "AWARDED";
      refereeCouponCode = setting.refereeCoupon.code;
    }

    // 2. Assign reward to Referrer (Existing User)
    if (
      (setting.rewardTarget === "BOTH" || setting.rewardTarget === "REFERRER") &&
      setting.referrerCoupon &&
      setting.referrerCoupon.status === "ACTIVE"
    ) {
      await tx.userCoupon.create({
        data: {
          userId: referrer.id,
          couponId: setting.referrerCoupon.id,
          status: "ACTIVE",
          source: "REFERRAL",
        },
      });
      referrerRewardStatus = "AWARDED";
      referrerCouponCode = setting.referrerCoupon.code;
    }
  }

  // Record audit log
  const referralRecord = await tx.referral.create({
    data: {
      referrerId: referrer.id,
      refereeId: newUserId,
      status: setting?.isEnabled ? "COMPLETED" : "NO_REWARD",
      referrerRewardStatus,
      refereeRewardStatus,
      referrerCouponCode,
      refereeCouponCode,
    },
  });

  return referralRecord;
};

/**
 * Get Admin Referral Policy Settings
 */
const getReferralSettings = async () => {
  await initDefaultCouponsAndSettings();
  const setting = await prisma.referralSetting.findFirst({
    include: {
      refereeCoupon: true,
      referrerCoupon: true,
    },
  });
  return setting;
};

/**
 * Update Admin Referral Policy Settings
 */
const updateReferralSettings = async ({ isEnabled, rewardTarget, referrerCouponId, refereeCouponId }) => {
  let setting = await prisma.referralSetting.findFirst();
  const data = {
    isEnabled: Boolean(isEnabled),
    rewardTarget: rewardTarget || "BOTH",
    referrerCouponId: referrerCouponId ? parseInt(referrerCouponId, 10) : null,
    refereeCouponId: refereeCouponId ? parseInt(refereeCouponId, 10) : null,
  };

  if (setting) {
    setting = await prisma.referralSetting.update({
      where: { id: setting.id },
      data,
      include: { refereeCoupon: true, referrerCoupon: true },
    });
  } else {
    setting = await prisma.referralSetting.create({
      data,
      include: { refereeCoupon: true, referrerCoupon: true },
    });
  }

  return setting;
};

/**
 * Get all referrals report for Admin
 */
const getAllReferrals = async (searchTerm = "") => {
  const where = {};
  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.trim();
    where.OR = [
      { referrer: { name: { contains: term, mode: "insensitive" } } },
      { referrer: { email: { contains: term, mode: "insensitive" } } },
      { referee: { name: { contains: term, mode: "insensitive" } } },
      { referee: { email: { contains: term, mode: "insensitive" } } },
      { referrerCouponCode: { contains: term, mode: "insensitive" } },
      { refereeCouponCode: { contains: term, mode: "insensitive" } },
    ];
  }

  const list = await prisma.referral.findMany({
    where,
    include: {
      referrer: { select: { id: true, name: true, email: true, referralCode: true } },
      referee: { select: { id: true, name: true, email: true, referralCode: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Calculate stats
  const total = await prisma.referral.count();
  const successful = await prisma.referral.count({
    where: { status: "COMPLETED" },
  });
  const rewardsCount = await prisma.userCoupon.count({
    where: { source: "REFERRAL" },
  });

  return {
    referrals: list,
    stats: {
      totalReferrals: total,
      successfulConversions: successful,
      rewardsDistributed: rewardsCount,
    },
  };
};

/**
 * Get current user's referral details, stats and assigned coupons
 */
const getUserReferralInfo = async (userId) => {
  let user = await prisma.admin.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, referralCode: true },
  });

  // Ensure user has a referral code
  if (user && !user.referralCode) {
    const newCode = await generateUniqueReferralCode(user.name);
    user = await prisma.admin.update({
      where: { id: userId },
      data: { referralCode: newCode },
      select: { id: true, name: true, email: true, referralCode: true },
    });
  }

  const referralsCount = await prisma.referral.count({
    where: { referrerId: userId },
  });

  const assignedCoupons = await prisma.userCoupon.findMany({
    where: { userId },
    include: { coupon: true },
    orderBy: { assignedAt: "desc" },
  });

  const myReferrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: {
      referrer: { select: { id: true, name: true, email: true, referralCode: true } },
      referee: { select: { id: true, name: true, email: true, referralCode: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    referralCode: user?.referralCode,
    totalReferrals: referralsCount,
    assignedCoupons,
    referrals: myReferrals,
  };
};

module.exports = {
  generateUniqueReferralCode,
  backfillExistingUsers,
  initDefaultCouponsAndSettings,
  validateReferralCode,
  processReferralOnRegister,
  getReferralSettings,
  updateReferralSettings,
  getAllReferrals,
  getUserReferralInfo,
};
