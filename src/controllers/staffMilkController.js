const prisma = require("../config/db");

// Get allocations for the logged in staff
exports.getMyAllocations = async (req, res) => {
    try {
        const staffId = req.admin.id;
        const allocations = await prisma.milkAllocation.findMany({
            where: {
                staffId: staffId,
                status: 'Pending'
            },
            orderBy: { date: 'desc' }
        });
        res.json(allocations);
    } catch (error) {
        console.error("Error fetching allocations:", error);
        res.status(500).json({ message: "Server error fetching allocations" });
    }
};

// Get today's total milk directly from the milk records
exports.getTodayTotalMilk = async (req, res) => {
    try {
        const today = new Date();
        today.setUTCHours(0,0,0,0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const records = await prisma.milkRecord.findMany({
            where: {
                recordDate: { gte: today, lt: tomorrow }
            }
        });

        let morning = 0;
        let evening = 0;
        records.forEach(r => {
            morning += parseFloat(r.morningMilk) || 0;
            evening += parseFloat(r.eveningMilk) || 0;
        });

        res.json({ 
            morning: morning.toFixed(2), 
            evening: evening.toFixed(2), 
            total: (morning + evening).toFixed(2),
            date: today.toISOString()
        });
    } catch (error) {
        console.error("Error fetching today total milk:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Submit processing report
exports.submitReport = async (req, res) => {
    try {
        const staffId = req.admin.id;
        const {
            receivedQty,
            totalUsedQty,
            remainingQty,
            usageDetails
        } = req.body;

        if (receivedQty === undefined || !usageDetails) {
            return res.status(400).json({ message: "Invalid payload" });
        }

        const report = await prisma.staffMilkReport.create({
            data: {
                staffId,
                reportDate: new Date(),
                receivedQty: parseFloat(receivedQty || 0),
                totalUsedQty: parseFloat(totalUsedQty || 0),
                remainingQty: parseFloat(remainingQty || 0),
                usageDetails: usageDetails,
                status: "PENDING_ADMIN_REVIEW"
            }
        });

        res.status(201).json({ message: "Report submitted successfully", report });
    } catch (error) {
        console.error("Error submitting report:", error);
        res.status(500).json({ message: "Server error submitting report" });
    }
};

// Admin: Get all reports
exports.getAllReports = async (req, res) => {
    try {
        const reports = await prisma.staffMilkReport.findMany({
            orderBy: { reportDate: 'desc' }
        });
        res.json(reports);
    } catch (error) {
        console.error("Error fetching all reports:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Staff: Get my reports
exports.getMyReports = async (req, res) => {
    try {
        const staffId = req.admin.id;
        const reports = await prisma.staffMilkReport.findMany({
            where: { staffId },
            orderBy: { reportDate: 'desc' }
        });
        res.json(reports);
    } catch (error) {
        console.error("Error fetching my reports:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Admin: Approve a report
exports.approveReport = async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        const report = await prisma.staffMilkReport.update({
            where: { id: reportId },
            data: { status: 'APPROVED' }
        });
        res.json({ message: "Report approved successfully", report });
    } catch (error) {
        console.error("Error approving report:", error);
        res.status(500).json({ message: "Server error approving report" });
    }
};

// Admin: Reject a report
exports.rejectReport = async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        const report = await prisma.staffMilkReport.update({
            where: { id: reportId },
            data: { status: 'REJECTED' }
        });
        res.json({ message: "Report rejected successfully", report });
    } catch (error) {
        console.error("Error rejecting report:", error);
        res.status(500).json({ message: "Server error rejecting report" });
    }
};
// --- Customer Milk Orders ---

exports.submitCustomerOrder = async (req, res) => {
    try {
        const { date, quantity, milkType, phone, address, notes, customerName } = req.body;
        const userId = req.admin ? req.admin.id : null;
        const finalCustomerName = customerName || (req.admin ? req.admin.name : "Unknown");
        const deliveryDate = new Date(date);
        
        const order = await prisma.customerMilkOrder.create({
            data: {
                userId,
                customerName: finalCustomerName,
                phone,
                address,
                milkType,
                quantity: parseFloat(quantity),
                deliveryDate,
                originalDate: deliveryDate,
                notes,
                status: "PENDING_ADMIN",
                history: {
                    create: {
                        status: "PENDING_ADMIN",
                        actor: "CUSTOMER",
                        actorName: finalCustomerName,
                        actionDetails: `Requested ${quantity}L for ${date}`
                    }
                }
            },
            include: { history: true }
        });
        res.json({ message: "Order submitted", order });
    } catch (error) {
        console.error("Error submitting order:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.getMyCustomerOrders = async (req, res) => {
    try {
        const userId = req.admin.id;
        const orders = await prisma.customerMilkOrder.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { history: true }
        });
        res.json(orders);
    } catch (error) {
        console.error("Error fetching my orders:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.getAllCustomerOrders = async (req, res) => {
    try {
        const orders = await prisma.customerMilkOrder.findMany({
            orderBy: { createdAt: 'desc' },
            include: { history: true }
        });
        res.json(orders);
    } catch (error) {
        console.error("Error fetching all orders:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Generic status update (mostly for direct admin overrides, though specific endpoints are better)
exports.updateCustomerOrderStatus = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const { status } = req.body;
        const adminName = req.admin ? req.admin.name : "Admin";

        const order = await prisma.customerMilkOrder.update({
            where: { id: orderId },
            data: { 
                status,
                history: {
                    create: {
                        status,
                        actor: "ADMIN",
                        actorName: adminName,
                        actionDetails: `Admin updated status to ${status}`
                    }
                }
            },
            include: { history: true }
        });
        res.json({ message: `Order marked as ${status}`, order });
    } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Admin actions
exports.acceptOrder = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const adminName = req.admin ? req.admin.name : "Admin";
        
        // Removed PENDING_ADMIN restriction to allow overriding REJECTED to ACCEPTED
        // const current = await prisma.customerMilkOrder.findUnique({ where: { id: orderId } });
        // if (current.status !== "PENDING_ADMIN") return res.status(400).json({ message: "Order is not pending admin approval." });

        const order = await prisma.customerMilkOrder.update({
            where: { id: orderId },
            data: { 
                status: "ACCEPTED",
                history: {
                    create: {
                        status: "ACCEPTED",
                        actor: "ADMIN",
                        actorName: adminName,
                        actionDetails: "Admin accepted the requested date"
                    }
                }
            },
            include: { history: true }
        });
        res.json({ message: "Order accepted", order });
    } catch (error) {
        console.error("Error accepting order:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.rejectOrder = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const { reason } = req.body;
        const adminName = req.admin ? req.admin.name : "Admin";
        
        const order = await prisma.customerMilkOrder.update({
            where: { id: orderId },
            data: { 
                status: "REJECTED",
                history: {
                    create: {
                        status: "REJECTED",
                        actor: "ADMIN",
                        actorName: adminName,
                        actionDetails: `Admin rejected: ${reason || "No reason provided"}`
                    }
                }
            },
            include: { history: true }
        });
        res.json({ message: "Order rejected", order });
    } catch (error) {
        console.error("Error rejecting order:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.proposeAlternative = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const { alternativeDate, reason } = req.body;
        const adminName = req.admin ? req.admin.name : "Admin";
        
        const proposedDate = new Date(alternativeDate);
        
        const order = await prisma.customerMilkOrder.update({
            where: { id: orderId },
            data: { 
                status: "AWAITING_CUSTOMER",
                proposedDate,
                history: {
                    create: {
                        status: "OFFERED_ALTERNATIVE",
                        actor: "ADMIN",
                        actorName: adminName,
                        actionDetails: `Proposed alternative date: ${alternativeDate}. Reason: ${reason || "N/A"}`
                    }
                }
            },
            include: { history: true }
        });
        res.json({ message: "Alternative proposed", order });
    } catch (error) {
        console.error("Error proposing alternative:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.dispatchOrder = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const { deliveryBoyName, deliveryBoyPhone } = req.body;
        const adminName = req.admin ? req.admin.name : "Admin";
        
        const order = await prisma.customerMilkOrder.update({
            where: { id: orderId },
            data: { 
                status: "OUT_FOR_DELIVERY",
                deliveryBoyName,
                deliveryBoyPhone,
                history: {
                    create: {
                        status: "OUT_FOR_DELIVERY",
                        actor: "ADMIN",
                        actorName: adminName,
                        actionDetails: `Dispatched via ${deliveryBoyName} (${deliveryBoyPhone})`
                    }
                }
            },
            include: { history: true }
        });
        res.json({ message: "Order dispatched", order });
    } catch (error) {
        console.error("Error dispatching order:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Customer actions
exports.respondToAlternative = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const { decision } = req.body; // "ACCEPT" or "REJECT"
        const customerName = req.admin ? req.admin.name : "Customer";
        
        const current = await prisma.customerMilkOrder.findUnique({ where: { id: orderId } });
        if (current.status !== "AWAITING_CUSTOMER") return res.status(400).json({ message: "Order is not awaiting your response." });
        
        const status = decision === "ACCEPT" ? "ACCEPTED" : "CANCELLED";
        const details = decision === "ACCEPT" ? "Customer accepted alternative date" : "Customer rejected alternative date";
        
        const data = {
            status,
            history: {
                create: {
                    status,
                    actor: "CUSTOMER",
                    actorName: customerName,
                    actionDetails: details
                }
            }
        };
        
        // If accepted, update deliveryDate to proposedDate
        if (decision === "ACCEPT" && current.proposedDate) {
            data.deliveryDate = current.proposedDate;
        }
        
        const order = await prisma.customerMilkOrder.update({
            where: { id: orderId },
            data,
            include: { history: true }
        });
        res.json({ message: `Response registered: ${status}`, order });
    } catch (error) {
        console.error("Error responding to alternative:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.cancelOrder = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const customerName = req.admin ? req.admin.name : "Customer";
        
        const current = await prisma.customerMilkOrder.findUnique({ where: { id: orderId } });
        if (["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(current.status)) {
            return res.status(400).json({ message: "Too late to cancel this order." });
        }
        
        const order = await prisma.customerMilkOrder.update({
            where: { id: orderId },
            data: { 
                status: "CANCELLED",
                history: {
                    create: {
                        status: "CANCELLED",
                        actor: "CUSTOMER",
                        actorName: customerName,
                        actionDetails: "Customer cancelled the order"
                    }
                }
            },
            include: { history: true }
        });
        res.json({ message: "Order cancelled", order });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ message: "Server error" });
    }
};
