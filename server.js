require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Import Routes  
const authRoutes = require("./src/routes/authRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const cowsRoutes = require("./src/routes/cowsRoutes");
const milkRoutes = require("./src/routes/milkRoutes");
const feedRoutes = require("./src/routes/feedRoutes");
const foodIntakeRoutes = require("./src/routes/foodIntakeRoutes");
const salesRoutes = require("./src/routes/salesRoutes");
const treatmentRoutes = require("./src/routes/treatmentRoutes");
const itemsRoutes = require("./src/routes/itemsRoutes");
const deathRoutes = require("./src/routes/deathRoutes");
const orderRoutes = require("./src/routes/orderRoutes");
const reportRoutes = require("./src/routes/reportRoutes");
const roleRoutes = require("./src/routes/roleRoutes");
const staffMilkRoutes = require("./src/routes/staffMilkRoutes");
const milkSubscriptionRoutes = require("./src/routes/milkSubscriptionRoutes");
const deliveryRoutes = require("./src/routes/deliveryRoutes");
const productRoutes = require("./src/routes/productRoutes");
const alertRoutes = require("./src/routes/alertRoutes");
const userQrRoutes = require("./src/routes/userQrRoutes");
const milkDeliveryRequestRoutes = require("./src/routes/milkDeliveryRequestRoutes");
const feedbackComplaintRoutes = require("./src/routes/feedbackComplaintRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const referralRoutes = require("./src/routes/referralRoutes");
const couponRoutes = require("./src/routes/couponRoutes");
const http = require("http");
const { initSocket } = require("./src/socket/chatSocket");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://cattle-management-with-milk-deliver-six.vercel.app",
  "https://cattle-management-with-milk-deliver.vercel.app",
  "https://cattle-management-with-milk-delivery-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

const allowedOriginPatterns = [
  /^https:\/\/cattle-management-with-milk-delivery-frontend-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/cattle-management-with-milk-deliver-[a-z0-9-]+\.vercel\.app$/i,
];

const isAllowedOrigin = (origin) => (
  allowedOrigins.includes(origin) ||
  allowedOriginPatterns.some((pattern) => pattern.test(origin))
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: false,
}));

const os = require("os");
const isServerlessEnv = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
if (isServerlessEnv) {
  app.use("/uploads", express.static(path.join(os.tmpdir(), "uploads")));
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Backend is running" });
});

app.get("/api", (req, res) => {
  res.json({ status: "ok", message: "API is running" });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
    frontendUrlConfigured: Boolean(process.env.FRONTEND_URL),
  });
});

// Mount Routes
app.use("/api/admin/auth", authRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/cows", cowsRoutes);
app.use("/api/admin/milk", milkRoutes);
app.use("/api/admin", feedRoutes); // /cow-food, /feeding-plans
app.use("/api/admin/food-intake", foodIntakeRoutes);
app.use("/api/admin", salesRoutes); // /sales, /sold-cows
app.use("/api/admin/treatments", treatmentRoutes); // /treatments -> wait, the old one was /api/admin/treatments
app.use("/api/admin", itemsRoutes); // /items and /food-purchases
app.use("/api/admin/deaths", deathRoutes);
app.use("/api/admin/orders", orderRoutes);
app.use("/api/admin/reports", reportRoutes);
app.use("/api/admin/roles", roleRoutes);
app.use("/api/staff-milk", staffMilkRoutes);
app.use("/api/milk-module", milkSubscriptionRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/users", userQrRoutes);
app.use("/api/milk-delivery-requests", milkDeliveryRequestRoutes);
app.use("/api/delivery-requests", milkDeliveryRequestRoutes);
app.use("/api/feedback-complaints", feedbackComplaintRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/coupons", couponRoutes);

app.use((err, req, res, next) => {
  console.error("[server] request failed", {
    method: req.method,
    path: req.originalUrl,
    name: err.name,
    message: err.message,
    code: err.code,
  });

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({ message: "Internal server error", detail: err.message });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5100;
  const deliveryDelayService = require("./src/services/deliveryDelayService");
  const referralService = require("./src/services/referralService");
  const server = http.createServer(app);
  initSocket(server, isAllowedOrigin);

  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`Backend running successfully with Socket.IO on port ${PORT}`);
    // Start automated backend delivery delay checking
    deliveryDelayService.startMonitoring();
    // Initialize default coupons, referral settings, and backfill user codes
    await referralService.backfillExistingUsers();
    await referralService.initDefaultCouponsAndSettings();
  });

  process.on("SIGTERM", () => {
    deliveryDelayService.stopMonitoring();
    server.close(() => process.exit(0));
  });
}

module.exports = app;

// Trigger restart

// Trigger restart 2

// Trigger restart 3

// Trigger restart 3

// Trigger restart 8


