const service = require("../services/milkDeliveryRequestService");

exports.getCustomerContext = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const ctx = await service.getCustomerContext(customerId);
    res.json(ctx);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const request = await service.createRequest(customerId, req.body);
    res.status(201).json({ message: "Milk delivery request submitted successfully", request });
  } catch (error) {
    const status = error.message.includes("at least 2 days") || error.message.includes("past") || error.message.includes("Invalid") || error.message.includes("already exists") ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};

exports.getMyRequests = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const requests = await service.getCustomerRequests(customerId);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateRequest = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const updated = await service.updateCustomerRequest(req.params.id, customerId, req.body);
    res.json({ message: "Request updated successfully", request: updated });
  } catch (error) {
    const status = error.message.includes("at least 2 days") || error.message.includes("Unauthorized") || error.message.includes("Cannot modify") ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};

exports.cancelRequest = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const cancelled = await service.cancelCustomerRequest(req.params.id, customerId);
    res.json({ message: "Request cancelled successfully", request: cancelled });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getAllRequests = async (req, res) => {
  try {
    const requests = await service.getAllRequests(req.query);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    const requests = await service.getAllRequests({ ...req.query, status: "PENDING" });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const updated = await service.approveRequest(req.params.id, adminId);
    res.json({ message: "Request approved successfully", request: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { reason } = req.body;
    const updated = await service.rejectRequest(req.params.id, adminId, reason);
    res.json({ message: "Request rejected successfully", request: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
