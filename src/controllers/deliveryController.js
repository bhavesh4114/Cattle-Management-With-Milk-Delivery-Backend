const prisma = require('../config/db');
const deliveryLeaveService = require('../services/deliveryLeaveService');
const notificationService = require('../services/notificationService');
const milkReqService = require('../services/milkDeliveryRequestService');

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
            include: {
                deliveryProfile: true,
                customRole: true,
                deliveryAvailability: { where: { date: todayMidnight() } },
                deliveryBoyLeaves: {
                    where: {
                        status: 'APPROVED',
                        startDate: { lte: todayMidnight() },
                        endDate: { gte: todayMidnight() }
                    }
                }
            }
        });
        const deliveryBoys = boys.filter(b => {
            const n = (b.customRole?.name || "").toLowerCase();
            const p = Array.isArray(b.customRole?.permissions) ? b.customRole.permissions : [];
            return n.includes("deliver") || n.includes("delever") || p.some(x => String(x).toLowerCase().includes("deliver"));
        });
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
        const deliveryBoys = boys.filter(b => {
            const n = (b.customRole?.name || "").toLowerCase();
            const p = Array.isArray(b.customRole?.permissions) ? b.customRole.permissions : [];
            return n.includes("deliver") || n.includes("delever") || p.some(x => String(x).toLowerCase().includes("deliver"));
        });
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
        // ✅ LEAVE VALIDATION: Block delivery assignment if delivery boy is on approved leave
        const leaveActive = await prisma.deliveryBoyLeave.findFirst({
            where: {
                deliveryBoyId: boyId,
                status: 'APPROVED',
                startDate: { lte: today },
                endDate: { gte: today }
            }
        });
        if (leaveActive) {
            const startStr = leaveActive.startDate.toISOString().split('T')[0];
            const endStr = leaveActive.endDate.toISOString().split('T')[0];
            return res.status(400).json({
                message: `Cannot assign delivery: Delivery boy is on approved leave (${startStr} to ${endStr}).`,
                reason: 'delivery_boy_on_leave',
                leave: leaveActive
            });
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
        const assignment = await prisma.deliveryAssignment.create({
            data: { orderType, orderId: orderIdInt, deliveryBoyId: boyId, assignedById: adminId, deliveryStatus: 'Assigned', notes: notes||null, isActive: true, deliveryDate: todayMidnight() }
        });
        if (orderType === 'trial') { await prisma.milkTrial.update({ where: { id: orderIdInt }, data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' } }); }
        else { await prisma.milkSubscription.update({ where: { id: orderIdInt }, data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' } }); }

        // Trigger Role-Based Delivery Assigned Notification
        const boyUser = await prisma.admin.findUnique({ where: { id: boyId }, select: { name: true } });
        notificationService.notifyDeliveryAssigned({
            boyId,
            boyName: boyUser?.name,
            orderId: orderIdInt,
            orderType,
            customerName: order.customerName,
            customerUserId: order.userId,
            adminId,
            deliveryDate: todayMidnight(),
            isReassignment: false
        }).catch(err => console.error('[assignDelivery notification error]', err));

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
        const isAdmin = req.admin.role === 'ADMIN';
        const { filter } = req.query;
        const where = {};
        if (!isAdmin) {
            where.deliveryBoyId = deliveryBoyId;
        }

        if (filter === 'active') {
            where.isActive = true;
            where.deliveryStatus = { not: 'Delivered' };
        } else if (filter === 'completed') {
            where.deliveryStatus = 'Delivered';
        } else {
            where.OR = [
                { isActive: true },
                { deliveryStatus: 'Delivered' }
            ];
        }

        const assignments = await prisma.deliveryAssignment.findMany({
            where, orderBy: { createdAt: 'desc' }
        });
        const enriched = await Promise.all(assignments.map(async (a) => {
            let order = a.orderType === 'trial'
                ? await prisma.milkTrial.findUnique({ where: { id: a.orderId }, include: { product: true } })
                : await prisma.milkSubscription.findUnique({ where: { id: a.orderId }, include: { product: true } });
            if (!order) return { ...a, order: null };

            // Check if customer has an approved request for this delivery date
            const deliveryDate = a.deliveryDate || new Date();
            const approvedReq = order.userId ? await milkReqService.getApprovedRequestForCustomer(order.userId, deliveryDate) : null;

            let effectiveQuantity = order.dailyQuantity;
            let isSkipped = false;
            let hasExtraMilk = false;
            let extraQuantity = 0;
            let deliveryNoteTag = null;

            if (approvedReq) {
                if (approvedReq.requestType === 'SKIP_DELIVERY') {
                    isSkipped = true;
                    effectiveQuantity = 0;
                    deliveryNoteTag = 'SKIPPED – Customer Not At Home';
                } else if (approvedReq.requestType === 'EXTRA_MILK') {
                    hasExtraMilk = true;
                    extraQuantity = approvedReq.extraQuantity;
                    effectiveQuantity = (order.dailyQuantity || 0) + approvedReq.extraQuantity;
                    deliveryNoteTag = `Extra Milk (+${approvedReq.extraQuantity}L)`;
                }
            }

            return {
                ...a,
                order,
                deliveryRequest: approvedReq ? {
                    id: approvedReq.id,
                    requestType: approvedReq.requestType,
                    extraQuantity: approvedReq.extraQuantity,
                    totalQuantity: approvedReq.totalQuantity,
                    status: approvedReq.status,
                    note: approvedReq.note
                } : null,
                effectiveQuantity,
                isSkipped,
                hasExtraMilk,
                extraQuantity,
                deliveryNoteTag
            };
        }));
        res.json(enriched.filter(e => e.order !== null));
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { deliveryStatus, notes } = req.body;
        const deliveryBoyId = req.admin.id;
        const isAdmin = req.admin.role === 'ADMIN';

        const id = parseInt(assignmentId, 10);
        if (isNaN(id)) return res.status(400).json({ message: 'Invalid assignment ID' });

        const where = { id };
        if (!isAdmin) {
            where.deliveryBoyId = deliveryBoyId;
        }

        const assignment = await prisma.deliveryAssignment.findFirst({ where });
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

        let extraData = {
            deliveryStatus,
            notes: notes || assignment.notes,
            isActive: deliveryStatus !== 'Rejected'
        };

        const updated = await prisma.deliveryAssignment.update({ where: { id }, data: extraData });
        if (assignment.orderType === 'trial') { await prisma.milkTrial.update({ where: { id: assignment.orderId }, data: { deliveryStatus } }); }
        else { await prisma.milkSubscription.update({ where: { id: assignment.orderId }, data: { deliveryStatus } }); }
        if (deliveryStatus === 'Rejected') { await prisma.deliveryAssignment.update({ where: { id }, data: { isActive: false } }); }

        // Trigger notifications based on status
        (async () => {
            try {
                const order = assignment.orderType === 'trial'
                    ? await prisma.milkTrial.findUnique({ where: { id: assignment.orderId } })
                    : await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId } });

                if (deliveryStatus === 'Out for Delivery') {
                    await notificationService.notifyOutForDelivery({
                        orderId: assignment.orderId,
                        orderType: assignment.orderType,
                        customerUserId: order?.userId,
                        boyId: deliveryBoyId,
                        adminId: order?.adminId
                    });
                } else if (deliveryStatus === 'Rejected') {
                    await notificationService.notifyDeliveryFailed({
                        orderId: assignment.orderId,
                        orderType: assignment.orderType,
                        customerUserId: order?.userId,
                        boyId: deliveryBoyId,
                        adminId: order?.adminId,
                        reason: notes || 'Delivery rejected by delivery boy'
                    });
                } else if (deliveryStatus === 'Delivered') {
                    const boy = await prisma.admin.findUnique({ where: { id: deliveryBoyId }, select: { name: true } });
                    await notificationService.notifyDeliveryCompleted({
                        orderId: assignment.orderId,
                        orderType: assignment.orderType,
                        customerUserId: order?.userId,
                        boyId: deliveryBoyId,
                        boyName: boy?.name,
                        adminId: order?.adminId
                    });
                }
            } catch (err) {
                console.error('[updateDeliveryStatus notification error]', err);
            }
        })();

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
        const STATUS_ORDER = ['Pending', 'Assigned', 'Accepted', 'Out for Delivery', 'QR_SCANNED', 'AWAITING_USER_CONFIRMATION', 'PARTIALLY_DELIVERED', 'Delivered'];
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
            isQrScanned: assignment?.isQrScanned || false,
            awaitingUserConfirmation: deliveryStatus === 'AWAITING_USER_CONFIRMATION',
            timeline
        });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};



// ========================
// Security: Door QR + User Confirmation Flow
// ========================

function normalizeOrderType(orderType) {
    return orderType === 'subscription' ? 'sub' : orderType;
}

const ACTIVE_DELIVERY_STATUSES = ['Assigned', 'Accepted', 'Out for Delivery', 'QR_SCANNED', 'AWAITING_USER_CONFIRMATION', 'PARTIALLY_DELIVERED'];
const TERMINAL_DELIVERY_STATUSES = ['Delivered', 'CANCELLED', 'Cancelled', 'Rejected'];

async function getOrder(orderType, orderId) {
    const normalized = normalizeOrderType(orderType);
    return normalized === 'trial'
        ? prisma.milkTrial.findUnique({ where: { id: parseInt(orderId) }, include: { product: true } })
        : prisma.milkSubscription.findUnique({ where: { id: parseInt(orderId) }, include: { product: true } });
}

async function updateOrderDeliveryStatus(tx, orderType, orderId, deliveryStatus) {
    const normalized = normalizeOrderType(orderType);
    if (normalized === 'trial') {
        return tx.milkTrial.update({ where: { id: parseInt(orderId) }, data: { deliveryStatus } });
    }
    return tx.milkSubscription.update({ where: { id: parseInt(orderId) }, data: { deliveryStatus } });
}

async function buildOrderItem(assignment, order) {
    const unit = order?.product?.unit || (order?.milkType?.toLowerCase().includes('milk') ? 'L' : 'Qty');
    const deliveryDate = assignment.deliveryDate || new Date();
    const approvedReq = order?.userId ? await milkReqService.getApprovedRequestForCustomer(order.userId, deliveryDate) : null;

    let quantity = order?.dailyQuantity;
    let label = order?.product?.name || order?.milkType || `Order #${assignment.orderId}`;
    let isSkipped = false;
    let hasExtraMilk = false;
    let extraQuantity = 0;

    if (approvedReq) {
        if (approvedReq.requestType === 'SKIP_DELIVERY') {
            quantity = 0;
            isSkipped = true;
            label = `${label} (SKIPPED – Customer Not At Home)`;
        } else if (approvedReq.requestType === 'EXTRA_MILK') {
            quantity = (order?.dailyQuantity || 0) + approvedReq.extraQuantity;
            hasExtraMilk = true;
            extraQuantity = approvedReq.extraQuantity;
            label = `${label} (+${approvedReq.extraQuantity}L Extra)`;
        }
    }

    return {
        assignmentId: assignment.id,
        orderId: assignment.orderId,
        orderType: assignment.orderType,
        label,
        quantity,
        unit,
        isSkipped,
        hasExtraMilk,
        extraQuantity,
        regularQuantity: order?.dailyQuantity,
    };
}

async function findCustomerActiveAssignments(userId, deliveryBoyId) {
    const assignments = await prisma.deliveryAssignment.findMany({
        where: {
            deliveryBoyId,
            isActive: true,
            deliveryStatus: { in: ACTIVE_DELIVERY_STATUSES },
        },
        include: { deliveryBoy: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
    });

    const matched = [];
    for (const assignment of assignments) {
        const order = await getOrder(assignment.orderType, assignment.orderId);
        if (!order || order.userId !== userId) continue;
        if (TERMINAL_DELIVERY_STATUSES.includes(order.deliveryStatus) || TERMINAL_DELIVERY_STATUSES.includes(order.status)) continue;
        matched.push({ assignment, order });
    }
    return matched;
}

exports.generateDailyDeliveries = async (req, res) => {
    try {
        res.json({ message: 'Daily delivery codes are no longer required. Use permanent customer door QR codes.' });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.scanQRCode = async (req, res) => {
    try {
        const { qrToken, qrCode } = req.body;
        const token = qrToken || qrCode;
        const deliveryBoyId = req.admin.id;

        if (!token) return res.status(400).json({ message: 'QR token is required.' });

        const user = await prisma.admin.findUnique({
            where: { doorQrToken: token },
            select: { id: true, name: true, email: true, doorQrToken: true, isQrEnabled: true },
        });

        if (!user) return res.status(404).json({ message: 'Invalid QR code.' });
        if (!user.isQrEnabled) return res.status(400).json({ message: 'This QR code is disabled.' });

        const matches = await findCustomerActiveAssignments(user.id, deliveryBoyId);
        if (matches.length === 0) {
            return res.status(404).json({ message: 'No active order assigned to you for this customer.' });
        }

        const now = new Date();
        await prisma.$transaction(async (tx) => {
            for (const { assignment } of matches) {
                await tx.deliveryAssignment.update({
                    where: { id: assignment.id },
                    data: { isQrScanned: true, qrScannedAt: assignment.qrScannedAt || now, deliveryStatus: 'QR_SCANNED' },
                });
                await updateOrderDeliveryStatus(tx, assignment.orderType, assignment.orderId, 'QR_SCANNED');
                await tx.deliveryHistory.create({
                    data: {
                        orderType: assignment.orderType,
                        orderId: assignment.orderId,
                        userId: user.id,
                        deliveryBoyId,
                        qrToken: token,
                        qrScannedAt: now,
                        status: 'QR_SCANNED',
                        action: 'QR_SCANNED',
                        metadata: { assignmentId: assignment.id },
                    },
                });
            }
        });

        const enrichedOrders = await Promise.all(matches.map(async ({ assignment, order }) => ({
            assignmentId: assignment.id,
            orderId: assignment.orderId,
            orderType: assignment.orderType,
            deliveryStatus: 'QR_SCANNED',
            customerName: order.customerName,
            address: order.address,
            item: await buildOrderItem(assignment, order),
        })));

        res.json({
            message: 'QR verified. Select the items being delivered.',
            customer: { id: user.id, name: user.name, email: user.email },
            deliveryBoyId,
            orders: enrichedOrders,
        });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.requestDeliveryConfirmation = async (req, res) => {
    try {
        const { itemIds } = req.body;
        const orderId = parseInt(req.params.orderId, 10);
        const orderType = normalizeOrderType(req.body.orderType || req.query.orderType || 'sub');
        const deliveryBoyId = req.admin.id;

        const assignment = await prisma.deliveryAssignment.findFirst({
            where: { orderType, orderId, deliveryBoyId, isActive: true },
            include: { deliveryBoy: { select: { id: true, name: true, email: true } } },
        });

        if (!assignment) return res.status(404).json({ message: 'Assignment not found.' });
        if (!assignment.isQrScanned) return res.status(400).json({ message: 'Scan the customer door QR before requesting confirmation.' });
        if (TERMINAL_DELIVERY_STATUSES.includes(assignment.deliveryStatus)) return res.status(400).json({ message: 'This delivery is already closed.' });

        const order = await getOrder(orderType, orderId);
        if (!order) return res.status(404).json({ message: 'Order not found.' });
        if (!order.userId) return res.status(400).json({ message: 'Order is not linked to a user account.' });

        const validItemIds = Array.isArray(itemIds) ? itemIds.map(id => parseInt(id, 10)).filter(Boolean) : [];
        if (!validItemIds.includes(assignment.id)) {
            return res.status(400).json({ message: 'Selected items do not belong to this order.' });
        }

        const selectedItems = [await buildOrderItem(assignment, order)];
        await prisma.$transaction(async (tx) => {
            await tx.deliveryAssignment.update({
                where: { id: assignment.id },
                data: { selectedItems, deliveryStatus: 'AWAITING_USER_CONFIRMATION' },
            });
            await updateOrderDeliveryStatus(tx, orderType, orderId, 'AWAITING_USER_CONFIRMATION');
            await tx.userAlert.create({
                data: {
                    userId: order.userId,
                    type: 'DELIVERY_CONFIRMATION',
                    orderType,
                    orderId,
                    message: `Delivery boy ${assignment.deliveryBoy?.name || ''} has arrived. Please confirm delivery for ${selectedItems.map(i => i.label).join(', ')}.`,
                    metadata: { deliveryBoyId, deliveryBoyName: assignment.deliveryBoy?.name, selectedItems },
                },
            });
            await tx.deliveryHistory.create({
                data: {
                    orderType,
                    orderId,
                    userId: order.userId,
                    deliveryBoyId,
                    qrScannedAt: assignment.qrScannedAt,
                    itemsSelected: selectedItems,
                    status: 'AWAITING_USER_CONFIRMATION',
                    action: 'REQUESTED_USER_CONFIRMATION',
                    metadata: { assignmentId: assignment.id },
                },
            });
        });

        res.json({ message: 'User confirmation requested.', status: 'AWAITING_USER_CONFIRMATION', selectedItems });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.confirmDelivery = async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        const orderType = normalizeOrderType(req.body.orderType || req.query.orderType || 'sub');
        const userId = req.admin.id;
        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
            const order = orderType === 'trial'
                ? await tx.milkTrial.findUnique({ where: { id: orderId } })
                : await tx.milkSubscription.findUnique({ where: { id: orderId } });
            if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
            if (order.userId !== userId) throw Object.assign(new Error('You cannot confirm this delivery.'), { status: 403 });

            const assignment = await tx.deliveryAssignment.findFirst({
                where: { orderType, orderId, isActive: true, deliveryStatus: 'AWAITING_USER_CONFIRMATION' },
                include: { deliveryBoy: { select: { id: true, name: true } } },
            });
            if (!assignment) throw Object.assign(new Error('No delivery is awaiting your confirmation.'), { status: 400 });
            if (!assignment.isQrScanned) throw Object.assign(new Error('Delivery QR was not scanned.'), { status: 400 });

            const updatedAssignment = await tx.deliveryAssignment.update({
                where: { id: assignment.id },
                data: {
                    deliveryStatus: 'Delivered',
                    isOtpVerified: false,
                    userConfirmedAt: now,
                    deliveredAt: now,
                    isActive: false,
                },
            });
            await updateOrderDeliveryStatus(tx, orderType, orderId, 'Delivered');

            await tx.deliveryHistory.create({
                data: {
                    orderType,
                    orderId,
                    userId,
                    deliveryBoyId: assignment.deliveryBoyId,
                    qrScannedAt: assignment.qrScannedAt,
                    itemsSelected: assignment.selectedItems,
                    userConfirmationAt: now,
                    deliveredAt: now,
                    status: 'Delivered',
                    action: 'USER_CONFIRMED_DELIVERY',
                    metadata: { assignmentId: assignment.id, deliveryBoyName: assignment.deliveryBoy?.name },
                },
            });

            const adminId = order.adminId;
            await tx.userAlert.createMany({
                data: [
                    {
                        userId,
                        type: 'DELIVERY_COMPLETED',
                        orderType,
                        orderId,
                        message: 'Your delivery has been successfully completed.',
                        metadata: { deliveredAt: now },
                    },
                    {
                        userId: assignment.deliveryBoyId,
                        type: 'DELIVERY_CONFIRMED_BY_USER',
                        orderType,
                        orderId,
                        message: `Delivery confirmed by ${order.customerName}.`,
                        metadata: { deliveredAt: now },
                    },
                    {
                        userId: adminId,
                        type: 'DELIVERY_COMPLETED_ADMIN',
                        orderType,
                        orderId,
                        message: `Order #${orderId} has been successfully delivered by ${assignment.deliveryBoy?.name || 'delivery boy'}.`,
                        metadata: { customerName: order.customerName, deliveryBoyId: assignment.deliveryBoyId, deliveredAt: now },
                    },
                ],
            });

            await tx.userAlert.updateMany({
                where: { userId, type: 'DELIVERY_CONFIRMATION', orderType, orderId, isRead: false },
                data: { isRead: true },
            });

            // Trigger Role-Based Delivery Completed Notifications
            notificationService.notifyDeliveryCompleted({
                orderId,
                orderType,
                customerUserId: userId,
                boyId: assignment.deliveryBoyId,
                boyName: assignment.deliveryBoy?.name,
                adminId
            }).catch(err => console.error('[confirmDelivery notify error]', err));

            return updatedAssignment;
        });

        res.json({ message: 'Delivery confirmed.', assignment: result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

exports.reportDeliveryIssue = async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        const orderType = normalizeOrderType(req.body.orderType || req.query.orderType || 'sub');
        const userId = req.admin.id;
        const issue = req.body.issue || 'Customer reported an issue with delivery.';

        const order = await getOrder(orderType, orderId);
        if (!order) return res.status(404).json({ message: 'Order not found.' });
        if (order.userId !== userId) return res.status(403).json({ message: 'You cannot report this delivery.' });

        const assignment = await prisma.deliveryAssignment.findFirst({ where: { orderType, orderId, isActive: true } });
        if (!assignment) return res.status(404).json({ message: 'Active delivery not found.' });

        await prisma.$transaction(async (tx) => {
            await tx.deliveryAssignment.update({
                where: { id: assignment.id },
                data: { deliveryStatus: 'PARTIALLY_DELIVERED', confirmationIssue: issue },
            });
            await updateOrderDeliveryStatus(tx, orderType, orderId, 'PARTIALLY_DELIVERED');
            await tx.deliveryHistory.create({
                data: {
                    orderType,
                    orderId,
                    userId,
                    deliveryBoyId: assignment.deliveryBoyId,
                    qrScannedAt: assignment.qrScannedAt,
                    itemsSelected: assignment.selectedItems,
                    status: 'PARTIALLY_DELIVERED',
                    action: 'USER_REPORTED_ISSUE',
                    metadata: { issue },
                },
            });
            await tx.userAlert.create({
                data: {
                    userId: order.adminId,
                    type: 'DELIVERY_ISSUE',
                    orderType,
                    orderId,
                    message: `Customer reported a delivery issue for order #${orderId}: ${issue}`,
                    metadata: { userId, deliveryBoyId: assignment.deliveryBoyId },
                },
            });

            // Trigger Role-Based Delivery Issue Notification + Special Alert
            notificationService.notifyDeliveryIssue({
                orderId,
                orderType,
                customerUserId: userId,
                boyId: assignment.deliveryBoyId,
                adminId: order.adminId,
                issue
            }).catch(err => console.error('[reportDeliveryIssue notify error]', err));
        });

        res.json({ message: 'Issue reported. Admin has been notified.' });
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};

exports.getDeliveryHistory = async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        const orderType = normalizeOrderType(req.query.orderType || req.body?.orderType || 'sub');
        const history = await prisma.deliveryHistory.findMany({
            where: { orderId, orderType },
            orderBy: { createdAt: 'desc' },
        });
        res.json(history);
    } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
};



// ==========================================
// Delivery Boy Leave & Reassignment Handlers
// ==========================================

exports.applyLeave = async (req, res) => {
    try {
        const deliveryBoyId = req.admin.id;
        const leave = await deliveryLeaveService.applyLeave(deliveryBoyId, req.body);
        res.status(201).json({ message: "Leave request submitted successfully", leave });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getMyLeaves = async (req, res) => {
    try {
        const deliveryBoyId = req.admin.id;
        const leaves = await deliveryLeaveService.getMyLeaves(deliveryBoyId);
        res.json(leaves);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.cancelLeave = async (req, res) => {
    try {
        const leaveId = req.params.id;
        const leave = await deliveryLeaveService.cancelLeave(leaveId, req.admin.id, req.admin.role);
        res.json({ message: "Leave request cancelled successfully", leave });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getAllLeaves = async (req, res) => {
    try {
        const leaves = await deliveryLeaveService.getAllLeaves(req.query);
        res.json(leaves);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.getAffectedDeliveries = async (req, res) => {
    try {
        if (req.admin.role !== 'ADMIN' && !(req.admin.permissions && req.admin.permissions.includes('*'))) {
            return res.status(403).json({ message: "Admin access required" });
        }
        const leaveId = req.params.id;
        const result = await deliveryLeaveService.getAffectedDeliveriesForLeave(leaveId);
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.approveLeave = async (req, res) => {
    try {
        if (req.admin.role !== 'ADMIN' && !(req.admin.permissions && req.admin.permissions.includes('*'))) {
            return res.status(403).json({ message: "Admin access required" });
        }
        const leaveId = req.params.id;
        const { assignmentsByDate, globalDeliveryBoyId, notes } = req.body || {};
        const result = await deliveryLeaveService.directApproveAndAssign(leaveId, req.admin.id, {
            assignmentsByDate,
            globalDeliveryBoyId,
            notes
        });
        res.json({ message: "Leave approved and deliveries processed successfully", ...result });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.approveAndAssign = exports.approveLeave;

exports.rejectLeave = async (req, res) => {
    try {
        if (req.admin.role !== 'ADMIN' && !(req.admin.permissions && req.admin.permissions.includes('*'))) {
            return res.status(403).json({ message: "Admin access required" });
        }
        const leaveId = req.params.id;
        const leave = await deliveryLeaveService.rejectLeave(leaveId, req.admin.id, req.body.reason);
        res.json({ message: "Leave rejected successfully", leave });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getReassignmentQueue = async (req, res) => {
    try {
        if (req.admin.role !== 'ADMIN' && !(req.admin.permissions && req.admin.permissions.includes('*'))) {
            return res.status(403).json({ message: "Admin access required" });
        }
        const queue = await deliveryLeaveService.getReassignmentQueue();
        res.json(queue);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.manualReassign = async (req, res) => {
    try {
        if (req.admin.role !== 'ADMIN' && !(req.admin.permissions && req.admin.permissions.includes('*'))) {
            return res.status(403).json({ message: "Admin access required" });
        }
        const assignmentId = req.params.assignmentId;
        const { deliveryBoyId, notes } = req.body;
        if (!deliveryBoyId) {
            return res.status(400).json({ message: "New delivery boy ID is required" });
        }
        const updated = await deliveryLeaveService.manualReassign(assignmentId, deliveryBoyId, req.admin.id, notes);
        res.json({ message: "Delivery manually reassigned successfully", assignment: updated });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// =========================================================================
// DELIVERY DATE RESCHEDULE FLOW (Requirement Section 8)
// =========================================================================

exports.rescheduleDelivery = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { newDate, reason } = req.body;
        const adminId = req.admin.id;

        if (!newDate) {
            return res.status(400).json({ message: "New delivery date is required." });
        }

        const assignment = await prisma.deliveryAssignment.findUnique({
            where: { id: parseInt(assignmentId, 10) },
            include: { deliveryBoy: { select: { id: true, name: true } } }
        });

        if (!assignment) {
            return res.status(404).json({ message: "Delivery assignment not found." });
        }

        const order = assignment.orderType === 'trial'
            ? await prisma.milkTrial.findUnique({ where: { id: assignment.orderId } })
            : await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId } });

        if (!order) {
            return res.status(404).json({ message: "Associated order not found." });
        }

        const oldDate = assignment.deliveryDate;
        const targetNewDate = new Date(newDate);

        // Update assignment deliveryDate
        const updated = await prisma.deliveryAssignment.update({
            where: { id: assignment.id },
            data: {
                deliveryDate: targetNewDate,
                notes: reason ? `${assignment.notes ? assignment.notes + " | " : ""}Rescheduled: ${reason}` : assignment.notes
            }
        });

        // Trigger Notification + Special Alerts for Admin, Delivery Boy, and Customer!
        await notificationService.notifyDeliveryDateChanged({
            orderId: assignment.orderId,
            orderType: assignment.orderType,
            oldDate,
            newDate: targetNewDate,
            boyId: assignment.deliveryBoyId,
            customerUserId: order.userId,
            adminId,
            customerName: order.customerName
        });

        res.json({
            message: "Delivery date updated successfully",
            assignment: updated,
            oldDate,
            newDate: targetNewDate
        });
    } catch (error) {
        console.error("Reschedule delivery error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.rescheduleByOrder = async (req, res) => {
    try {
        const { orderType, orderId } = req.params;
        const { newDate, reason } = req.body;
        const adminId = req.admin.id;

        if (!newDate) {
            return res.status(400).json({ message: "New delivery date is required." });
        }

        const assignment = await prisma.deliveryAssignment.findFirst({
            where: { orderType, orderId: parseInt(orderId, 10), isActive: true },
            include: { deliveryBoy: { select: { id: true, name: true } } }
        });

        if (!assignment) {
            return res.status(404).json({ message: "Active delivery assignment not found for this order." });
        }

        const order = assignment.orderType === 'trial'
            ? await prisma.milkTrial.findUnique({ where: { id: assignment.orderId } })
            : await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId } });

        if (!order) {
            return res.status(404).json({ message: "Associated order not found." });
        }

        const oldDate = assignment.deliveryDate;
        const targetNewDate = new Date(newDate);

        const updated = await prisma.deliveryAssignment.update({
            where: { id: assignment.id },
            data: {
                deliveryDate: targetNewDate,
                notes: reason ? `${assignment.notes ? assignment.notes + " | " : ""}Rescheduled: ${reason}` : assignment.notes
            }
        });

        await notificationService.notifyDeliveryDateChanged({
            orderId: assignment.orderId,
            orderType: assignment.orderType,
            oldDate,
            newDate: targetNewDate,
            boyId: assignment.deliveryBoyId,
            customerUserId: order.userId,
            adminId,
            customerName: order.customerName
        });

        res.json({
            message: "Delivery date updated successfully",
            assignment: updated,
            oldDate,
            newDate: targetNewDate
        });
    } catch (error) {
        console.error("Reschedule by order error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
