const express = require("express");
const cowsController = require("../controllers/cowsController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/", requirePermission("cows", "view"), cowsController.getCows);
router.post("/", requirePermission("cows", "add"), cowsController.createCow);
router.get("/next-reg-no", requirePermission("cows", "view"), cowsController.getNextRegNo);
router.get("/:cowId/history", requirePermission("cows", "view"), cowsController.getCowHistory);
router.put("/:cowId", requirePermission("cows", "edit"), cowsController.updateCow);
router.delete("/:cowId", requirePermission("cows", "delete"), cowsController.deleteCow);
router.post("/:cowId/sell", requirePermission("sales", "add"), cowsController.sellCow);
router.post("/:cowId/reproduction", requirePermission("cows", "edit"), cowsController.createReproduction);
router.put("/:cowId/reproduction/:recordId", requirePermission("cows", "edit"), cowsController.updateReproduction);
router.delete("/:cowId/reproduction/:recordId", requirePermission("cows", "delete"), cowsController.deleteReproduction);

module.exports = router;
