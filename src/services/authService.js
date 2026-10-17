const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../config/db");

const login = async (email, password) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error("Invalid email or password");
  }

  const admin = await prisma.admin.findUnique({
    where: { email: cleanEmail },
    include: {
      customRole: true,
    },
  });

  if (!admin) {
    throw new Error("Account does not exist");
  }

  if (admin.status === "Inactive") {
    throw new Error("Your account has been deactivated. Please contact the administrator.");
  }

  const isPasswordValid = await bcrypt.compare(password, admin.password);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("Auth configuration error: JWT_SECRET is not configured");
  }

  // Generate permissions list
  const permissions = admin.role === 'ADMIN' ? ['*'] : (admin.customRole?.permissions || []);

  const token = jwt.sign(
    {
      id: admin.id,
      role: admin.role,
      permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

  return { token, admin: { ...admin, permissions } };
};

const referralService = require("./referralService");

const getProfile = async (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Auth configuration error: JWT_SECRET is not configured");
  }

  let admin = await prisma.admin.findUnique({
    where: { id },
    include: {
      customRole: true,
      referredBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!admin) {
    throw new Error("Account does not exist");
  }

  // Ensure user has a unique referral code
  if (!admin.referralCode) {
    const code = await referralService.generateUniqueReferralCode(admin.name);
    admin = await prisma.admin.update({
      where: { id },
      data: { referralCode: code },
      include: {
        customRole: true,
        referredBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  const permissions = admin.role === 'ADMIN' ? ['*'] : (admin.customRole?.permissions || []);

  return { ...admin, permissions };
};

const register = async ({ name, email, password, referralCode }) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanReferral = String(referralCode || "").trim().toUpperCase();

  if (!cleanName) {
    throw new Error("Full name is required.");
  }
  if (!cleanEmail) {
    throw new Error("Email address is required.");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  // Check if account already exists
  const existing = await prisma.admin.findUnique({
    where: { email: cleanEmail },
  });

  if (existing) {
    throw new Error("An account with this email is already registered. Please log in.");
  }

  // Pre-validate referral code if provided
  let referrer = null;
  if (cleanReferral) {
    const validation = await referralService.validateReferralCode(cleanReferral);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    referrer = validation.referrer;
  }

  // Find User role
  let userRole = await prisma.customRole.findFirst({
    where: { name: { equals: "User", mode: "insensitive" } },
  });
  if (!userRole) {
    userRole = await prisma.customRole.findFirst({
      where: { name: { contains: "User", mode: "insensitive" } },
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const crypto = require("crypto");
  const doorQrToken = crypto.randomBytes(32).toString("hex");
  const userReferralCode = await referralService.generateUniqueReferralCode(cleanName);

  // Run user creation & referral processing in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const newAdmin = await tx.admin.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        password: hashedPassword,
        role: "CUSTOM",
        customRoleId: userRole ? userRole.id : null,
        status: "Active",
        doorQrToken,
        isQrEnabled: true,
        referralCode: userReferralCode,
        referredById: referrer ? referrer.id : null,
      },
      include: {
        customRole: true,
      },
    });

    if (cleanReferral) {
      await referralService.processReferralOnRegister({
        newUserId: newAdmin.id,
        referralCode: cleanReferral,
        tx,
      });
    }

    return newAdmin;
  });

  if (!process.env.JWT_SECRET) {
    throw new Error("Auth configuration error: JWT_SECRET is not configured");
  }

  const permissions = result.role === "ADMIN" ? ["*"] : (result.customRole?.permissions || []);

  const token = jwt.sign(
    {
      id: result.id,
      role: result.role,
      permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return {
    token,
    admin: {
      id: result.id,
      name: result.name,
      email: result.email,
      role: result.role,
      referralCode: result.referralCode,
      permissions,
      customRole: result.customRole,
    },
  };
};

module.exports = {
  login,
  getProfile,
  register,
};

