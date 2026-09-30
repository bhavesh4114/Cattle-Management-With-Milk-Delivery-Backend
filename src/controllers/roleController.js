const prisma = require("../config/db");
const bcrypt = require("bcrypt");

const getRoles = async (req, res) => {
  try {
    const roles = await prisma.customRole.findMany({
      include: {
        admins: {
          select: { id: true, name: true, email: true, status: true, createdAt: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch roles", error: error.message });
  }
};

const createRole = async (req, res) => {
  try {
    const { name, permissions, status } = req.body;
    
    // Check if role name already exists
    let role = await prisma.customRole.findUnique({ where: { name } });
    if (role) {
      return res.status(400).json({ message: "Role name already exists" });
    }

    role = await prisma.customRole.create({
      data: {
        name,
        permissions: permissions || [],
        status: status || "Active"
      }
    });

    res.status(201).json({ message: "Role created successfully", data: role });
  } catch (error) {
    res.status(500).json({ message: "Failed to create role", error: error.message });
  }
};

const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions, status } = req.body;

    const roleId = parseInt(id);

    // Check if role exists
    const role = await prisma.customRole.findUnique({ 
      where: { id: roleId }
    });

    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    // Check name conflict
    if (name && name !== role.name) {
      const nameConflict = await prisma.customRole.findUnique({ where: { name } });
      if (nameConflict) return res.status(400).json({ message: "Role name already in use" });
    }

    await prisma.customRole.update({
      where: { id: roleId },
      data: {
        ...(name && { name }),
        ...(permissions && { permissions }),
        ...(status && { status }),
      }
    });

    res.json({ message: "Role updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update role", error: error.message });
  }
};

const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = parseInt(id);

    const role = await prisma.customRole.findUnique({ 
      where: { id: roleId },
      include: { admins: true }
    });

    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    await prisma.$transaction(async (tx) => {
      // Delete associated users first
      for (const admin of role.admins) {
        await tx.admin.delete({ where: { id: admin.id } });
      }
      // Delete role
      await tx.customRole.delete({ where: { id: roleId } });
    });

    res.json({ message: "Role deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete role", error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await prisma.admin.findMany({
      where: { role: "CUSTOM" },
      include: { customRole: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, status, customRoleId } = req.body;
    
    if (!customRoleId) return res.status(400).json({ message: "Role is required" });

    const existingAdmin = await prisma.admin.findUnique({ where: { email } });
    if (existingAdmin) {
      return res.status(400).json({ message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await prisma.admin.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "CUSTOM",
        customRoleId: parseInt(customRoleId),
        status: status || "Active"
      }
    });

    res.status(201).json({ message: "User created successfully", data: admin });
  } catch (error) {
    res.status(500).json({ message: "Failed to create user", error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, status, customRoleId } = req.body;
    const userId = parseInt(id);

    const admin = await prisma.admin.findUnique({ where: { id: userId } });
    if (!admin) return res.status(404).json({ message: "User not found" });

    if (email && email !== admin.email) {
      const emailConflict = await prisma.admin.findUnique({ where: { email } });
      if (emailConflict) return res.status(400).json({ message: "Email already in use" });
    }

    let updateData = {
      ...(name && { name }),
      ...(email && { email }),
      ...(status && { status }),
      ...(customRoleId && { customRoleId: parseInt(customRoleId) })
    };

    if (password && password !== "••••••••") {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await prisma.admin.update({
      where: { id: userId },
      data: updateData
    });

    res.json({ message: "User updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user", error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);

    await prisma.admin.delete({ where: { id: userId } });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};

module.exports = {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getUsers,
  createUser,
  updateUser,
  deleteUser
};
