const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../config/db");

const login = async (email, password) => {
  if (!email || !password) {
    throw new Error("Invalid email or password");
  }

  console.log("[auth.login] querying admin");
  const admin = await prisma.admin.findUnique({
    where: { email },
    include: {
      customRole: true,
    },
  });

  if (!admin) {
    console.log("[auth.login] admin not found");
    throw new Error("Account does not exist");
  }

  if (admin.status === "Inactive") {
    console.log("[auth.login] inactive admin blocked", { adminId: admin.id });
    throw new Error("Your account has been deactivated. Please contact the administrator.");
  }

  console.log("[auth.login] comparing password", { adminId: admin.id });
  const isPasswordValid = await bcrypt.compare(password, admin.password);

  if (!isPasswordValid) {
    console.log("[auth.login] password mismatch", { adminId: admin.id });
    throw new Error("Invalid email or password");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("Auth configuration error: JWT_SECRET is not configured");
  }

  // Generate permissions list
  const permissions = admin.role === 'ADMIN' ? ['*'] : (admin.customRole?.permissions || []);

  console.log("[auth.login] signing token", { adminId: admin.id });
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

const getProfile = async (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Auth configuration error: JWT_SECRET is not configured");
  }

  const admin = await prisma.admin.findUnique({
    where: { id },
    include: {
      customRole: true,
    },
  });

  if (!admin) {
    throw new Error("Account does not exist");
  }

  const permissions = admin.role === 'ADMIN' ? ['*'] : (admin.customRole?.permissions || []);

  return { ...admin, permissions };
};

module.exports = {
  login,
  getProfile,
};
