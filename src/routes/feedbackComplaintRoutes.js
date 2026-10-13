const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const controller = require("../controllers/feedbackComplaintController");
const { authenticateAdmin } = require("../middleware/auth");

const router = express.Router();

const os = require("os");

// Safely resolve upload directory (use os.tmpdir() on Vercel/serverless to avoid read-only /var/task)
const getUploadDir = () => {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const dir = isServerless
    ? path.join(os.tmpdir(), "uploads", "complaints")
    : path.join(__dirname, "../../uploads/complaints");

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn("[feedbackComplaintRoutes] Notice: could not create upload dir:", err.message);
  }
  return dir;
};

// Ensure directory exists without crashing on module import
const uploadDir = getUploadDir();

// Configure multer for complaint attachments
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = getUploadDir();
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, "_");
    cb(null, `${Date.now()}_${cleanName}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and WebP image formats are allowed as attachments."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware for multer error handling
const handleUpload = (req, res, next) => {
  upload.single("attachment")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Attachment file size exceeds the 5MB limit." });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

// Admin authorization middleware
const requireAdminOrStaff = (req, res, next) => {
  if (req.admin.role === "ADMIN") return next();
  const roleName = (req.admin.customRole?.name || "").toLowerCase();
  const isDeliveryBoy =
    roleName.includes("delivery") ||
    roleName.includes("delever") ||
    req.admin.permissions?.some((p) => String(p).toLowerCase().includes("deliver"));

  if (isDeliveryBoy) {
    return res.status(403).json({ message: "Forbidden: Delivery personnel cannot manage complaints." });
  }

  // Any non-delivery-boy staff or admin can view/manage
  next();
};

// All endpoints require authentication
router.use(authenticateAdmin);

// =============================
// Customer Facing Routes
// =============================
router.get("/eligibility", controller.checkEligibility);
router.post("/feedback", controller.submitFeedback);
router.get("/feedback/:orderType/:orderId", controller.getOrderFeedback);
router.post("/complaint", handleUpload, controller.submitComplaint);
router.get("/my-complaints", controller.getCustomerComplaints);
router.post("/my-complaints/:id/reopen", controller.reopenComplaint);

// =============================
// Admin Facing Routes
// =============================
router.get("/admin/stats", requireAdminOrStaff, controller.getAdminStats);
router.get("/admin/complaints", requireAdminOrStaff, controller.getAdminComplaints);
router.get("/admin/complaints/:id", requireAdminOrStaff, controller.getAdminComplaintById);
router.patch("/admin/complaints/:id", requireAdminOrStaff, controller.updateAdminComplaint);
router.get("/admin/feedbacks", requireAdminOrStaff, controller.getAdminFeedbacks);
router.get("/admin/staff-list", requireAdminOrStaff, controller.getStaffList);

module.exports = router;
