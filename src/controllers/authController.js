const authService = require("../services/authService");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("[auth.login] request received", {
      emailProvided: Boolean(email),
      passwordProvided: Boolean(password),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
      nodeEnv: process.env.NODE_ENV || "development",
    });

    const { token, admin } = await authService.login(email, password);

    res.json({
      message: "Login successful",
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        referralCode: admin.referralCode,
        permissions: admin.role === 'ADMIN' ? ['*'] : (admin.customRole?.permissions || []),
        customRole: admin.customRole,
      },
    });
  } catch (error) {
    if (error.message === "Invalid email or password" || error.message === "Account does not exist") {
      res.status(401).json({ message: error.message });
    } else if (error.message === "Your account has been deactivated. Please contact the administrator.") {
      res.status(403).json({ message: error.message });
    } else {
      console.error("[auth.login] unexpected failure", {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      res.status(500).json({ message: "Login failed" });
    }
  }
};

const getProfile = async (req, res) => {
  try {
    const admin = await authService.getProfile(req.admin.id);
    res.json({
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        referralCode: admin.referralCode,
        referredBy: admin.referredBy,
        status: admin.status,
        createdAt: admin.createdAt,
        permissions: admin.permissions,
        customRole: admin.customRole,
      },
    });
  } catch (error) {
    console.error("[auth.profile] unexpected failure", {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to load profile" });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required." });
    }
    const result = await authService.register({ name, email, password, referralCode });
    res.status(201).json({
      message: "Registration successful!",
      token: result.token,
      admin: result.admin,
    });
  } catch (error) {
    if (error.message.includes("already registered") || error.message.includes("required") || error.message.includes("least 6 characters")) {
      res.status(400).json({ message: error.message });
    } else {
      console.error("[auth.register] unexpected failure", error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  }
};

module.exports = {
  login,
  getProfile,
  register,
};
