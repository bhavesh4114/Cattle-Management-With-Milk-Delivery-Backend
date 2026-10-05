const express = require("express");
const router = express.Router();
const userQrController = require("../controllers/userQrController");
const { authenticateAdmin } = require("../middleware/auth");

router.use(authenticateAdmin);

router.post("/:userId/qr", userQrController.generateUserQr);
router.get("/:userId/qr", userQrController.getUserQr);

module.exports = router;
