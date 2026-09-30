const jwt = require("jsonwebtoken");

const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const prisma = require("../config/db");

    // Check if user still exists and is active in DB, and fetch latest permissions
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.id },
      include: {
        customRole: true
      }
    });

    if (!admin) {
      return res.status(401).json({ message: "Account no longer exists" });
    }

    if (admin.status === "Inactive") {
      return res.status(401).json({ message: "Account has been deactivated" });
    }

    // Use live permissions from DB instead of stale ones from token
    let livePermissions = [];
    if (admin.role === 'ADMIN') {
      livePermissions = ['*'];
    } else if (admin.customRole && admin.customRole.permissions) {
      livePermissions = admin.customRole.permissions;
    }

    req.admin = {
      ...decoded,
      permissions: livePermissions,
      role: admin.role
    };
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const requirePermission = (feature, action = null) => {
  return (req, res, next) => {
    // If the token wasn't parsed (authenticateAdmin wasn't called), block it.
    if (!req.admin) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Main admins have full access implicitly
    if (req.admin.role === 'ADMIN' || (req.admin.permissions && req.admin.permissions.includes('*'))) {
      return next();
    }

    const perms = req.admin.permissions || [];

    // If no action is provided, we just check the feature string
    if (!action) {
      if (perms.includes(feature)) {
        return next();
      }
    } else {
      // Check feature_action format
      const featureAction = `${feature}_${action}`;
      if (perms.includes(featureAction)) {
        return next();
      }

      // Fallback: If action is "view", allow if they have any permission for this feature
      if (action === "view") {
        if (perms.includes(feature) || perms.some(p => p.startsWith(`${feature}_`))) {
          return next();
        }
      }
    }

    return res.status(403).json({ message: "Forbidden: You do not have permission for this action" });
  };
};

module.exports = { authenticateAdmin, requirePermission };
