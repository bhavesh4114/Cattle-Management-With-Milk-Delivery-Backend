const fs = require('fs');
const path = 'src/controllers/deliveryController.js';
const appendStr = `

// ========================
// Security: QR and OTP Flow
// ========================

const crypto = require('crypto');

exports.generateDailyDeliveries = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const today = todayMidnight();
        
        // Find all active assignments for today that don't have QR yet
        const assignments = await prisma.deliveryAssignment.findMany({
            where: { isActive: true, qrCode: null }
        });
        
        let generatedCount = 0;
        for (const assignment of assignments) {
            const qrCode = crypto.randomUUID();
            const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
            
            await prisma.deliveryAssignment.update({
                where: { id: assignment.id },
                data: { qrCode, deliveryOtp, deliveryDate: today }
            });
            generatedCount++;
        }
        
        res.json({ message: \`Generated QR codes for \${generatedCount} deliveries\`, count: generatedCount });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.scanQRCode = async (req, res) => {
    try {
        const { qrCode } = req.body;
        const deliveryBoyId = req.admin.id;
        
        const assignment = await prisma.deliveryAssignment.findUnique({
            where: { qrCode }
        });
        
        if (!assignment) {
            return res.status(404).json({ message: 'Invalid or expired QR code.' });
        }
        
        if (assignment.deliveryBoyId !== deliveryBoyId) {
            return res.status(403).json({ message: 'This delivery is assigned to another delivery boy.' });
        }
        
        if (assignment.deliveryStatus === 'Delivered' || assignment.isOtpVerified) {
            return res.status(400).json({ message: 'This order has already been delivered.' });
        }
        
        // Mark QR as scanned
        await prisma.deliveryAssignment.update({
            where: { id: assignment.id },
            data: { isQrScanned: true, deliveryStatus: 'Reached Customer' }
        });
        
        // Fetch order details to show to delivery boy
        let order = assignment.orderType === 'trial'
            ? await prisma.milkTrial.findUnique({ where: { id: assignment.orderId } })
            : await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId } });
            
        res.json({ message: 'QR Code verified successfully.', assignment, order });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.verifyDeliveryOTP = async (req, res) => {
    try {
        const { assignmentId, otp } = req.body;
        const deliveryBoyId = req.admin.id;
        
        const assignment = await prisma.deliveryAssignment.findFirst({
            where: { id: parseInt(assignmentId), deliveryBoyId, isActive: true }
        });
        
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found.' });
        }
        
        if (assignment.deliveryOtp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }
        
        // Mark as verified and delivered
        const updated = await prisma.deliveryAssignment.update({
            where: { id: assignment.id },
            data: { isOtpVerified: true, deliveryStatus: 'Delivered' }
        });
        
        // Update main order status
        if (assignment.orderType === 'trial') {
            await prisma.milkTrial.update({ where: { id: assignment.orderId }, data: { deliveryStatus: 'Delivered' } });
        } else {
            await prisma.milkSubscription.update({ where: { id: assignment.orderId }, data: { deliveryStatus: 'Delivered' } });
        }
        
        res.json({ message: 'OTP verified! Delivery marked as complete.', assignment: updated });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getTodayDeliveryOTP = async (req, res) => {
    try {
        // For customer to see their OTP
        const { orderType, orderId } = req.params;
        const assignment = await prisma.deliveryAssignment.findFirst({
            where: { orderType, orderId: parseInt(orderId), isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        
        if (!assignment) {
            return res.status(404).json({ message: 'No active delivery found for today.' });
        }
        
        res.json({ otp: assignment.deliveryOtp, qrScanned: assignment.isQrScanned, delivered: assignment.isOtpVerified });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};
`;
fs.appendFileSync(path, appendStr);
