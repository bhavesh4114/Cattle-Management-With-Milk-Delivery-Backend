const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs");

const getUploadDir = () => {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const dir = isServerless
    ? path.join(os.tmpdir(), "uploads", "delivery-proofs")
    : path.join(__dirname, "../../uploads", "delivery-proofs");

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn("[deliveryProofUpload] Notice: could not create upload dir:", err.message);
  }
  return dir;
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = getUploadDir();
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
    cb(null, `proof_${Date.now()}_${cleanName || "capture"}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and WebP image formats are allowed for delivery proof photos."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const handleProofUpload = (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Photo file size exceeds the 5MB limit." });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

module.exports = { handleProofUpload };
