const service = require("../services/feedbackComplaintService");

const checkEligibility = async (req, res) => {
  try {
    const { orderType, orderId } = req.query;
    if (!orderType || !orderId) {
      return res.status(400).json({ message: "orderType and orderId are required" });
    }
    const customerId = req.admin.id;
    const result = await service.checkEligibility(orderType, orderId, customerId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const submitFeedback = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const { orderType, orderId, rating, deliveryBoyRating, productQualityRating, review } = req.body;
    const feedback = await service.submitFeedback({
      orderType,
      orderId,
      customerId,
      rating,
      deliveryBoyRating,
      productQualityRating,
      review
    });
    res.status(201).json({ message: "Feedback submitted successfully!", feedback });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getOrderFeedback = async (req, res) => {
  try {
    const { orderType, orderId } = req.params;
    const customerId = req.admin.role === "ADMIN" ? null : req.admin.id;
    const feedback = await service.getOrderFeedback(orderType, orderId, customerId);
    res.json(feedback);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const submitComplaint = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const { orderType, orderId, category, description } = req.body;
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `/uploads/complaints/${req.file.filename}`;
    }

    const complaint = await service.submitComplaint({
      orderType,
      orderId,
      customerId,
      category,
      description,
      attachmentPath
    });

    res.status(201).json({
      message: "Complaint registered successfully! Our team will investigate promptly.",
      complaint
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getCustomerComplaints = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const complaints = await service.getCustomerComplaints(customerId);
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reopenComplaint = async (req, res) => {
  try {
    const customerId = req.admin.id;
    const { id } = req.params;
    const { reason } = req.body;
    const updated = await service.reopenCustomerComplaint(id, customerId, reason);
    res.json({ message: "Complaint reopened successfully", complaint: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin Controller Handlers

const getAdminStats = async (req, res) => {
  try {
    const stats = await service.getAdminStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAdminComplaints = async (req, res) => {
  try {
    const { search, status, category } = req.query;
    const complaints = await service.getAdminComplaints({ search, status, category });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAdminComplaintById = async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await service.getAdminComplaintById(id);
    res.json(complaint);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

const updateAdminComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedStaffId, adminNotes, resolutionNotes } = req.body;
    const updated = await service.updateAdminComplaint(
      id,
      { status, assignedStaffId, adminNotes, resolutionNotes },
      req.admin
    );
    res.json({ message: "Complaint updated successfully", complaint: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAdminFeedbacks = async (req, res) => {
  try {
    const { search, rating } = req.query;
    const feedbacks = await service.getAdminFeedbacks({ search, rating });
    res.json(feedbacks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getStaffList = async (req, res) => {
  try {
    const staff = await service.getStaffList();
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  checkEligibility,
  submitFeedback,
  getOrderFeedback,
  submitComplaint,
  getCustomerComplaints,
  reopenComplaint,
  getAdminStats,
  getAdminComplaints,
  getAdminComplaintById,
  updateAdminComplaint,
  getAdminFeedbacks,
  getStaffList
};
