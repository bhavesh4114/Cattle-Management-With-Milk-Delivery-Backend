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

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const allowedOrigins = [
  process.env.FRONTEND_URL,
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

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: false,
}));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

  return res.status(500).json({ message: "Internal server error" });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5100;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running successfully on port ${PORT}`);
  });

  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
  });
}

module.exports = app;

// Trigger restart

// Trigger restart 2

// Trigger restart 3

// Trigger restart 3

// Trigger restart 6
