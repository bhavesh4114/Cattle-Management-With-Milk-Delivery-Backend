const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../config/db");

const login = async (email, password) => {
  const admin = await prisma.admin.findUnique({
    where: { email },
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

const getProfile = async (id) => {
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
