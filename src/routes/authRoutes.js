const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

const { authenticateAdmin } = require("../middleware/auth");

router.post("/login", authController.login);
router.get("/profile", authenticateAdmin, authController.getProfile);

module.exports = router;
