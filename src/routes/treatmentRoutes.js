const express = require("express");
const treatmentController = require("../controllers/treatmentController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/", requirePermission("treatments", "view"), treatmentController.getTreatments);
router.post("/", requirePermission("treatments", "add"), treatmentController.createTreatment);
router.put("/:id", requirePermission("treatments", "edit"), treatmentController.updateTreatment);
router.delete("/:id", requirePermission("treatments", "delete"), treatmentController.deleteTreatment);

module.exports = router;
