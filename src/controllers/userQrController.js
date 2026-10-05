const crypto = require("crypto");
const prisma = require("../config/db");

const makeQrToken = () => crypto.randomBytes(32).toString("hex");

const canManageUserQr = (req, userId) => {
  return req.admin?.role === "ADMIN" || req.admin?.id === userId;
};

const ensureQrToken = async (userId) => {
  const user = await prisma.admin.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, doorQrToken: true, isQrEnabled: true },
  });

  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  if (user.doorQrToken) return user;

  let updated = null;
  for (let i = 0; i < 3 && !updated; i++) {
    try {
      updated = await prisma.admin.update({
        where: { id: userId },
        data: { doorQrToken: makeQrToken(), isQrEnabled: true },
        select: { id: true, name: true, email: true, doorQrToken: true, isQrEnabled: true },
      });
    } catch (error) {
      if (error.code !== "P2002") throw error;
    }
  }

  if (!updated) throw new Error("Unable to generate QR token");
  return updated;
};

exports.generateUserQr = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!canManageUserQr(req, userId)) {
      return res.status(403).json({ message: "You cannot manage this QR code." });
    }

    const user = await ensureQrToken(userId);
    res.json({
      message: "QR code ready",
      user: { id: user.id, name: user.name, email: user.email },
      qrToken: user.doorQrToken,
      isQrEnabled: user.isQrEnabled,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Failed to generate QR" });
  }
};

exports.getUserQr = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!canManageUserQr(req, userId)) {
      return res.status(403).json({ message: "You cannot view this QR code." });
    }

    const user = await ensureQrToken(userId);
    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      qrToken: user.doorQrToken,
      isQrEnabled: user.isQrEnabled,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Failed to load QR" });
  }
};
