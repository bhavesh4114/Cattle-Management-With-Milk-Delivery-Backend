const prisma = require('../config/db');

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function todayMidnight() {
    const d = new Date();
    d.setUTCHours(0,0,0,0);
    return d;
}

exports.getAllDeliveryBoys = async (req, res) => {
    try {
        const boys = await prisma.admin.findMany({
            where: { role: 'CUSTOM', status: 'Active' },
            include: { deliveryProfile: true, customRole: true, deliveryAvailability: { where: { date: todayMidnight() } } }
        });
        const deliveryBoys = boys.filter(b => b.customRole?.name?.toLowerCase().includes("delivery"));
        const result = deliveryBoys.map(boy => ({
            id: boy.id, name: boy.name, email: boy.email,
            roleName: boy.customRole?.name || 'Staff',
            profile: boy.deliveryProfile,
            todayAvailability: boy.deliveryAvailability[0]?.status || boy.deliveryProfile?.dailyStatus || 'Available'
        }));
        res.json(result);
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getMyProfile = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const profile = await prisma.deliveryBoyProfile.findUnique({ where: { adminId } });
        const admin = await prisma.admin.findUnique({ where: { id: adminId }, include: { customRole: true } });
        res.json({ profile, admin });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.upsertDeliveryBoyProfile = async (req, res) => {
    try {
        const adminId = req.params.targetAdminId ? parseInt(req.params.targetAdminId) : req.admin.id;
        const { mobile, pincodes, latitude, longitude, deliveryRadius, accountStatus, dailyStatus } = req.body;
        const profile = await prisma.deliveryBoyProfile.upsert({
            where: { adminId },
            update: {
                ...(mobile !== undefined && { mobile }),
                ...(pincodes !== undefined && { pincodes }),
                ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
                ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
                ...(deliveryRadius !== undefined && { deliveryRadius: parseFloat(deliveryRadius) }),
                ...(accountStatus !== undefined && { accountStatus }),
                ...(dailyStatus !== undefined && { dailyStatus }),
            },
            create: {
                adminId, mobile: mobile||null, pincodes: pincodes||[],
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                deliveryRadius: deliveryRadius ? parseFloat(deliveryRadius) : 10,
                accountStatus: accountStatus||'Active', dailyStatus: dailyStatus||'Available',
            }
        });
        res.json({ message: 'Profile updated', profile });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.setAvailability = async (req, res) => {
    try {
        const adminId = req.params.targetAdminId ? parseInt(req.params.targetAdminId) : req.admin.id;
        const { date, status } = req.body;
        const dateObj = new Date(date); dateObj.setUTCHours(0,0,0,0);
        const availability = await prisma.deliveryAvailability.upsert({
            where: { deliveryBoyId_date: { deliveryBoyId: adminId, date: dateObj } },
            update: { status },
            create: { deliveryBoyId: adminId, date: dateObj, status }
        });
        res.json({ message: 'Availability updated', availability });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getAvailability = async (req, res) => {
    try {
        const adminId = req.params.targetAdminId ? parseInt(req.params.targetAdminId) : req.admin.id;
        const { from, to } = req.query;
        const where = { deliveryBoyId: adminId };
        if (from || to) { where.date = {}; if(from) where.date.gte = new Date(from); if(to) where.date.lte = new Date(to); }
        const availability = await prisma.deliveryAvailability.findMany({ where, orderBy: { date: 'asc' } });
        res.json(availability);
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getSuggestedDeliveryBoys = async (req, res) => {
    try {
        const { orderType, orderId } = req.params;
        const today = todayMidnight();
        let order = orderType === 'trial'
            ? await prisma.milkTrial.findUnique({ where: { id: parseInt(orderId) } })
            : await prisma.milkSubscription.findUnique({ where: { id: parseInt(orderId) } });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        const customerPincode = order.pincode || '';
        const boys = await prisma.admin.findMany({
            where: { role: 'CUSTOM', status: 'Active' },
            include: { deliveryProfile: true, customRole: true, deliveryAvailability: { where: { date: today } } }
        });
        const deliveryBoys = boys.filter(b => b.customRole?.name?.toLowerCase().includes("delivery"));
        const result = deliveryBoys.filter(b => b.deliveryProfile).map(boy => {
            const profile = boy.deliveryProfile;
            const todayAvailability = boy.deliveryAvailability[0]?.status || profile.dailyStatus || 'Available';
            const pincodeMatch = customerPincode ? (profile.pincodes||[]).includes(customerPincode) : false;
            const isAvailable = todayAvailability === 'Available';
            const isActive = profile.accountStatus === 'Active';
            return { id: boy.id, name: boy.name, email: boy.email, roleName: boy.customRole?.name||'Staff',
                mobile: profile.mobile, pincodes: profile.pincodes, latitude: profile.latitude, longitude: profile.longitude,
                deliveryRadius: profile.deliveryRadius, accountStatus: profile.accountStatus,
                todayAvailability, pincodeMatch, isAvailable, isActive };
        }).sort((a,b) => {
            const sA = (a.isAvailable?2:0)+(a.pincodeMatch?1:0)+(a.isActive?1:0);
            const sB = (b.isAvailable?2:0)+(b.pincodeMatch?1:0)+(b.isActive?1:0);
            return sB-sA;
        });
        res.json({
            order: { id: order.id, customerName: order.customerName, pincode: order.pincode, address: order.address,
                milkType: order.milkType, dailyQuantity: order.dailyQuantity,
                currentDeliveryBoyId: order.deliveryBoyId, currentDeliveryStatus: order.deliveryStatus },
            suggested: result
        });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.assignDelivery = async (req, res) => {
    try {
        const { orderType, orderId } = req.params;
        const { deliveryBoyId, notes, forceAssign } = req.body;
        const adminId = req.admin.id;
        const orderIdInt = parseInt(orderId);
        const boyId = parseInt(deliveryBoyId);
        const today = todayMidnight();
        const profile = await prisma.deliveryBoyProfile.findUnique({ where: { adminId: boyId } });
        let order = orderType === 'trial'
            ? await prisma.milkTrial.findUnique({ where: { id: orderIdInt } })
            : await prisma.milkSubscription.findUnique({ where: { id: orderIdInt } });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // ✅ PAYMENT GATE: Block delivery assignment if payment is not done
        if (orderType === 'sub') {
            const isPaid = order.paymentStatus === 'PAID' || order.paymentStatus === 'CASH_PENDING';
            const isActive = order.status === 'ACTIVE';
            if (!isPaid || !isActive) {
                return res.status(400).json({
                    message: 'Cannot assign delivery: Order is not paid/confirmed yet.',
                    paymentStatus: order.paymentStatus,
                    orderStatus: order.status,
                    reason: 'payment_not_done'
                });
            }
        }

        if (!forceAssign && profile && profile.pincodes && profile.pincodes.length > 0 && order.pincode) {
            const match = profile.pincodes.includes(order.pincode);
            if (!match) {
                const boy = await prisma.admin.findUnique({ where: { id: boyId }, select: { name: true } });
                return res.json({ needsConfirmation: true, confirmationType: 'pincode_mismatch',
                    warning: `This delivery boy's area does not include pincode ${order.pincode}. They are outside the customer's assigned area.`,
                    deliveryBoyName: boy?.name });
            }
        }
        const avail = await prisma.deliveryAvailability.findUnique({ where: { deliveryBoyId_date: { deliveryBoyId: boyId, date: today } } });
        const todayStatus = avail?.status || profile?.dailyStatus || 'Available';
        if (todayStatus !== 'Available' && !forceAssign) {
            const boy = await prisma.admin.findUnique({ where: { id: boyId }, select: { name: true } });
            return res.json({ needsConfirmation: true, confirmationType: 'not_available',
                warning: `${boy?.name || 'This delivery boy'} is marked as "${todayStatus}" today. Are you sure you want to assign?`,
                deliveryBoyName: boy?.name });
        }
        await prisma.deliveryAssignment.updateMany({ where: { orderType, orderId: orderIdInt, isActive: true }, data: { isActive: false } });
        const cryptoLib = require('crypto');
        const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
        const qrCode = cryptoLib.randomUUID();
        const assignment = await prisma.deliveryAssignment.create({
            data: { orderType, orderId: orderIdInt, deliveryBoyId: boyId, assignedById: adminId, deliveryStatus: 'Assigned', notes: notes||null, isActive: true, deliveryOtp, qrCode, deliveryDate: todayMidnight() }
        });
        if (orderType === 'trial') { await prisma.milkTrial.update({ where: { id: orderIdInt }, data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' } }); }
        else { await prisma.milkSubscription.update({ where: { id: orderIdInt }, data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' } }); }
        res.json({ message: 'Delivery assigned successfully', assignment });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getAssignmentHistory = async (req, res) => {
    try {
        const { orderType, orderId } = req.params;
        const history = await prisma.deliveryAssignment.findMany({
            where: { orderType, orderId: parseInt(orderId) },
            include: { deliveryBoy: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(history);
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getMyDeliveries = async (req, res) => {
    try {
        const deliveryBoyId = req.admin.id;
        const assignments = await prisma.deliveryAssignment.findMany({
            where: { deliveryBoyId, isActive: true }, orderBy: { createdAt: 'desc' }
        });
        const enriched = await Promise.all(assignments.map(async (a) => {
            let order = a.orderType === 'trial'
                ? await prisma.milkTrial.findUnique({ where: { id: a.orderId }, include: { product: true } })
                : await prisma.milkSubscription.findUnique({ where: { id: a.orderId }, include: { product: true } });
            return { ...a, order };
        }));
        res.json(enriched.filter(e => e.order !== null));
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { deliveryStatus, notes } = req.body;
        const deliveryBoyId = req.admin.id;
        const assignment = await prisma.deliveryAssignment.findFirst({ where: { id: parseInt(assignmentId), deliveryBoyId, isActive: true } });
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

        // Auto-generate OTP + QR when delivery boy Accepts the order (so user gets OTP immediately)
        let extraData = { deliveryStatus, notes: notes || assignment.notes };
        if (deliveryStatus === 'Accepted' && !assignment.deliveryOtp) {
            const crypto = require('crypto');
            extraData.qrCode = crypto.randomUUID();
            extraData.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
            extraData.deliveryDate = todayMidnight();
        }

        const updated = await prisma.deliveryAssignment.update({ where: { id: parseInt(assignmentId) }, data: extraData });
        if (assignment.orderType === 'trial') { await prisma.milkTrial.update({ where: { id: assignment.orderId }, data: { deliveryStatus } }); }
        else { await prisma.milkSubscription.update({ where: { id: assignment.orderId }, data: { deliveryStatus } }); }
        if (deliveryStatus === 'Rejected') { await prisma.deliveryAssignment.update({ where: { id: parseInt(assignmentId) }, data: { isActive: false } }); }
        res.json({ message: `Status updated to ${deliveryStatus}`, updated });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getMyNotifications = async (req, res) => {
    try {
        const deliveryBoyId = req.admin.id;
        const recent = await prisma.deliveryAssignment.findMany({
            where: { deliveryBoyId, isActive: true }, orderBy: { createdAt: 'desc' }, take: 20
        });
        const notifs = await Promise.all(recent.map(async (a) => {
            let order = a.orderType === 'trial'
                ? await prisma.milkTrial.findUnique({ where: { id: a.orderId } })
                : await prisma.milkSubscription.findUnique({ where: { id: a.orderId } });
            return { id: a.id, orderId: a.orderId, orderType: a.orderType, customerName: order?.customerName,
                address: order?.address, pincode: order?.pincode, milkType: order?.milkType,
                quantity: order?.dailyQuantity, createdAt: a.createdAt, deliveryStatus: a.deliveryStatus };
        }));
        res.json(notifs);
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

// ✅ Order Tracking Timeline for User
exports.getOrderTrackingStatus = async (req, res) => {
    try {
        let { orderType, orderId } = req.query;
        if (orderType === 'subscription') orderType = 'sub';
        const orderIdInt = parseInt(orderId);

        let order = orderType === 'trial'
            ? await prisma.milkTrial.findUnique({ where: { id: orderIdInt } })
            : await prisma.milkSubscription.findUnique({ where: { id: orderIdInt } });

        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Get active assignment
        const assignment = await prisma.deliveryAssignment.findFirst({
            where: { orderType, orderId: orderIdInt, isActive: true },
            include: { deliveryBoy: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' }
        });

        // Build timeline steps
        const deliveryStatus = order.deliveryStatus || 'Pending';
        const STATUS_ORDER = ['Pending', 'Assigned', 'Accepted', 'Out for Delivery', 'Delivered'];
        const currentIdx = STATUS_ORDER.indexOf(deliveryStatus);

        // For subscriptions, check payment
        const isPaid = orderType === 'sub'
            ? (order.paymentStatus === 'PAID' || order.paymentStatus === 'CASH_PENDING')
            : true; // trials don't need payment

        const timeline = [
            {
                key: 'placed',
                label: 'Order Placed',
                icon: '📋',
                done: true,
                timestamp: order.createdAt
            },
            {
                key: 'payment',
                label: orderType === 'sub' ? 'Payment Successful' : 'Request Submitted',
                icon: '💳',
                done: orderType === 'sub' ? isPaid : (order.status !== 'PENDING_ADMIN'),
                note: orderType === 'sub' && !isPaid ? 'Waiting for payment' : null,
                timestamp: null
            },
            {
                key: 'confirmed',
                label: 'Order Confirmed',
                icon: '✅',
                done: orderType === 'sub' ? (order.status === 'ACTIVE') : (order.status === 'ACTIVE'),
                note: order.status === 'PENDING_ADMIN' ? 'Awaiting admin confirmation' : null,
                timestamp: null
            },
            {
                key: 'assigned',
                label: 'Delivery Boy Assigned',
                icon: '🚴',
                done: currentIdx >= 1,
                deliveryBoyName: assignment?.deliveryBoy?.name || null,
                timestamp: assignment?.createdAt || null
            },
            {
                key: 'accepted',
                label: 'Delivery Boy Accepted',
                icon: '🤝',
                done: currentIdx >= 2,
                note: currentIdx === 1 ? 'Waiting for delivery boy to accept' : null,
                timestamp: null
            },
            {
                key: 'out_for_delivery',
                label: 'Out for Delivery',
                icon: '🛵',
                done: currentIdx >= 3,
                timestamp: null
            },
            {
                key: 'delivered',
                label: 'Delivered',
                icon: '✅',
                done: currentIdx >= 4,
                timestamp: null
            }
        ];

        // Auto-generate OTP for any active assignment that doesn't have one yet
        if (assignment && !assignment.deliveryOtp) {
            const cryptoLib = require('crypto');
            const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
            const newQr = assignment.qrCode || cryptoLib.randomUUID();
            await prisma.deliveryAssignment.update({
                where: { id: assignment.id },
                data: { deliveryOtp: newOtp, qrCode: newQr, deliveryDate: todayMidnight() }
            });
            assignment.deliveryOtp = newOtp;
            assignment.qrCode = newQr;
        }

        res.json({
            orderId: order.id,
            orderType,
            customerName: order.customerName,
            milkType: order.milkType,
            dailyQuantity: order.dailyQuantity,
            address: order.address,
            orderStatus: order.status,
            paymentStatus: orderType === 'sub' ? order.paymentStatus : null,
            deliveryStatus,
            deliveryBoyName: assignment?.deliveryBoy?.name || null,
            deliveryOtp: assignment?.deliveryOtp || null,
            isQrScanned: assignment?.isQrScanned || false,
            timeline
        });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};



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
        
        res.json({ message: `Generated QR codes for ${generatedCount} deliveries`, count: generatedCount });
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
            ? await prisma.milkTrial.findUnique({ where: { id: assignment.orderId }, include: { product: true } })
            : await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId }, include: { product: true } });
            
        res.json({ message: 'QR Code verified successfully.', assignment, order });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.verifyDeliveryOTP = async (req, res) => {
    try {
        const { assignmentId, otp } = req.body;
        const deliveryBoyId = req.admin.id;
        
        const ids = Array.isArray(assignmentId) ? assignmentId : [assignmentId];
        
        const assignments = await prisma.deliveryAssignment.findMany({
            where: { id: { in: ids.map(id => parseInt(id)) }, deliveryBoyId, isActive: true }
        });
        
        if (assignments.length === 0) {
            return res.status(404).json({ message: 'Assignments not found.' });
        }
        
        // If the OTP matches ANY of the assignments in the group, we accept it for ALL of them.
        const cleanOtp = String(otp).trim();
        const isValid = assignments.some(a => a.deliveryOtp && String(a.deliveryOtp).trim() === cleanOtp);
        if (!isValid) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }
        
        // Mark all as verified and delivered
        await prisma.deliveryAssignment.updateMany({
            where: { id: { in: assignments.map(a => a.id) } },
            data: { isOtpVerified: true, deliveryStatus: 'Delivered' }
        });
        
        // Update main order status
        for (const assignment of assignments) {
            if (assignment.orderType === 'trial') {
                await prisma.milkTrial.update({ where: { id: assignment.orderId }, data: { deliveryStatus: 'Delivered' } });
            } else {
                await prisma.milkSubscription.update({ where: { id: assignment.orderId }, data: { deliveryStatus: 'Delivered' } });
            }
        }
        
        res.json({ message: 'OTP verified! Deliveries marked as complete.', assignments });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getTodayDeliveryOTP = async (req, res) => {
    try {
        let { orderType, orderId } = req.query;
        if (orderType === 'subscription') orderType = 'sub';
        const orderIdInt = parseInt(orderId);
        
        // Try active assignment first, then fall back to any recent assignment
        let assignment = await prisma.deliveryAssignment.findFirst({
            where: { orderType, orderId: orderIdInt, isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        
        // Fallback: find most recent assignment even if not active
        if (!assignment) {
            assignment = await prisma.deliveryAssignment.findFirst({
                where: { orderType, orderId: orderIdInt },
                orderBy: { createdAt: 'desc' }
            });
        }
        
        if (!assignment) {
            // Return 200 with null OTP to avoid 404 red errors in network tab
            return res.json({ otp: null, qrScanned: false, delivered: false });
        }
        
        // Auto-generate OTP if missing
        if (!assignment.deliveryOtp) {
            const cryptoLib = require('crypto');
            const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
            const newQr = assignment.qrCode || cryptoLib.randomUUID();
            await prisma.deliveryAssignment.update({
                where: { id: assignment.id },
                data: { deliveryOtp: newOtp, qrCode: newQr, deliveryDate: todayMidnight() }
            });
            assignment.deliveryOtp = newOtp;
            console.log(`[OTP] Auto-generated OTP ${newOtp} for assignment #${assignment.id} (${orderType} #${orderIdInt})`);
        }
        
        res.json({ otp: assignment.deliveryOtp, qrScanned: assignment.isQrScanned, delivered: assignment.isOtpVerified });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

