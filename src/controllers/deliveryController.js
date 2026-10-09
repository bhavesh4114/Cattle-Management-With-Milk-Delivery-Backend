const prisma = require('../config/db');
const deliveryLeaveService = require('../services/deliveryLeaveService');
const notificationService = require('../services/notificationService');
const milkReqService = require('../services/milkDeliveryRequestService');
const deliveryAutoAssignService = require('../services/deliveryAutoAssignService');

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
        const now = new Date();
        const assignment = await prisma.deliveryAssignment.create({
            data: {
                orderType,
                orderId: orderIdInt,
                deliveryBoyId: boyId,
                assignedById: adminId,
                deliveryStatus: 'ASSIGNED',
                notes: notes||null,
                isActive: true,
                deliveryDate: todayMidnight(),
                assignedAt: now
            }
        });
        if (orderType === 'trial') { await prisma.milkTrial.update({ where: { id: orderIdInt }, data: { deliveryBoyId: boyId, deliveryStatus: 'ASSIGNED' } }); }
        else { await prisma.milkSubscription.update({ where: { id: orderIdInt }, data: { deliveryBoyId: boyId, deliveryStatus: 'ASSIGNED' } }); }

        // Trigger Role-Based Delivery Assigned Notification
        const boyUser = await prisma.admin.findUnique({ where: { id: boyId }, select: { name: true } });
        const productInfo = order.product?.name || order.milkType || 'Milk';
        const fullAddress = order.pincode ? `${order.address} (${order.pincode})` : order.address;
        notificationService.notifyDeliveryAssigned({
            boyId,
            boyName: boyUser?.name,
            orderId: orderIdInt,
            orderType,
            customerName: order.customerName,
            customerUserId: order.userId,
            adminId,
            deliveryDate: todayMidnight(),
            productName: productInfo,
            quantity: order.dailyQuantity,
            unit: order.product?.unit || 'L',
            customerAddress: fullAddress,
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

        // Automatically ensure today's delivery assignments exist for all active subscriptions / ongoing trials
        await deliveryAutoAssignService.ensureDailyAssignments(isAdmin ? null : deliveryBoyId);

        const { filter } = req.query;
        const where = {};
        if (!isAdmin) {
            where.deliveryBoyId = deliveryBoyId;
        }

        if (filter === 'active') {
            where.isActive = true;
            where.deliveryStatus = { notIn: ['Delivered', 'DELIVERED'] };
        } else if (filter === 'completed') {
            where.deliveryStatus = { in: ['Delivered', 'DELIVERED'] };
        } else {
            where.OR = [
                { isActive: true },
                { deliveryStatus: { in: ['Delivered', 'DELIVERED'] } }
            ];
        }

        const assignments = await prisma.deliveryAssignment.findMany({
            where, orderBy: { createdAt: 'desc' }
        });
        const enriched = await Promise.all(assignments.map(async (a) => {
            let order = null;
            if (a.orderType === 'trial') {
                order = await prisma.milkTrial.findUnique({ where: { id: a.orderId }, include: { product: true } });
            } else if (a.orderType === 'extra') {
                const req = await prisma.milkDeliveryRequest.findUnique({
                    where: { id: a.orderId },
                    include: { customer: true, subscription: { include: { product: true } } }
                });
                if (req) {
                    const exactAccepted = req.acceptedQuantity !== null && req.acceptedQuantity !== undefined ? req.acceptedQuantity : req.extraQuantity;
                    order = {
                        id: req.id,
                        orderCategory: 'extra',
                        customerName: req.customer?.name || 'Customer',
                        phone: req.subscription?.phone || '',
                        address: req.subscription?.address || '',
                        pincode: req.subscription?.pincode || '',
                        milkType: req.subscription?.product?.name || req.subscription?.milkType || 'Milk',
                        dailyQuantity: exactAccepted, // Delivery boy sees ONLY accepted quantity!
                        product: req.subscription?.product,
                        userId: req.customerId,
                        deliveryStatus: a.deliveryStatus,
                        deliveryDate: req.deliveryDate,
                        isExtraDelivery: true,
                        acceptedQuantity: exactAccepted
                    };
                }
            } else {
                order = await prisma.milkSubscription.findUnique({ where: { id: a.orderId }, include: { product: true } });
            }
            if (!order) return { ...a, order: null };

            if (a.orderType === 'extra') {
                const exactAccepted = order.dailyQuantity;
                return {
                    ...a,
                    order,
                    deliveryRequest: {
                        id: order.id,
                        requestType: 'EXTRA_MILK',
                        extraQuantity: exactAccepted,
                        totalQuantity: exactAccepted,
                        status: a.deliveryStatus,
                        note: 'Extra Delivery'
                    },
                    effectiveQuantity: exactAccepted,
                    isSkipped: false,
                    hasExtraMilk: true,
                    extraQuantity: exactAccepted,
                    deliveryNoteTag: `Extra Delivery (${exactAccepted}L)`
                };
            }

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
                    const acceptedExtra = approvedReq.acceptedQuantity !== null && approvedReq.acceptedQuantity !== undefined ? approvedReq.acceptedQuantity : approvedReq.extraQuantity;
                    extraQuantity = acceptedExtra;
                    effectiveQuantity = (order.dailyQuantity || 0) + acceptedExtra;
                    deliveryNoteTag = `Extra Milk (+${acceptedExtra}L)`;
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
        const { deliveryStatus, notes, latitude, longitude } = req.body;
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

        // Update Delivery Boy location if provided
        if (latitude !== undefined && longitude !== undefined) {
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                await prisma.deliveryBoyProfile.upsert({
                    where: { adminId: deliveryBoyId },
                    update: { latitude: lat, longitude: lng },
                    create: { adminId: deliveryBoyId, latitude: lat, longitude: lng }
                }).catch(err => console.error('[updateDeliveryBoyProfile loc err]', err));
            }
        }

        const normTarget = (deliveryStatus || '').toUpperCase().replace(/ /g, '_');
        const now = new Date();

        // Direct marking as DELIVERED via this endpoint is strictly disallowed
        if (normTarget === 'DELIVERED') {
            return res.status(400).json({
                message: 'Direct marking as Delivered is not allowed. Customer must confirm receipt.'
            });
        }

        let extraData = {
            deliveryStatus,
            notes: notes || assignment.notes,
            isActive: normTarget !== 'REJECTED'
        };

        // Enforce Sequential Lifecycle Gates and Record Timestamps
        if (normTarget === 'PRODUCT_COLLECTED') {
            extraData.productCollectedAt = assignment.productCollectedAt || now;
            extraData.deliveryStatus = 'PRODUCT_COLLECTED';
        } else if (normTarget === 'OUT_FOR_DELIVERY') {
            // Must have collected product first
            if (!assignment.productCollectedAt && assignment.deliveryStatus !== 'PRODUCT_COLLECTED') {
                return res.status(400).json({
                    message: 'Cannot start delivery before product is collected from farm/store.'
                });
            }
            extraData.outForDeliveryAt = assignment.outForDeliveryAt || now;
            extraData.deliveryStatus = 'OUT_FOR_DELIVERY';
        } else if (normTarget === 'ARRIVED') {
            // Must have been out for delivery first
            if (!assignment.outForDeliveryAt && !['OUT_FOR_DELIVERY', 'Out for Delivery'].includes(assignment.deliveryStatus)) {
                return res.status(400).json({
                    message: 'Cannot mark arrived before starting delivery.'
                });
            }
            extraData.arrivedAt = assignment.arrivedAt || now;
            extraData.deliveryStatus = 'ARRIVED';
        } else if (normTarget === 'DELIVERY_PENDING_CUSTOMER_CONFIRMATION' || normTarget === 'AWAITING_USER_CONFIRMATION') {
            // Must have arrived first
            if (!assignment.arrivedAt && assignment.deliveryStatus !== 'ARRIVED') {
                return res.status(400).json({
                    message: 'Cannot confirm handover before arriving at customer location.'
                });
            }
            extraData.deliveryConfirmedAt = assignment.deliveryConfirmedAt || now;
            extraData.deliveryStatus = 'DELIVERY_PENDING_CUSTOMER_CONFIRMATION';
        } else if (normTarget === 'REJECTED') {
            extraData.isActive = false;
        }

        const updated = await prisma.deliveryAssignment.update({ where: { id }, data: extraData });
        const finalStatus = extraData.deliveryStatus;

        if (assignment.orderType === 'trial') {
            await prisma.milkTrial.update({ where: { id: assignment.orderId }, data: { deliveryStatus: finalStatus } });
        } else if (assignment.orderType === 'extra') {
            await prisma.milkDeliveryRequest.update({ where: { id: assignment.orderId }, data: { deliveryStatus: finalStatus } });
        } else {
            await prisma.milkSubscription.update({ where: { id: assignment.orderId }, data: { deliveryStatus: finalStatus } });
        }

        // Trigger notifications based on lifecycle status
        (async () => {
            try {
                let customerUserId = null;
                let adminId = assignment.assignedById;
                if (assignment.orderType === 'trial') {
                    const order = await prisma.milkTrial.findUnique({ where: { id: assignment.orderId } });
                    customerUserId = order?.userId;
                    adminId = order?.adminId || adminId;
                } else if (assignment.orderType === 'extra') {
                    const req = await prisma.milkDeliveryRequest.findUnique({ where: { id: assignment.orderId } });
                    customerUserId = req?.customerId;
                } else {
                    const order = await prisma.milkSubscription.findUnique({ where: { id: assignment.orderId } });
                    customerUserId = order?.userId;
                    adminId = order?.adminId || adminId;
                }

                if (finalStatus === 'OUT_FOR_DELIVERY' || normTarget === 'OUT_FOR_DELIVERY') {
                    await notificationService.notifyOutForDelivery({
                        orderId: assignment.orderId,
                        orderType: assignment.orderType,
                        customerUserId,
                        boyId: deliveryBoyId,
                        adminId
                    });
                } else if (finalStatus === 'ARRIVED' || normTarget === 'ARRIVED') {
                    await notificationService.notifyDeliveryArrived({
                        orderId: assignment.orderId,
                        orderType: assignment.orderType,
                        customerUserId,
                        boyId: deliveryBoyId,
                        adminId
                    });
                } else if (finalStatus === 'DELIVERY_PENDING_CUSTOMER_CONFIRMATION' || normTarget === 'DELIVERY_PENDING_CUSTOMER_CONFIRMATION') {
                    await notificationService.notifyDeliveryHandoverPending({
                        orderId: assignment.orderId,
                        orderType: assignment.orderType,
                        customerUserId,
                        boyId: deliveryBoyId,
                        adminId
                    });
                } else if (normTarget === 'REJECTED') {
                    await notificationService.notifyDeliveryFailed({
                        orderId: assignment.orderId,
                        orderType: assignment.orderType,
                        customerUserId,
                        boyId: deliveryBoyId,
                        adminId,
                        reason: notes || 'Delivery rejected by delivery boy'
                    });
                }
            } catch (err) {
                console.error('[updateDeliveryStatus notification error]', err);
            }
        })();

        res.json({ message: `Status updated to ${finalStatus}`, updated });
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

async function buildSubscriptionDailySchedule(order, allAssignments, extraRequests) {
    const start = new Date(order.finalStartDate || order.offeredStartDate || order.requestedStartDate);
    const end = new Date(order.finalEndDate || order.offeredEndDate || order.requestedEndDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

    const todayStr = new Date().toISOString().split('T')[0];
    const assignmentsByDate = {};
    for (const a of allAssignments) {
        if (a.deliveryDate) {
            const dStr = new Date(a.deliveryDate).toISOString().split('T')[0];
            assignmentsByDate[dStr] = a;
        }
    }

    const requestsByDate = {};
    for (const r of extraRequests) {
        if (r.deliveryDate) {
            const dStr = new Date(r.deliveryDate).toISOString().split('T')[0];
            requestsByDate[dStr] = r;
        }
    }

    const days = [];
    let cur = new Date(start);
    let dayNumber = 1;
    let deliveredCount = 0;

    while (cur <= end && days.length < 365) {
        const dStr = cur.toISOString().split('T')[0];
        const isToday = dStr === todayStr;
        const isPast = dStr < todayStr;
        const isFuture = dStr > todayStr;

        const assignment = assignmentsByDate[dStr];
        const req = requestsByDate[dStr];

        let status = 'SCHEDULED';
        let statusLabel = 'Scheduled';
        let deliveredAt = null;
        let deliveryBoyName = assignment?.deliveryBoy?.name || null;
        let extraQty = 0;
        let isSkipped = false;
        let quantity = order.dailyQuantity || 1;

        if (req) {
            if (req.requestType === 'SKIP_DELIVERY' && ['APPROVED', 'CUSTOMER_ACCEPTED', 'EXTRA_ASSIGNED', 'DELIVERED'].includes(req.status)) {
                isSkipped = true;
                quantity = 0;
                status = 'SKIPPED';
                statusLabel = 'Skipped by Customer';
            } else if (req.requestType === 'EXTRA_MILK' && ['APPROVED', 'CUSTOMER_ACCEPTED', 'EXTRA_ASSIGNED', 'DELIVERED'].includes(req.status)) {
                extraQty = req.acceptedQuantity || req.extraQuantity || 0;
                quantity += extraQty;
            }
        }

        if (assignment) {
            const aStatus = (assignment.deliveryStatus || '').toUpperCase().replace(/ /g, '_');
            if (['DELIVERED', 'COMPLETED'].includes(aStatus)) {
                status = 'DELIVERED';
                statusLabel = 'Delivered';
                deliveredAt = assignment.deliveredAt || assignment.customerConfirmedAt;
                deliveredCount++;
            } else if (['OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERY_PENDING_CUSTOMER_CONFIRMATION', 'AWAITING_USER_CONFIRMATION', 'QR_SCANNED', 'PRODUCT_COLLECTED'].includes(aStatus)) {
                status = 'IN_PROGRESS';
                statusLabel = assignment.deliveryStatus;
            } else if (aStatus === 'ASSIGNED') {
                status = isToday ? 'ASSIGNED_TODAY' : 'ASSIGNED';
                statusLabel = isToday ? 'Assigned for Today' : 'Assigned';
            }
        } else if (isPast && !isSkipped) {
            status = 'PAST';
            statusLabel = 'Past Scheduled';
        }

        days.push({
            dayNumber,
            date: dStr,
            formattedDate: cur.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            dayName: cur.toLocaleDateString('en-GB', { weekday: 'short' }),
            isToday,
            isPast,
            isFuture,
            status,
            statusLabel,
            quantity,
            unit: order.product?.unit || (order.milkType?.toLowerCase().includes('milk') ? 'L' : 'Qty'),
            extraQty,
            isSkipped,
            deliveredAt,
            deliveryBoyName,
            assignmentId: assignment?.id || null,
        });

        cur.setDate(cur.getDate() + 1);
        dayNumber++;
    }

    return {
        totalDays: days.length,
        deliveredCount,
        remainingCount: Math.max(0, days.length - deliveredCount),
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        days
    };
}

// ✅ Order Tracking Timeline & Live Location for Customer and Admin
exports.getOrderTrackingStatus = async (req, res) => {
    try {
        let { orderType, orderId } = req.query;
        if (orderType === 'subscription') orderType = 'sub';
        const orderIdInt = parseInt(orderId, 10);

        let order = await getOrder(orderType, orderIdInt);

        if (!order) return res.status(404).json({ message: 'Order not found' });

        let dailySchedule = null;
        let billingSummary = null;
        if (orderType === 'sub') {
            const allAssignments = await prisma.deliveryAssignment.findMany({
                where: { orderType: 'sub', orderId: orderIdInt },
                include: { deliveryBoy: { select: { id: true, name: true } } },
                orderBy: { deliveryDate: 'asc' }
            });
            const extraRequests = await prisma.milkDeliveryRequest.findMany({
                where: { subscriptionId: orderIdInt },
                orderBy: { deliveryDate: 'asc' }
            });
            dailySchedule = await buildSubscriptionDailySchedule(order, allAssignments, extraRequests);

            const subPayments = await prisma.milkPayment.findMany({
                where: { subscriptionId: orderIdInt },
                orderBy: { createdAt: 'desc' }
            });

            const totalDays = dailySchedule?.totalDays || order.totalDays || 1;
            const dailyRate = order.pricePerLitre || (order.totalAmount ? (order.totalAmount / totalDays) : 0);
            const deliveredCount = dailySchedule?.deliveredCount || 0;
            const deliveredAmount = Math.round(deliveredCount * dailyRate);
            const totalPaid = subPayments
                .filter(p => ['PAID', 'SUCCESS'].includes(p.paymentStatus))
                .reduce((sum, p) => sum + (p.amount || 0), 0);
            
            const totalAmount = order.totalAmount || Math.round(dailyRate * totalDays);
            const deliveredDue = Math.max(0, deliveredAmount - totalPaid);
            const totalDue = Math.max(0, totalAmount - totalPaid);

            billingSummary = {
                dailyRate,
                totalDays,
                deliveredCount,
                deliveredAmount,
                dailyAmount: Math.round(dailyRate * 1),
                weeklyAmount: Math.round(dailyRate * 7),
                monthlyAmount: Math.round(dailyRate * 30),
                totalPaid,
                deliveredDue,
                totalAmount,
                totalDue,
                payments: subPayments
            };
        }

        // Get active or latest assignment
        const assignment = await prisma.deliveryAssignment.findFirst({
            where: { orderType, orderId: orderIdInt, isActive: true },
            include: {
                deliveryBoy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        deliveryProfile: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        }) || await prisma.deliveryAssignment.findFirst({
            where: { orderType, orderId: orderIdInt },
            include: {
                deliveryBoy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        deliveryProfile: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const rawDeliveryStatus = assignment?.deliveryStatus || order.deliveryStatus || 'Pending';
        const normStatus = rawDeliveryStatus.toUpperCase().replace(/ /g, '_');

        // Order lifecycle progression
        const STAGES = [
            'ORDER_PLACED',
            'ASSIGNED',
            'PRODUCT_COLLECTED',
            'OUT_FOR_DELIVERY',
            'ARRIVED',
            'DELIVERY_PENDING_CUSTOMER_CONFIRMATION',
            'DELIVERED'
        ];

        let currentStageIdx = 0;
        if (normStatus === 'DELIVERED') currentStageIdx = 6;
        else if (normStatus === 'DELIVERY_PENDING_CUSTOMER_CONFIRMATION' || normStatus === 'AWAITING_USER_CONFIRMATION') currentStageIdx = 5;
        else if (normStatus === 'ARRIVED') currentStageIdx = 4;
        else if (normStatus === 'OUT_FOR_DELIVERY') currentStageIdx = 3;
        else if (normStatus === 'PRODUCT_COLLECTED') currentStageIdx = 2;
        else if (normStatus === 'ASSIGNED' || assignment) currentStageIdx = 1;

        const isOutForDeliveryOrBeyond = currentStageIdx >= 3;
        const boyProfile = assignment?.deliveryBoy?.deliveryProfile;

        // Coordinates & ETA
        let distanceKm = null;
        let estimatedMins = null;
        if (isOutForDeliveryOrBeyond) {
            if (currentStageIdx === 3) {
                distanceKm = 2.4;
                estimatedMins = 12;
            } else if (currentStageIdx === 4) {
                distanceKm = 0.1;
                estimatedMins = 1;
            } else if (currentStageIdx >= 5) {
                distanceKm = 0.0;
                estimatedMins = 0;
            }
        }

        const timeline = [
            {
                key: 'ORDER_PLACED',
                label: 'Order Placed',
                icon: '📋',
                done: true,
                timestamp: order.createdAt,
                note: 'Order successfully created'
            },
            {
                key: 'ASSIGNED',
                label: 'Assigned to Delivery Boy',
                icon: '🚴',
                done: currentStageIdx >= 1,
                deliveryBoyName: assignment?.deliveryBoy?.name || null,
                timestamp: assignment?.assignedAt || assignment?.createdAt || null,
                note: currentStageIdx >= 1 ? `Assigned to ${assignment?.deliveryBoy?.name || 'Partner'}` : 'Awaiting assignment'
            },
            {
                key: 'PRODUCT_COLLECTED',
                label: 'Product Collected',
                icon: '📦',
                done: currentStageIdx >= 2,
                timestamp: assignment?.productCollectedAt || null,
                note: currentStageIdx >= 2 ? 'Collected from store/farm' : 'Pending collection'
            },
            {
                key: 'OUT_FOR_DELIVERY',
                label: 'Out for Delivery',
                icon: '🚚',
                done: currentStageIdx >= 3,
                timestamp: assignment?.outForDeliveryAt || null,
                note: currentStageIdx >= 3 ? 'On the way to customer location' : 'Pending dispatch'
            },
            {
                key: 'ARRIVED',
                label: 'Arrived at Customer',
                icon: '📍',
                done: currentStageIdx >= 4,
                timestamp: assignment?.arrivedAt || null,
                note: currentStageIdx >= 4 ? 'Delivery partner arrived at destination' : 'On route'
            },
            {
                key: 'DELIVERY_PENDING_CUSTOMER_CONFIRMATION',
                label: 'Handover Confirmed',
                icon: '🤝',
                done: currentStageIdx >= 5,
                timestamp: assignment?.deliveryConfirmedAt || null,
                note: currentStageIdx >= 5 ? 'Product handed over, awaiting customer receipt confirmation' : 'Pending handover'
            },
            {
                key: 'DELIVERED',
                label: 'Delivered & Confirmed',
                icon: '✅',
                done: currentStageIdx >= 6,
                timestamp: assignment?.customerConfirmedAt || assignment?.deliveredAt || null,
                note: currentStageIdx >= 6 ? 'Customer confirmed delivery receipt' : 'Pending customer confirmation'
            }
        ];

        res.json({
            orderId: order.id,
            orderType,
            customerName: order.customerName,
            milkType: order.milkType,
            productName: order.product?.name || order.milkType,
            dailyQuantity: order.dailyQuantity,
            unit: order.product?.unit || 'L',
            address: order.address,
            pincode: order.pincode,
            orderStatus: order.status,
            paymentStatus: orderType === 'sub' ? order.paymentStatus : null,
            deliveryStatus: rawDeliveryStatus,
            deliveryBoy: assignment?.deliveryBoy ? {
                id: assignment.deliveryBoy.id,
                name: assignment.deliveryBoy.name,
                mobile: boyProfile?.mobile || 'N/A',
                latitude: boyProfile?.latitude || 23.0225,
                longitude: boyProfile?.longitude || 72.5714
            } : null,
            deliveryBoyName: assignment?.deliveryBoy?.name || null,
            isTrackingAvailable: isOutForDeliveryOrBeyond,
            distanceKm,
            estimatedMins,
            timestamps: {
                assignedAt: assignment?.assignedAt || assignment?.createdAt || null,
                productCollectedAt: assignment?.productCollectedAt || null,
                outForDeliveryAt: assignment?.outForDeliveryAt || null,
                arrivedAt: assignment?.arrivedAt || null,
                deliveryConfirmedAt: assignment?.deliveryConfirmedAt || null,
                customerConfirmedAt: assignment?.customerConfirmedAt || null
            },
            canCustomerConfirm: ['DELIVERY_PENDING_CUSTOMER_CONFIRMATION', 'AWAITING_USER_CONFIRMATION', 'ARRIVED', 'OUT_FOR_DELIVERY'].includes((assignment?.deliveryStatus || rawDeliveryStatus || '').toUpperCase().replace(/ /g, '_')) && !['Delivered', 'DELIVERED'].includes(rawDeliveryStatus),
            timeline,
            dailySchedule,
            billingSummary
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
    if (normalized === 'trial') {
        return prisma.milkTrial.findUnique({ where: { id: parseInt(orderId) }, include: { product: true } });
    }
    if (normalized === 'extra') {
        const req = await prisma.milkDeliveryRequest.findUnique({
            where: { id: parseInt(orderId) },
            include: { customer: true, subscription: { include: { product: true } } }
        });
        if (!req) return null;
        const exactAccepted = req.acceptedQuantity !== null && req.acceptedQuantity !== undefined ? req.acceptedQuantity : req.extraQuantity;
        return {
            id: req.id,
            orderCategory: 'extra',
            customerName: req.customer?.name || 'Customer',
            phone: req.subscription?.phone || '',
            address: req.subscription?.address || '',
            pincode: req.subscription?.pincode || '',
            milkType: req.subscription?.product?.name || req.subscription?.milkType || 'Milk',
            dailyQuantity: exactAccepted,
            product: req.subscription?.product,
            userId: req.customerId,
            deliveryStatus: req.deliveryStatus || 'EXTRA_ASSIGNED',
            deliveryDate: req.deliveryDate,
            acceptedQuantity: exactAccepted
        };
    }
    return prisma.milkSubscription.findUnique({ where: { id: parseInt(orderId) }, include: { product: true } });
}

async function updateOrderDeliveryStatus(tx, orderType, orderId, deliveryStatus) {
    const normalized = normalizeOrderType(orderType);
    if (normalized === 'trial') {
        return tx.milkTrial.update({ where: { id: parseInt(orderId) }, data: { deliveryStatus } });
    }
    if (normalized === 'extra') {
        return tx.milkDeliveryRequest.update({
            where: { id: parseInt(orderId) },
            data: {
                deliveryStatus,
                status: deliveryStatus === 'DELIVERED' ? 'DELIVERED' : undefined
            }
        });
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
            let order = null;
            if (orderType === 'trial') {
                order = await tx.milkTrial.findUnique({ where: { id: orderId } });
            } else if (orderType === 'extra') {
                const req = await tx.milkDeliveryRequest.findUnique({ where: { id: orderId } });
                if (req) {
                    order = {
                        id: req.id,
                        userId: req.customerId,
                        adminId: req.approvedById || 1
                    };
                }
            } else {
                order = await tx.milkSubscription.findUnique({ where: { id: orderId } });
            }
            if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
            const isAdmin = req.admin.role === 'ADMIN';
            if (order.userId && order.userId !== userId && !isAdmin) {
                throw Object.assign(new Error('You cannot confirm this delivery.'), { status: 403 });
            }

            const assignment = await tx.deliveryAssignment.findFirst({
                where: {
                    orderType,
                    orderId,
                    isActive: true,
                    deliveryStatus: { in: ['DELIVERY_PENDING_CUSTOMER_CONFIRMATION', 'AWAITING_USER_CONFIRMATION', 'ARRIVED', 'OUT_FOR_DELIVERY'] }
                },
                include: { deliveryBoy: { select: { id: true, name: true } } },
            });
            if (!assignment) throw Object.assign(new Error('No delivery is currently awaiting customer confirmation.'), { status: 400 });

            const updatedAssignment = await tx.deliveryAssignment.update({
                where: { id: assignment.id },
                data: {
                    deliveryStatus: 'Delivered',
                    customerConfirmedAt: now,
                    userConfirmedAt: now,
                    deliveredAt: now,
                    isActive: false,
                },
            });
            await updateOrderDeliveryStatus(tx, orderType, orderId, 'Delivered');
            if (orderType === 'trial') {
                await tx.milkTrial.update({ where: { id: orderId }, data: { status: 'COMPLETED', deliveryStatus: 'Delivered' } });
            } else if (orderType === 'extra') {
                await tx.milkDeliveryRequest.update({ where: { id: orderId }, data: { status: 'DELIVERED', deliveryStatus: 'Delivered' } });
            } else {
                const sub = await tx.milkSubscription.findUnique({ where: { id: orderId } });
                const endDate = sub?.finalEndDate || sub?.offeredEndDate || sub?.requestedEndDate;
                const isFinalDay = endDate && new Date() >= new Date(endDate);
                await tx.milkSubscription.update({
                    where: { id: orderId },
                    data: {
                        status: isFinalDay ? 'COMPLETED' : 'ACTIVE',
                        deliveryStatus: 'Delivered'
                    }
                });
            }

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

            const adminId = order.adminId || assignment.assignedById || 1;
            const customerName = order.customerName || 'Customer';

            const alertsToCreate = [
                {
                    userId,
                    type: 'DELIVERY_COMPLETED',
                    title: 'Delivery Confirmed',
                    role: 'USER',
                    orderType,
                    orderId,
                    message: 'Your delivery has been successfully completed and confirmed. Thank you!',
                    metadata: { deliveredAt: now },
                }
            ];

            if (assignment.deliveryBoyId) {
                alertsToCreate.push({
                    userId: assignment.deliveryBoyId,
                    type: 'DELIVERY_CONFIRMED_BY_USER',
                    title: 'Delivery Confirmed by Customer',
                    role: 'DELIVERY_BOY',
                    orderType,
                    orderId,
                    message: `Delivery #${orderId} has been confirmed as received by ${customerName}.`,
                    metadata: { deliveredAt: now },
                });
            }

            if (adminId) {
                alertsToCreate.push({
                    userId: adminId,
                    type: 'DELIVERY_COMPLETED_ADMIN',
                    title: 'Delivery Confirmed by Customer',
                    role: 'ADMIN',
                    orderType,
                    orderId,
                    message: `Order #${orderId} (${customerName}) delivery has been confirmed by customer. Delivered by ${assignment.deliveryBoy?.name || 'delivery boy'}.`,
                    metadata: { customerName, deliveryBoyId: assignment.deliveryBoyId, deliveredAt: now },
                });
            }

            await tx.userAlert.createMany({ data: alertsToCreate });

            await tx.userAlert.updateMany({
                where: { userId, type: 'DELIVERY_CONFIRMATION', orderType, orderId },
                data: { isRead: true, isDismissed: true, dismissedAt: now, readAt: now },
            });

            // Trigger Role-Based Delivery Completed Notifications
            notificationService.notifyDeliveryCompleted({
                orderId,
                orderType,
                customerUserId: userId,
                customerName,
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
            await tx.userAlert.updateMany({
                where: { userId, type: 'DELIVERY_CONFIRMATION', orderType, orderId },
                data: { isRead: true, isDismissed: true, dismissedAt: new Date(), readAt: new Date() },
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
