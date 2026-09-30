const express = require("express");
const deathController = require("../controllers/deathController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/", requirePermission("deaths", "view"), deathController.getDeaths);
router.post("/", requirePermission("deaths", "add"), deathController.createDeath);
router.delete("/:id", requirePermission("deaths", "delete"), deathController.deleteDeath);

module.exports = router;
