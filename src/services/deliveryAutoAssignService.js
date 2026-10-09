const prisma = require('../config/db');
const notificationService = require('./notificationService');

function todayMidnight() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/**
 * Finds the best delivery boy for a given pincode.
 * Priority:
 * 1. Active delivery boy whose assigned pincodes include this pincode, not on approved leave today.
 * 2. If multiple match, prioritize one who is 'Available' today.
 * 3. Fallback: Any active delivery boy not on approved leave today (prioritize 'Available').
 */
async function findBestDeliveryBoy(pincode) {
    const today = todayMidnight();
    const cleanPincode = pincode ? String(pincode).trim() : null;

    const boys = await prisma.admin.findMany({
        where: { role: 'CUSTOM', status: 'Active' },
        include: {
            deliveryProfile: true,
            customRole: true,
            deliveryAvailability: { where: { date: today } },
            deliveryBoyLeaves: {
                where: {
                    status: 'APPROVED',
                    startDate: { lte: today },
                    endDate: { gte: today }
                }
            }
        }
    });

    const deliveryBoys = boys.filter(b => {
        const n = (b.customRole?.name || '').toLowerCase();
        const p = Array.isArray(b.customRole?.permissions) ? b.customRole.permissions : [];
        return n.includes('deliver') || n.includes('delever') || p.some(x => String(x).toLowerCase().includes('deliver'));
    });

    if (deliveryBoys.length === 0) return null;

    // Filter out delivery boys on approved leave today
    const availableBoys = deliveryBoys.filter(b => (b.deliveryBoyLeaves || []).length === 0);
    const candidateList = availableBoys.length > 0 ? availableBoys : deliveryBoys;

    // 1. Try to find match by pincode
    if (cleanPincode) {
        const pincodeMatches = candidateList.filter(b => {
            const list = b.deliveryProfile?.pincodes || [];
            return list.map(p => String(p).trim()).includes(cleanPincode);
        });

        if (pincodeMatches.length > 0) {
            const availableToday = pincodeMatches.find(b => {
                const s = b.deliveryAvailability?.[0]?.status || b.deliveryProfile?.dailyStatus || 'Available';
                return s === 'Available';
            });
            return availableToday || pincodeMatches[0];
        }
    }

    // 2. Fallback: pick any active available delivery boy
    const availableToday = candidateList.find(b => {
        const s = b.deliveryAvailability?.[0]?.status || b.deliveryProfile?.dailyStatus || 'Available';
        return s === 'Available';
    });

    return availableToday || candidateList[0] || null;
}

/**
 * Automatically assigns a trial order to a delivery boy and creates an active DeliveryAssignment.
 */
async function autoAssignTrial(trialOrId, assignedById = 1) {
    try {
        const trial = typeof trialOrId === 'object' ? trialOrId : await prisma.milkTrial.findUnique({ where: { id: parseInt(trialOrId) } });
        if (!trial) return null;

        let boyId = trial.deliveryBoyId;
        if (!boyId) {
            const bestBoy = await findBestDeliveryBoy(trial.pincode);
            if (!bestBoy) return null;
            boyId = bestBoy.id;
            await prisma.milkTrial.update({
                where: { id: trial.id },
                data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' }
            });
        }

        const today = todayMidnight();
        const existing = await prisma.deliveryAssignment.findFirst({
            where: {
                orderType: 'trial',
                orderId: trial.id,
                deliveryDate: today
            }
        });

        let assignment = existing;
        if (!existing) {
            // Deactivate any old active assignments for this trial
            await prisma.deliveryAssignment.updateMany({
                where: { orderType: 'trial', orderId: trial.id, isActive: true },
                data: { isActive: false }
            });

            const now = new Date();
            assignment = await prisma.deliveryAssignment.create({
                data: {
                    orderType: 'trial',
                    orderId: trial.id,
                    deliveryBoyId: boyId,
                    assignedById: assignedById || trial.adminId || 1,
                    deliveryStatus: 'ASSIGNED',
                    deliveryDate: today,
                    assignedAt: now,
                    isActive: true
                }
            });

            const boyUser = await prisma.admin.findUnique({ where: { id: boyId }, select: { name: true } });
            notificationService.notifyDeliveryAssigned({
                boyId,
                boyName: boyUser?.name,
                orderId: trial.id,
                orderType: 'trial',
                customerName: trial.customerName,
                customerUserId: trial.userId,
                adminId: trial.adminId || assignedById,
                deliveryDate: today,
                productName: trial.milkType || 'Milk',
                quantity: trial.dailyQuantity,
                customerAddress: trial.address,
                isReassignment: false
            }).catch(err => console.error('[autoAssignTrial notify error]', err));
        }

        return assignment;
    } catch (err) {
        console.error('[autoAssignTrial error]', err);
        return null;
    }
}

/**
 * Automatically assigns a subscription to a delivery boy and creates today's DeliveryAssignment if active.
 */
async function autoAssignSubscription(subOrId, assignedById = 1) {
    try {
        const sub = typeof subOrId === 'object' ? subOrId : await prisma.milkSubscription.findUnique({ where: { id: parseInt(subOrId) } });
        if (!sub) return null;

        let boyId = sub.deliveryBoyId;
        if (!boyId) {
            const bestBoy = await findBestDeliveryBoy(sub.pincode);
            if (!bestBoy) return null;
            boyId = bestBoy.id;
            await prisma.milkSubscription.update({
                where: { id: sub.id },
                data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' }
            });
        }

        const today = todayMidnight();
        const start = sub.finalStartDate || sub.offeredStartDate || sub.requestedStartDate;
        const end = sub.finalEndDate || sub.offeredEndDate || sub.requestedEndDate;

        const inDateRange = (!start || start <= today) && (!end || end >= today);
        if (sub.status === 'ACTIVE' && inDateRange) {
            const existing = await prisma.deliveryAssignment.findFirst({
                where: {
                    orderType: 'sub',
                    orderId: sub.id,
                    deliveryDate: today
                }
            });

            if (!existing) {
                // Deactivate any previous active assignments for this subscription
                await prisma.deliveryAssignment.updateMany({
                    where: { orderType: 'sub', orderId: sub.id, isActive: true },
                    data: { isActive: false }
                });

                const assignment = await prisma.deliveryAssignment.create({
                    data: {
                        orderType: 'sub',
                        orderId: sub.id,
                        deliveryBoyId: boyId,
                        assignedById: assignedById || sub.adminId || 1,
                        deliveryStatus: 'Assigned',
                        deliveryDate: today,
                        isActive: true
                    }
                });

                const boyUser = await prisma.admin.findUnique({ where: { id: boyId }, select: { name: true } });
                notificationService.notifyDeliveryAssigned({
                    boyId,
                    boyName: boyUser?.name,
                    orderId: sub.id,
                    orderType: 'sub',
                    customerName: sub.customerName,
                    customerUserId: sub.userId,
                    adminId: sub.adminId || assignedById,
                    deliveryDate: today,
                    isReassignment: false
                }).catch(err => console.error('[autoAssignSubscription notify error]', err));

                return assignment;
            }
            return existing;
        }

        return null;
    } catch (err) {
        console.error('[autoAssignSubscription error]', err);
        return null;
    }
}

/**
 * Ensures that for today, all active subscriptions and active trials have an active DeliveryAssignment
 * so they appear in the delivery boy's "My Deliveries" list.
 */
async function ensureDailyAssignments(targetDeliveryBoyId = null) {
    try {
        const today = todayMidnight();

        // 1. Process active subscriptions
        const subs = await prisma.milkSubscription.findMany({
            where: {
                status: 'ACTIVE',
                paymentStatus: { in: ['PAID', 'CASH_PENDING'] },
                OR: [
                    { finalStartDate: { lte: today }, finalEndDate: { gte: today } },
                    { finalStartDate: null, requestedStartDate: { lte: today }, requestedEndDate: { gte: today } }
                ]
            }
        });

        for (const sub of subs) {
            let boyId = sub.deliveryBoyId;
            if (!boyId) {
                const bestBoy = await findBestDeliveryBoy(sub.pincode);
                if (bestBoy) {
                    boyId = bestBoy.id;
                    await prisma.milkSubscription.update({
                        where: { id: sub.id },
                        data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' }
                    });
                }
            }

            if (!boyId) continue;
            if (targetDeliveryBoyId && boyId !== targetDeliveryBoyId) continue;

            const existing = await prisma.deliveryAssignment.findFirst({
                where: {
                    orderType: 'sub',
                    orderId: sub.id,
                    deliveryDate: today
                }
            });

            if (!existing) {
                await prisma.deliveryAssignment.create({
                    data: {
                        orderType: 'sub',
                        orderId: sub.id,
                        deliveryBoyId: boyId,
                        assignedById: sub.adminId || 1,
                        deliveryStatus: 'Assigned',
                        deliveryDate: today,
                        isActive: true
                    }
                });
            }
        }

        // 2. Process trials that are ongoing today
        const trials = await prisma.milkTrial.findMany({
            where: {
                status: { notIn: ['CANCELLED', 'REJECTED'] },
                deliveryStatus: { notIn: ['Cancelled', 'Rejected'] },
                startDate: { lte: new Date() },
                endDate: { gte: today }
            }
        });

        for (const trial of trials) {
            let boyId = trial.deliveryBoyId;
            if (!boyId) {
                const bestBoy = await findBestDeliveryBoy(trial.pincode);
                if (bestBoy) {
                    boyId = bestBoy.id;
                    await prisma.milkTrial.update({
                        where: { id: trial.id },
                        data: { deliveryBoyId: boyId, deliveryStatus: 'Assigned' }
                    });
                }
            }

            if (!boyId) continue;
            if (targetDeliveryBoyId && boyId !== targetDeliveryBoyId) continue;

            const existing = await prisma.deliveryAssignment.findFirst({
                where: {
                    orderType: 'trial',
                    orderId: trial.id,
                    deliveryDate: today
                }
            });

            if (!existing) {
                await prisma.deliveryAssignment.create({
                    data: {
                        orderType: 'trial',
                        orderId: trial.id,
                        deliveryBoyId: boyId,
                        assignedById: trial.adminId || 1,
                        deliveryStatus: 'Assigned',
                        deliveryDate: today,
                        isActive: true
                    }
                });
            }
        }
    } catch (err) {
        console.error('[ensureDailyAssignments error]', err);
    }
}

module.exports = {
    todayMidnight,
    findBestDeliveryBoy,
    autoAssignTrial,
    autoAssignSubscription,
    ensureDailyAssignments
};
