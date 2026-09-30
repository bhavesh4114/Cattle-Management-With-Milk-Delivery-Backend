const itemsService = require("../services/itemsService");
const { toNumber } = require("../utils/helpers");

const getItems = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const items = await itemsService.getItems(adminId);
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch items" });
  }
};

const createItem = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const item = await itemsService.createItem(req.body, adminId);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: "Failed to add item" });
  }
};

const updateItem = async (req, res) => {
  try {
    const id = toNumber(req.params.id);
    const adminId = req.admin.id;
    if (!id) return res.status(400).json({ message: "Invalid item ID" });
    const item = await itemsService.updateItem(id, req.body, adminId);
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: "Failed to update item" });
  }
};

const deleteItem = async (req, res) => {
  try {
    const id = toNumber(req.params.id);
    const adminId = req.admin.id;
    if (!id) return res.status(400).json({ message: "Invalid item ID" });
    await itemsService.deleteItem(id, adminId);
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete item" });
  }
};

const getFoodPurchases = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const purchases = await itemsService.getFoodPurchases(adminId);
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch purchases" });
  }
};

const createFoodPurchase = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const purchase = await itemsService.createFoodPurchase(req.body, adminId);
    res.status(201).json(purchase);
  } catch (error) {
    res.status(500).json({ message: "Failed to create purchase" });
  }
};

module.exports = {
  getItems,
  createItem,
  updateItem,
  deleteItem,
  getFoodPurchases,
  createFoodPurchase
};
