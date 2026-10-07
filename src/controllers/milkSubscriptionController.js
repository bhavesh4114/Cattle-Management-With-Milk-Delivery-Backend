const prisma = require('../config/db');
const notificationService = require('../services/notificationService');

// ========================
// 1. Milk Pricing Management
// ========================

exports.getMilkPrices = async (req, res) => {
    try {
        // If this is a single farm, all users should see the global pricing.
        // We fetch prices regardless of who created them, or we could fetch without adminId
        const prices = await prisma.milkPricing.findMany();
        res.json(prices);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.updateMilkPrice = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const { milkType, pricePerLitre } = req.body;
        
        const price = await prisma.milkPricing.upsert({
            where: {
                adminId_milkType: { adminId, milkType }
            },
            update: { pricePerLitre, effectiveDate: new Date() },
            create: { adminId, milkType, pricePerLitre }
        });
        res.json({ message: "Price updated", price });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ========================
// Delivery Boy Logic
// ========================

exports.getDeliveryBoys = async (req, res) => {
    try {
        const boys = await prisma.admin.findMany({
            where: { role: 'CUSTOM', status: 'Active' },
            select: { id: true, name: true, email: true }
        });
        res.json(boys);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.assignDelivery = async (req, res) => {
    try {
        const { type, id } = req.params; // type: 'trial' or 'sub'
        const { deliveryBoyId } = req.body;
        
        let result;
        if (type === 'trial') {
            result = await prisma.milkTrial.update({
                where: { id: parseInt(id) },
                data: { deliveryBoyId: parseInt(deliveryBoyId), deliveryStatus: 'Assigned' }
            });
        } else {
            result = await prisma.milkSubscription.update({
                where: { id: parseInt(id) },
                data: { deliveryBoyId: parseInt(deliveryBoyId), deliveryStatus: 'Assigned' }
            });
        }
        res.json({ message: "Delivery assigned successfully", result });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.getMyDeliveries = async (req, res) => {
    try {
        const deliveryBoyId = req.admin.id;
        
        const trials = await prisma.milkTrial.findMany({
            where: { deliveryBoyId },
            orderBy: { createdAt: 'desc' }
        });
        
        const subs = await prisma.milkSubscription.findMany({
            where: { deliveryBoyId },
            orderBy: { createdAt: 'desc' }
        });
        
        res.json({ trials, subs });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { type, id } = req.params;
        const { deliveryStatus } = req.body;
        
        let result;
        if (type === 'trial') {
            result = await prisma.milkTrial.update({
                where: { id: parseInt(id) },
                data: { deliveryStatus }
            });
        } else {
            result = await prisma.milkSubscription.update({
                where: { id: parseInt(id) },
                data: { deliveryStatus }
            });
        }
        res.json({ message: "Status updated successfully", result });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ========================
// 2. Milk Trial Flow
// ========================

exports.requestTrial = async (req, res) => {
    try {
        const { customerName, phone, address, pincode, milkType, dailyQuantity, startDate, endDate, notes } = req.body;
        const userId = req.admin ? req.admin.id : null;
        
        // Find main admin
        let mainAdmin = await prisma.admin.findFirst({ where: { role: 'ADMIN' } });
        if (!mainAdmin) mainAdmin = await prisma.admin.findFirst();
        if (!mainAdmin) throw new Error("No admin account available in the system.");

        const trial = await prisma.milkTrial.create({
            data: {
                adminId: mainAdmin.id,
                userId,
                customerName,
                phone,
                address,
                pincode,
                milkType,
                dailyQuantity: parseFloat(dailyQuantity),
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                notes,
                productId: req.body.productId ? parseInt(req.body.productId) : null
            }
        });

        // Trigger New Booking Notification
        notificationService.notifyNewBooking({
            orderId: trial.id,
            orderType: 'trial',
            customerName: trial.customerName,
            userId: trial.userId,
            adminId: trial.adminId
        }).catch(err => console.error('[notifyNewBooking trial error]', err));

        res.json({ message: "Trial requested", trial });
    } catch (error) {
        console.error("TRIAL REQUEST ERROR:", error);
        require('fs').appendFileSync('error.log', '\nTRIAL ERROR: ' + error.stack);
        res.status(500).json({ message: "Server error", error: error.message, stack: error.stack });
    }
};

exports.getAllTrials = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const trials = await prisma.milkTrial.findMany({ 
            where: { adminId },
            include: { product: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(trials);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.getMyTrials = async (req, res) => {
    try {
        const userId = req.admin.id;
        const trials = await prisma.milkTrial.findMany({
            where: { userId },
            include: { product: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(trials);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.updateTrialStatus = async (req, res) => {
    try {
        const trialId = parseInt(req.params.id);
        const { status, startDate, endDate } = req.body;
        
        const trial = await prisma.milkTrial.update({
            where: { id: trialId },
            data: { 
                status, 
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined
            }
        });
        res.json({ message: `Trial ${status}`, trial });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ========================
// 3. Permanent Subscription Flow
// ========================

exports.requestSubscription = async (req, res) => {
    try {
        const { customerName, phone, address, pincode, milkType, dailyQuantity, startDate, endDate, notes } = req.body;
        const userId = req.admin ? req.admin.id : null;
        let mainAdmin = await prisma.admin.findFirst({ where: { role: 'ADMIN' } });
        if (!mainAdmin) mainAdmin = await prisma.admin.findFirst();
        if (!mainAdmin) throw new Error("No admin account available in the system.");

        const sub = await prisma.milkSubscription.create({
            data: {
                adminId: mainAdmin.id,
                userId,
                customerName,
                phone,
                address,
                pincode,
                milkType,
                dailyQuantity: parseFloat(dailyQuantity),
                requestedStartDate: new Date(startDate),
                requestedEndDate: new Date(endDate),
                notes,
                productId: req.body.productId ? parseInt(req.body.productId) : null
            }
        });

        // Trigger New Booking Notification
        notificationService.notifyNewBooking({
            orderId: sub.id,
            orderType: 'sub',
            customerName: sub.customerName,
            userId: sub.userId,
            adminId: sub.adminId
        }).catch(err => console.error('[notifyNewBooking sub error]', err));

        res.json({ message: "Subscription requested", sub });
    } catch (error) {
        console.error("SUBSCRIPTION REQUEST ERROR:", error);
        require('fs').appendFileSync('error.log', '\nSUB ERROR: ' + error.stack);
        res.status(500).json({ message: "Server error", error: error.message, stack: error.stack });
    }
};

exports.getAllSubscriptions = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const subs = await prisma.milkSubscription.findMany({ 
            where: { adminId },
            include: { product: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(subs);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.getMySubscriptions = async (req, res) => {
    try {
        const userId = req.admin.id;
        const subs = await prisma.milkSubscription.findMany({ 
            where: { userId },
            include: { product: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(subs);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Admin accepts or proposes new dates
exports.adminOfferSubscription = async (req, res) => {
    try {
        const subId = parseInt(req.params.id);
        const { action, startDate, endDate } = req.body; // action: 'ACCEPT' or 'PROPOSE'

        const sub = await prisma.milkSubscription.findUnique({ where: { id: subId }, include: { product: true } });
        
        // Fetch current price
        let pricePerLitre = 0;
        if (sub.product) {
            pricePerLitre = sub.product.price;
        } else {
            // Fallback for older records
            const product = await prisma.product.findFirst({
                where: { adminId: sub.adminId, name: sub.milkType }
            });
            if (product) pricePerLitre = product.price;
        }

        if (action === 'REJECT') {
            const updated = await prisma.milkSubscription.update({
                where: { id: subId },
                data: { status: 'REJECTED' }
            });
            return res.json({ message: "Rejected", updated });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const totalAmount = totalDays * sub.dailyQuantity * pricePerLitre;

        if (action === 'ACCEPT') {
            const updated = await prisma.milkSubscription.update({
                where: { id: subId },
                data: {
                    status: 'AWAITING_PAYMENT',
                    offeredStartDate: start,
                    offeredEndDate: end,
                    finalStartDate: start,
                    finalEndDate: end,
                    pricePerLitre,
                    totalDays,
                    totalAmount
                }
            });
            return res.json({ message: "Accepted requested dates. Awaiting payment.", updated });
        } else if (action === 'PROPOSE') {
            const updated = await prisma.milkSubscription.update({
                where: { id: subId },
                data: {
                    status: 'AWAITING_CUSTOMER',
                    offeredStartDate: start,
                    offeredEndDate: end,
                    pricePerLitre,
                    totalDays,
                    totalAmount
                }
            });
            return res.json({ message: "Proposed alternative dates", updated });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Customer responds to admin offer
exports.customerRespondSubscription = async (req, res) => {
    try {
        const subId = parseInt(req.params.id);
        const { decision } = req.body; // 'ACCEPT' or 'REJECT'

        const sub = await prisma.milkSubscription.findUnique({ where: { id: subId } });

        if (decision === 'REJECT') {
            const updated = await prisma.milkSubscription.update({
                where: { id: subId },
                data: { status: 'CANCELLED' }
            });
            notificationService.notifyDeliveryCancelled({
                orderId: sub.id,
                orderType: 'sub',
                customerUserId: sub.userId,
                boyId: sub.deliveryBoyId,
                adminId: sub.adminId,
                reason: 'Customer declined subscription offer'
            }).catch(err => console.error('[notifyDeliveryCancelled error]', err));
            return res.json({ message: "Subscription cancelled", updated });
        }

        if (decision === 'ACCEPT') {
            const updated = await prisma.milkSubscription.update({
                where: { id: subId },
                data: { 
                    status: 'AWAITING_PAYMENT',
                    finalStartDate: sub.offeredStartDate,
                    finalEndDate: sub.offeredEndDate
                }
            });
            return res.json({ message: "Offer accepted. Awaiting payment.", updated });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ========================
// 4. Payment Flow
// ========================

exports.paySubscription = async (req, res) => {
    try {
        const subId = parseInt(req.params.id);
        const { method } = req.body; // 'ONLINE' or 'CASH'

        if (method === 'CASH') {
            const sub = await prisma.milkSubscription.update({
                where: { id: subId },
                data: { paymentMethod: 'Cash', paymentStatus: 'CASH_PENDING', status: 'ACTIVE' }
            });
            await prisma.milkPayment.create({
                data: { subscriptionId: subId, amount: sub.totalAmount, paymentMethod: 'Cash', paymentStatus: 'CASH_PENDING' }
            });
            return res.json({ message: "Cash payment recorded. Subscription active.", sub });
        } else if (method === 'ONLINE') {
            // Mock payment processing logic here (In real app, integrate Razorpay/Stripe)
            const sub = await prisma.milkSubscription.update({
                where: { id: subId },
                data: { paymentMethod: 'Online', paymentStatus: 'PAYMENT_PROCESSING' }
            });
            return res.json({ message: "Redirect to payment gateway", sub, orderId: `MOCK_ORDER_${Date.now()}` });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const { subscriptionId, transactionId, status } = req.body; // status: 'SUCCESS' or 'FAILED'
        
        const sub = await prisma.milkSubscription.findUnique({ where: { id: parseInt(subscriptionId) } });

        if (status === 'SUCCESS') {
            const updated = await prisma.milkSubscription.update({
                where: { id: parseInt(subscriptionId) },
                data: { paymentStatus: 'PAID', status: 'ACTIVE' }
            });
            await prisma.milkPayment.create({
                data: { subscriptionId: parseInt(subscriptionId), amount: sub.totalAmount, paymentMethod: 'Online', paymentStatus: 'PAID', transactionId, verifiedAt: new Date() }
            });
            return res.json({ message: "Payment successful. Subscription active.", updated });
        } else {
            const updated = await prisma.milkSubscription.update({
                where: { id: parseInt(subscriptionId) },
                data: { paymentStatus: 'FAILED' }
            });
            await prisma.milkPayment.create({
                data: { subscriptionId: parseInt(subscriptionId), amount: sub.totalAmount, paymentMethod: 'Online', paymentStatus: 'FAILED', transactionId }
            });
            return res.json({ message: "Payment failed.", updated });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.deleteTrial = async (req, res) => {
    try {
        await prisma.milkTrial.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Trial deleted" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.deleteSubscription = async (req, res) => {
    try {
        await prisma.milkSubscription.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: "Subscription deleted" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.editTrial = async (req, res) => {
    try {
        const { customerName, dailyQuantity, milkType, address, phone, startDate, endDate, notes } = req.body;
        const trial = await prisma.milkTrial.update({
            where: { id: parseInt(req.params.id) },
            data: { 
                ...(customerName && { customerName }),
                ...(dailyQuantity && { dailyQuantity: parseFloat(dailyQuantity) }),
                ...(milkType && { milkType }),
                ...(address && { address }),
                ...(phone && { phone }),
                ...(startDate && { startDate: new Date(startDate) }),
                ...(endDate && { endDate: new Date(endDate) }),
                ...(notes !== undefined && { notes })
            }
        });
        res.json({ message: "Trial updated", trial });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.editSubscription = async (req, res) => {
    try {
        const { customerName, dailyQuantity, milkType, address, phone, requestedStartDate, requestedEndDate, notes } = req.body;
        const sub = await prisma.milkSubscription.update({
            where: { id: parseInt(req.params.id) },
            data: { 
                ...(customerName && { customerName }),
                ...(dailyQuantity && { dailyQuantity: parseFloat(dailyQuantity) }),
                ...(milkType && { milkType }),
                ...(address && { address }),
                ...(phone && { phone }),
                ...(requestedStartDate && { requestedStartDate: new Date(requestedStartDate) }),
                ...(requestedEndDate && { requestedEndDate: new Date(requestedEndDate) }),
                ...(notes !== undefined && { notes })
            }
        });
        res.json({ message: "Subscription updated", sub });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        const adminId = req.admin.id;
        
        const activeSubscriptions = await prisma.milkSubscription.findMany({
            where: { adminId, status: 'ACTIVE' }
        });
        
        const activeTrials = await prisma.milkTrial.findMany({
            where: { adminId, status: 'ACTIVE' }
        });

        const uniqueCustomers = new Set();
        let totalDelivery = 0;
        let pendingPayments = 0;

        activeSubscriptions.forEach(sub => {
            uniqueCustomers.add(sub.phone);
            totalDelivery += sub.dailyQuantity;
            if (sub.paymentStatus === 'PENDING' || sub.paymentStatus === 'OVERDUE') {
                pendingPayments += (sub.totalAmount || 0);
            }
        });

        activeTrials.forEach(trial => {
            uniqueCustomers.add(trial.phone);
            totalDelivery += trial.dailyQuantity;
        });

        res.json({
            totalCustomers: uniqueCustomers.size,
            todayDelivery: totalDelivery,
            pendingPayments: pendingPayments
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ========================
// 5. Cancel & Delete Order Flow
// ========================

exports.cancelOrder = async (req, res) => {
    try {
        const { orderCategory, ids, id, reason } = req.body;
        const userId = req.admin ? req.admin.id : null;
        const isAdmin = req.admin?.role === 'ADMIN';

        const idList = Array.isArray(ids) ? ids : (id ? [id] : []);
        if (idList.length === 0) {
            return res.status(400).json({ message: "Order ID is required." });
        }

        const isTrial = orderCategory === 'trial';
        const cancelReason = reason || 'Cancelled by customer';

        for (const orderId of idList) {
            const intId = parseInt(orderId, 10);
            if (isTrial) {
                const trial = await prisma.milkTrial.findUnique({ where: { id: intId } });
                if (!trial) continue;
                if (!isAdmin && trial.userId && trial.userId !== userId) {
                    return res.status(403).json({ message: "Unauthorized to cancel this order." });
                }
                if (trial.status === 'COMPLETED' || trial.deliveryStatus === 'Delivered') {
                    return res.status(400).json({ message: "Completed orders cannot be cancelled." });
                }

                await prisma.milkTrial.update({
                    where: { id: intId },
                    data: {
                        status: 'CANCELLED',
                        deliveryStatus: 'Cancelled',
                        deliveryBoyId: null,
                        notes: trial.notes ? `${trial.notes} | Cancelled: ${cancelReason}` : `Cancelled: ${cancelReason}`
                    }
                });

                // Deactivate any active delivery assignments
                await prisma.deliveryAssignment.updateMany({
                    where: { orderType: 'trial', orderId: intId, isActive: true },
                    data: { isActive: false, deliveryStatus: 'Cancelled' }
                });

                // Notify admin
                notificationService.notifyDeliveryCancelled({
                    orderId: trial.id,
                    orderType: 'trial',
                    customerUserId: trial.userId,
                    customerName: trial.customerName,
                    boyId: trial.deliveryBoyId,
                    adminId: trial.adminId,
                    reason: cancelReason
                }).catch(err => console.error('[notifyDeliveryCancelled trial error]', err));
            } else {
                const sub = await prisma.milkSubscription.findUnique({ where: { id: intId } });
                if (!sub) continue;
                if (!isAdmin && sub.userId && sub.userId !== userId) {
                    return res.status(403).json({ message: "Unauthorized to cancel this subscription." });
                }
                if (sub.status === 'COMPLETED' || sub.deliveryStatus === 'Delivered') {
                    return res.status(400).json({ message: "Completed subscriptions cannot be cancelled." });
                }

                await prisma.milkSubscription.update({
                    where: { id: intId },
                    data: {
                        status: 'CANCELLED',
                        deliveryStatus: 'Cancelled',
                        deliveryBoyId: null,
                        notes: sub.notes ? `${sub.notes} | Cancelled: ${cancelReason}` : `Cancelled: ${cancelReason}`
                    }
                });

                // Deactivate any active delivery assignments
                await prisma.deliveryAssignment.updateMany({
                    where: { orderType: 'sub', orderId: intId, isActive: true },
                    data: { isActive: false, deliveryStatus: 'Cancelled' }
                });

                // Notify admin
                notificationService.notifyDeliveryCancelled({
                    orderId: sub.id,
                    orderType: 'sub',
                    customerUserId: sub.userId,
                    customerName: sub.customerName,
                    boyId: sub.deliveryBoyId,
                    adminId: sub.adminId,
                    reason: cancelReason
                }).catch(err => console.error('[notifyDeliveryCancelled sub error]', err));
            }
        }

        res.json({ message: "Order cancelled successfully." });
    } catch (error) {
        console.error("[cancelOrder error]", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.cancelTrial = async (req, res) => {
    req.body = { ...req.body, orderCategory: 'trial', ids: [req.params.id] };
    return exports.cancelOrder(req, res);
};

exports.cancelSubscription = async (req, res) => {
    req.body = { ...req.body, orderCategory: 'subscription', ids: [req.params.id] };
    return exports.cancelOrder(req, res);
};

exports.deleteTrial = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const userId = req.admin ? req.admin.id : null;
        const isAdmin = req.admin?.role === 'ADMIN';

        const trial = await prisma.milkTrial.findUnique({ where: { id } });
        if (!trial) return res.status(404).json({ message: "Order not found" });
        if (!isAdmin && trial.userId && trial.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        await prisma.deliveryAssignment.deleteMany({ where: { orderType: 'trial', orderId: id } });
        await prisma.milkTrial.delete({ where: { id } });
        res.json({ message: "Order deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.deleteSubscription = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const userId = req.admin ? req.admin.id : null;
        const isAdmin = req.admin?.role === 'ADMIN';

        const sub = await prisma.milkSubscription.findUnique({ where: { id } });
        if (!sub) return res.status(404).json({ message: "Subscription not found" });
        if (!isAdmin && sub.userId && sub.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        await prisma.deliveryAssignment.deleteMany({ where: { orderType: 'sub', orderId: id } });
        await prisma.milkPayment.deleteMany({ where: { subscriptionId: id } });
        await prisma.milkSubscription.delete({ where: { id } });
        res.json({ message: "Subscription deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
