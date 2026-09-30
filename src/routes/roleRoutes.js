const express = require("express");
const router = express.Router();
const roleController = require("../controllers/roleController");
const { authenticateAdmin, requirePermission } = require("../middleware/auth");

// Protect all role routes with 'role_creation.manage' (or a suitable key)
router.use(authenticateAdmin);
router.use(requirePermission('role_creation.manage'));

router.get("/", roleController.getRoles);
router.post("/", roleController.createRole);
router.put("/:id", roleController.updateRole);
router.delete("/:id", roleController.deleteRole);

// Users under roles
router.get("/users", roleController.getUsers);
router.post("/users", roleController.createUser);
router.put("/users/:id", roleController.updateUser);
router.delete("/users/:id", roleController.deleteUser);

module.exports = router;
