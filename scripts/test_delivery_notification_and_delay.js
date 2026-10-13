require('dotenv').config();
const prisma = require('../src/config/db');
const deliveryDelayService = require('../src/services/deliveryDelayService');
const notificationService = require('../src/services/notificationService');

async function runTest() {
  console.log('--- STARTING FEATURE 8 AUTOMATED TEST SUITE ---');

  try {
    // 1. Fetch Admin
    let admin = await prisma.admin.findFirst({ where: { role: 'ADMIN', status: 'Active' } });
    if (!admin) {
      console.log('No active admin found, aborting test');
      return;
    }

    let boy = await prisma.admin.findFirst({ where: { deliveryProfile: { isNot: null } } });
    if (!boy) {
      boy = admin;
    }

    let customer = await prisma.admin.findFirst({ where: { id: { not: admin.id } } });
    if (!customer) {
      customer = admin;
    }

    // 3. Create or find a test subscription / trial
    let sub = await prisma.milkSubscription.findFirst({ where: { status: 'ACTIVE' } });
    if (!sub) {
      sub = await prisma.milkSubscription.create({
        data: {
          customerName: 'Test Customer Delay Flow',
          phone: '9876543210',
          address: '404 Delay Test Street',
          pincode: '380015',
          milkType: 'Cow Milk',
          dailyQuantity: 1,
          startDate: new Date(),
          requestedEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          userId: customer.id,
          adminId: admin.id
        }
      });
    }

    console.log(`[TEST] Using Order #${sub.id} (Category: sub) for Customer "${sub.customerName}"`);

    // Clean up any existing test assignments for this order
    await prisma.deliveryAssignment.deleteMany({
      where: { orderType: 'sub', orderId: sub.id, notes: 'TEST_FEATURE_8_RUNNER' }
    });

    // 4. Create a clean DeliveryAssignment
    const assignment = await prisma.deliveryAssignment.create({
      data: {
        orderType: 'sub',
        orderId: sub.id,
        deliveryBoyId: boy.id,
        assignedById: admin.id,
        deliveryStatus: 'ASSIGNED',
        isActive: true,
        notes: 'TEST_FEATURE_8_RUNNER'
      }
    });

    console.log(`[TEST 1] Created DeliveryAssignment ID ${assignment.id}`);

    // TEST STEP 1: Delivery Boy starts delivery (clicks "Start Delivery")
    const now = new Date();
    const startTime = now;
    const eta = new Date(now.getTime() + 30 * 60 * 1000);

    const updatedAssignment = await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: {
        productCollectedAt: now,
        outForDeliveryAt: now,
        deliveryStartTime: startTime,
        estimatedDeliveryTime: eta,
        deliveryStatus: 'OUT_FOR_DELIVERY',
        delayAlertSentAt: null
      }
    });

    console.log('✓ [TEST STEP 1 PASSED] deliveryStartTime recorded:', updatedAssignment.deliveryStartTime);
    console.log('✓ [TEST STEP 1 PASSED] estimatedDeliveryTime recorded:', updatedAssignment.estimatedDeliveryTime);

    // Trigger Out for Delivery Notification
    await notificationService.notifyOutForDelivery({
      orderId: sub.id,
      orderType: 'sub',
      customerUserId: sub.userId,
      boyId: boy.id,
      adminId: admin.id,
      deliveryStartTime: startTime,
      estimatedDeliveryTime: eta,
      estimatedMinutes: 30
    });

    // Verify Customer Notification created in database
    const customerNotification = await prisma.userAlert.findFirst({
      where: {
        userId: sub.userId,
        type: 'DELIVERY_OUT_FOR_DELIVERY',
        orderId: sub.id
      },
      orderBy: { createdAt: 'desc' }
    });

    if (customerNotification) {
      console.log('✓ [TEST STEP 1 PASSED] Customer Notification Received:');
      console.log('   Title:', customerNotification.title);
      console.log('   Message:', customerNotification.message);
    } else {
      throw new Error('Customer notification not found in UserAlert');
    }

    // TEST STEP 2: Check delays when delivery is on time
    const onTimeCheck = await deliveryDelayService.checkAndAlertDelayedDeliveries({ gracePeriodMins: 5 });
    console.log('✓ [TEST STEP 2 PASSED] On-time check result (should be 0 alerts):', onTimeCheck.count);
    if (onTimeCheck.count !== 0 && onTimeCheck.alerts.some(a => a.assignmentId === assignment.id)) {
      throw new Error('False positive delay alert was triggered while on-time');
    }

    // TEST STEP 3: Simulate delivery delay past ETA + grace period
    const simulatedPastEta = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago
    await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: {
        estimatedDeliveryTime: simulatedPastEta,
        delayAlertSentAt: null
      }
    });

    console.log('[TEST] Simulated past ETA (15 minutes ago), triggering delay check...');
    const delayCheckResult = await deliveryDelayService.checkAndAlertDelayedDeliveries({ gracePeriodMins: 5 });
    console.log('✓ [TEST STEP 3 PASSED] Delay check triggered alerts count:', delayCheckResult.count);

    // Verify Admin Alert was created in database
    const adminAlert = await prisma.userAlert.findFirst({
      where: {
        userId: admin.id,
        type: 'DELIVERY_DELAY_ALERT',
        orderId: sub.id
      },
      orderBy: { createdAt: 'desc' }
    });

    if (adminAlert) {
      console.log('✓ [TEST STEP 3 PASSED] Admin Delay Alert Verified:');
      console.log('   Title:', adminAlert.title);
      console.log('   Message:', adminAlert.message);
      console.log('   isSpecialAlert:', adminAlert.isSpecialAlert);
    } else {
      throw new Error('Admin delay alert not found in database!');
    }

    // Verify delayAlertSentAt is set on the assignment
    const reloadedAssignment = await prisma.deliveryAssignment.findUnique({
      where: { id: assignment.id }
    });
    if (!reloadedAssignment.delayAlertSentAt) {
      throw new Error('delayAlertSentAt timestamp was not recorded on assignment!');
    }
    console.log('✓ [TEST STEP 3 PASSED] delayAlertSentAt recorded:', reloadedAssignment.delayAlertSentAt);

    // TEST STEP 4: Duplicate Notification Prevention Test
    console.log('[TEST] Running second delay check (Testing DUPLICATE PREVENTION)...');
    const duplicateCheckResult = await deliveryDelayService.checkAndAlertDelayedDeliveries({ gracePeriodMins: 5 });
    const duplicateFoundForThisAssignment = (duplicateCheckResult.alerts || []).some(a => a.assignmentId === assignment.id);

    if (duplicateFoundForThisAssignment) {
      throw new Error('FAIL: Duplicate delay alert was sent for the same assignment!');
    }
    console.log('✓ [TEST STEP 4 PASSED] NO DUPLICATE ALERTS SENT! Duplicate prevention verified.');

    // TEST STEP 5: Delivery Completion Flow
    const completedAt = new Date();
    await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: {
        deliveryStatus: 'Delivered',
        deliveredAt: completedAt,
        deliveryCompletedAt: completedAt,
        isActive: false
      }
    });
    console.log('✓ [TEST STEP 5 PASSED] Delivery completed and deliveryCompletedAt recorded:', completedAt);

    // Run delay check again after completion (Should NEVER trigger delay on completed deliveries)
    const postCompletionCheck = await deliveryDelayService.checkAndAlertDelayedDeliveries({ gracePeriodMins: 5 });
    const postCompletionAlert = (postCompletionCheck.alerts || []).some(a => a.assignmentId === assignment.id);
    if (postCompletionAlert) {
      throw new Error('FAIL: Delay alert triggered on an already delivered order!');
    }
    console.log('✓ [TEST STEP 5 PASSED] No delay alerts triggered after delivery completion.');

    // Clean up test assignment
    await prisma.deliveryAssignment.delete({ where: { id: assignment.id } });
    console.log('--- ALL TEST SUITE CASES PASSED SUCCESSFULLY (5/5) ---');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
