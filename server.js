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

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

const PORT = process.env.PORT || 5100;
const server = app.listen(PORT, () => {
  console.log(`Backend running successfully on port ${PORT}`);
});

const keepAlive = setInterval(() => { }, 1 << 30);

process.on("SIGTERM", () => {
  clearInterval(keepAlive);
  server.close(() => process.exit(0));
});

// Trigger restart

// Trigger restart 2

// Trigger restart 3

// Trigger restart 3

// Trigger restart 4
