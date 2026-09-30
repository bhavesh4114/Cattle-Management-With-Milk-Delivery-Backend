const orderService = require("../services/orderService");

const getOrders = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const orders = await orderService.getOrders(adminId);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

const createOrder = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const order = await orderService.createOrder(req.body, adminId);
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: "Failed to create order" });
  }
};

const updateOrder = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const adminId = req.admin.id;
    const order = await orderService.updateOrder(id, req.body, adminId);
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Failed to update order" });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const adminId = req.admin.id;
    await orderService.deleteOrder(id, adminId);
    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete order" });
  }
};

module.exports = {
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder
};
