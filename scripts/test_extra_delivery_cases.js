require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../src/config/db');
const milkDeliveryRequestService = require('../src/services/milkDeliveryRequestService');
const deliveryController = require('../src/controllers/deliveryController');

async function runAllTestCases() {
  console.log('================================================================');
  console.log('STARTING AUTOMATED E2E VERIFICATION OF ALL 9 BUSINESS TEST CASES');
  console.log('================================================================');

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const dayAfterTomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0];

  // 1. Setup Test Admin
  let admin = await prisma.admin.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    admin = await prisma.admin.create({
      data: {
        name: 'Primary Admin',
        email: 'main_admin@dairy.local',
        password: 'hashedpassword',
        role: 'ADMIN',
        status: 'Active',
      },
    });
  }

  // 2. Setup Test Customer
  let testCustomer = await prisma.admin.findFirst({
    where: { email: 'extra_delivery_customer@dairy.local' },
  });
  if (!testCustomer) {
    testCustomer = await prisma.admin.create({
      data: {
        name: 'Bhavesh Customer',
        email: 'extra_delivery_customer@dairy.local',
        password: 'hashedpassword',
        role: 'CUSTOM',
        status: 'Active',
      },
    });
  }

  // Find or create Delivery Boy CustomRole
  let deliveryRole = await prisma.customRole.findFirst({
    where: { name: 'Delivery Boy' },
  });
  if (!deliveryRole) {
    deliveryRole = await prisma.customRole.create({
      data: {
        name: 'Delivery Boy',
        permissions: ['deliveries', 'delivery_tracking'],
      },
    });
  }

  // 3. Setup Regular Delivery Boy (Sudhir)
  let regularBoy = await prisma.admin.findFirst({
    where: { email: 'sudhir_delivery@dairy.local' },
  });
  if (!regularBoy) {
    regularBoy = await prisma.admin.create({
      data: {
        name: 'Sudhir (Regular Delivery Boy)',
        email: 'sudhir_delivery@dairy.local',
        password: 'hashedpassword',
        role: 'CUSTOM',
        customRoleId: deliveryRole.id,
        status: 'Active',
      },
    });
  } else {
    await prisma.admin.update({
      where: { id: regularBoy.id },
      data: { role: 'CUSTOM', customRoleId: deliveryRole.id, status: 'Active' },
    });
  }

  // 4. Setup Alternative Delivery Boy (Ramesh)
  let altBoy = await prisma.admin.findFirst({
    where: { email: 'ramesh_delivery@dairy.local' },
  });
  if (!altBoy) {
    altBoy = await prisma.admin.create({
      data: {
        name: 'Ramesh (Alternative Delivery Boy)',
        email: 'ramesh_delivery@dairy.local',
        password: 'hashedpassword',
        role: 'CUSTOM',
        customRoleId: deliveryRole.id,
        status: 'Active',
      },
    });
  } else {
    await prisma.admin.update({
      where: { id: altBoy.id },
      data: { role: 'CUSTOM', customRoleId: deliveryRole.id, status: 'Active' },
    });
  }

  // 5. Setup Product
  let testProduct = await prisma.product.findFirst();
  if (!testProduct) {
    testProduct = await prisma.product.create({
      data: {
        name: 'Pure Cow Milk',
        price: 60,
        unit: 'L',
        adminId: admin.id,
      },
    });
  }

  // Helper: Reset and create Active Monthly Subscription with regularBoy assigned
  async function setupActiveSubscription() {
    await prisma.deliveryAssignment.deleteMany({
      where: {
        OR: [
          { deliveryBoyId: regularBoy.id },
          { deliveryBoyId: altBoy.id },
        ],
      },
    });
    await prisma.milkDeliveryRequest.deleteMany({ where: { customerId: testCustomer.id } });
    await prisma.milkSubscription.deleteMany({ where: { userId: testCustomer.id } });
    await prisma.deliveryBoyLeave.deleteMany({
      where: { deliveryBoyId: { in: [regularBoy.id, altBoy.id] } },
    });

    const sub = await prisma.milkSubscription.create({
      data: {
        userId: testCustomer.id,
        adminId: admin.id,
        customerName: testCustomer.name,
        phone: '9876543210',
        address: '101, Gokul Dham Society, Satellite',
        pincode: '380015',
        productId: testProduct.id,
        milkType: testProduct.name,
        dailyQuantity: 1,
        requestedStartDate: new Date(),
        requestedEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        finalStartDate: new Date(),
        finalEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        deliveryBoyId: regularBoy.id,
      },
    });

    // Also link regular delivery assignment
    await prisma.deliveryAssignment.create({
      data: {
        orderType: 'sub',
        orderId: sub.id,
        deliveryBoyId: regularBoy.id,
        deliveryStatus: 'ASSIGNED',
        assignedById: admin.id,
        isActive: true,
      },
    });

    return sub;
  }

  const results = [];

  // =================================================================
  // CASE 1: Customer requests 5 L, Available = 5 L
  // → Admin offers 5 L
  // → Customer accepts
  // → Regular Delivery Boy assigned
  // → Delivery proceeds
  // =================================================================
  console.log('\n--- Running CASE 1 ---');
  try {
    const sub = await setupActiveSubscription();
    // Step 1: Customer requests 5 L
    const req1 = await milkDeliveryRequestService.createRequest(testCustomer.id, {
      deliveryDate: tomorrowStr,
      requestType: 'EXTRA_MILK',
      extraQuantity: 5,
      subscriptionId: sub.id,
    });
    if (req1.status !== 'EXTRA_REQUESTED') throw new Error(`Initial status should be EXTRA_REQUESTED, got ${req1.status}`);

    // Step 2: Admin checks available (5L) and offers 5L
    const offered1 = await milkDeliveryRequestService.offerAvailableQuantity(req1.id, admin.id, {
      availableQuantity: 5,
      offeredQuantity: 5,
    });
    if (offered1.status !== 'ADMIN_OFFERED' || offered1.offeredQuantity !== 5) {
      throw new Error(`Offer failed, status: ${offered1.status}`);
    }

    // Step 3: Customer accepts
    const accepted1 = await milkDeliveryRequestService.customerRespondToOffer(req1.id, testCustomer.id, 'ACCEPT');
    if (accepted1.status !== 'CUSTOMER_ACCEPTED' || accepted1.acceptedQuantity !== 5) {
      throw new Error(`Customer accept failed, status: ${accepted1.status}`);
    }

    // Step 4: Regular Delivery Boy assigned
    const assigned1 = await milkDeliveryRequestService.assignDeliveryBoy(req1.id, admin.id, {
      deliveryBoyId: regularBoy.id,
    });
    if (assigned1.status !== 'EXTRA_ASSIGNED' || assigned1.assignedDeliveryBoyId !== regularBoy.id) {
      throw new Error(`Assignment failed, status: ${assigned1.status}`);
    }

    // Step 5: Delivery proceeds
    await prisma.milkDeliveryRequest.update({
      where: { id: req1.id },
      data: { deliveryStatus: 'DELIVERED', status: 'DELIVERED' },
    });
    const final1 = await prisma.milkDeliveryRequest.findUnique({ where: { id: req1.id } });
    if (final1.status !== 'DELIVERED') throw new Error('Delivery proceed failed');

    results.push({ caseNum: 1, name: 'Customer requests 5L, Available 5L -> Admin offers 5L -> Customer accepts -> Assigned to Regular -> Delivered', passed: true });
    console.log('✅ CASE 1 PASSED');
  } catch (err) {
    results.push({ caseNum: 1, name: 'CASE 1', passed: false, error: err.message });
    console.error('❌ CASE 1 FAILED:', err.message);
  }

  // =================================================================
  // CASE 2: Customer requests 5 L, Available = 3 L
  // → Admin offers 3 L
  // → Customer accepts
  // → Delivery Boy gets ONLY 3 L
  // =================================================================
  console.log('\n--- Running CASE 2 ---');
  try {
    const sub = await setupActiveSubscription();
    // Step 1: Request 5 L
    const req2 = await milkDeliveryRequestService.createRequest(testCustomer.id, {
      deliveryDate: tomorrowStr,
      requestType: 'EXTRA_MILK',
      extraQuantity: 5,
      subscriptionId: sub.id,
    });

    // Step 2: Admin offers 3 L (Available 3 L)
    const offered2 = await milkDeliveryRequestService.offerAvailableQuantity(req2.id, admin.id, {
      availableQuantity: 3,
      offeredQuantity: 3,
    });
    if (offered2.offeredQuantity !== 3) throw new Error('Offered quantity mismatch');

    // Step 3: Customer accepts 3 L
    const accepted2 = await milkDeliveryRequestService.customerRespondToOffer(req2.id, testCustomer.id, 'ACCEPT');
    if (accepted2.acceptedQuantity !== 3) throw new Error('Accepted quantity mismatch');

    // Step 4: Admin assigns regular boy
    const assigned2 = await milkDeliveryRequestService.assignDeliveryBoy(req2.id, admin.id, {
      deliveryBoyId: regularBoy.id,
    });

    // Step 5: Verify Delivery Boy assignment
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: { orderType: 'extra', orderId: req2.id },
    });
    if (!assignment) throw new Error('Delivery assignment record not found');

    // Step 6: Verify Delivery Boy view in getMyDeliveries logic
    const reqFromDb = await prisma.milkDeliveryRequest.findUnique({ where: { id: req2.id } });
    if (reqFromDb.acceptedQuantity !== 3) throw new Error(`Delivery boy received ${reqFromDb.acceptedQuantity}L instead of 3L!`);

    results.push({ caseNum: 2, name: 'Customer requests 5L, Available 3L -> Admin offers 3L -> Customer accepts -> Delivery Boy gets ONLY 3L', passed: true });
    console.log('✅ CASE 2 PASSED');
  } catch (err) {
    results.push({ caseNum: 2, name: 'CASE 2', passed: false, error: err.message });
    console.error('❌ CASE 2 FAILED:', err.message);
  }

  // =================================================================
  // CASE 3: Customer requests 5 L, Available = 3 L
  // → Customer rejects
  // → No Delivery Boy assignment
  // =================================================================
  console.log('\n--- Running CASE 3 ---');
  try {
    const sub = await setupActiveSubscription();
    const req3 = await milkDeliveryRequestService.createRequest(testCustomer.id, {
      deliveryDate: tomorrowStr,
      requestType: 'EXTRA_MILK',
      extraQuantity: 5,
      subscriptionId: sub.id,
    });
    await milkDeliveryRequestService.offerAvailableQuantity(req3.id, admin.id, {
      availableQuantity: 3,
      offeredQuantity: 3,
    });

    // Customer rejects
    const rejected3 = await milkDeliveryRequestService.customerRespondToOffer(req3.id, testCustomer.id, 'REJECT');
    if (rejected3.status !== 'EXTRA_REQUEST_REJECTED') throw new Error(`Expected EXTRA_REQUEST_REJECTED, got ${rejected3.status}`);

    // Verify Admin CANNOT assign delivery boy
    let assignBlocked = false;
    try {
      await milkDeliveryRequestService.assignDeliveryBoy(req3.id, admin.id, {
        deliveryBoyId: regularBoy.id,
      });
    } catch (e) {
      assignBlocked = true;
    }
    if (!assignBlocked) throw new Error('Admin should NOT be able to assign delivery boy on rejected request!');

    // Verify no assignment created
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: { orderType: 'extra', orderId: req3.id },
    });
    if (assignment) throw new Error('Assignment was created despite rejection!');

    results.push({ caseNum: 3, name: 'Customer requests 5L, Available 3L -> Customer rejects -> EXTRA_REQUEST_REJECTED -> Assignment blocked', passed: true });
    console.log('✅ CASE 3 PASSED');
  } catch (err) {
    results.push({ caseNum: 3, name: 'CASE 3', passed: false, error: err.message });
    console.error('❌ CASE 3 FAILED:', err.message);
  }

  // =================================================================
  // CASE 4: Available = 0 L
  // → No offer / assignment
  // =================================================================
  console.log('\n--- Running CASE 4 ---');
  try {
    const sub = await setupActiveSubscription();
    const req4 = await milkDeliveryRequestService.createRequest(testCustomer.id, {
      deliveryDate: tomorrowStr,
      requestType: 'EXTRA_MILK',
      extraQuantity: 5,
      subscriptionId: sub.id,
    });

    let offerBlocked = false;
    try {
      await milkDeliveryRequestService.offerAvailableQuantity(req4.id, admin.id, {
        availableQuantity: 0,
        offeredQuantity: 0,
      });
    } catch (e) {
      offerBlocked = e.message.includes('greater than 0');
    }
    if (!offerBlocked) throw new Error('Offer with 0L available stock should be rejected!');

    results.push({ caseNum: 4, name: 'Available = 0 L -> Offer/assignment not allowed', passed: true });
    console.log('✅ CASE 4 PASSED');
  } catch (err) {
    results.push({ caseNum: 4, name: 'CASE 4', passed: false, error: err.message });
    console.error('❌ CASE 4 FAILED:', err.message);
  }

  // =================================================================
  // CASE 5: Customer has no Active Monthly Subscription
  // → Extra Delivery not allowed
  // =================================================================
  console.log('\n--- Running CASE 5 ---');
  try {
    // Delete all subscriptions for customer
    await prisma.milkDeliveryRequest.deleteMany({ where: { customerId: testCustomer.id } });
    await prisma.milkSubscription.deleteMany({ where: { userId: testCustomer.id } });

    let requestBlocked = false;
    try {
      await milkDeliveryRequestService.createRequest(testCustomer.id, {
        deliveryDate: tomorrowStr,
        requestType: 'EXTRA_MILK',
        extraQuantity: 5,
      });
    } catch (e) {
      requestBlocked = e.message.includes('active monthly subscription');
    }
    if (!requestBlocked) throw new Error('Customer without active monthly subscription should be rejected!');

    results.push({ caseNum: 5, name: 'Customer has no Active Monthly Subscription -> Extra Delivery not allowed', passed: true });
    console.log('✅ CASE 5 PASSED');
  } catch (err) {
    results.push({ caseNum: 5, name: 'CASE 5', passed: false, error: err.message });
    console.error('❌ CASE 5 FAILED:', err.message);
  }

  // =================================================================
  // CASE 6: Same-day Extra Delivery
  // → Rejected (1-day advance rule)
  // =================================================================
  console.log('\n--- Running CASE 6 ---');
  try {
    const sub = await setupActiveSubscription();
    let sameDayBlocked = false;
    try {
      await milkDeliveryRequestService.createRequest(testCustomer.id, {
        deliveryDate: todayStr, // Today!
        requestType: 'EXTRA_MILK',
        extraQuantity: 5,
        subscriptionId: sub.id,
      });
    } catch (e) {
      sameDayBlocked = e.message.includes('at least 1 day in advance');
    }
    if (!sameDayBlocked) throw new Error('Same-day Extra Delivery should be rejected!');

    results.push({ caseNum: 6, name: 'Same-day Extra Delivery -> Rejected (1-day advance rule)', passed: true });
    console.log('✅ CASE 6 PASSED');
  } catch (err) {
    results.push({ caseNum: 6, name: 'CASE 6', passed: false, error: err.message });
    console.error('❌ CASE 6 FAILED:', err.message);
  }

  // =================================================================
  // CASE 7: Customer accepts 3 L
  // → Delivery Boy must NOT see 5 L; must see exactly 3 L
  // =================================================================
  console.log('\n--- Running CASE 7 ---');
  try {
    const sub = await setupActiveSubscription();
    const req7 = await milkDeliveryRequestService.createRequest(testCustomer.id, {
      deliveryDate: tomorrowStr,
      requestType: 'EXTRA_MILK',
      extraQuantity: 5, // Requested 5L
      subscriptionId: sub.id,
    });
    await milkDeliveryRequestService.offerAvailableQuantity(req7.id, admin.id, {
      availableQuantity: 3,
      offeredQuantity: 3,
    }); // Offered 3L
    await milkDeliveryRequestService.customerRespondToOffer(req7.id, testCustomer.id, 'ACCEPT'); // Accepted 3L
    await milkDeliveryRequestService.assignDeliveryBoy(req7.id, admin.id, {
      deliveryBoyId: regularBoy.id,
    });

    // Mock Delivery Boy calling getMyDeliveries
    const mockReq = {
      admin: { id: regularBoy.id, role: 'DELIVERY' },
      query: { date: tomorrowStr },
    };
    let jsonOutput = null;
    const mockRes = {
      json: (data) => { jsonOutput = data; },
      status: () => mockRes,
    };

    await deliveryController.getMyDeliveries(mockReq, mockRes);
    const extraDeliveryItem = jsonOutput.find((item) => item.orderType === 'extra' && item.orderId === req7.id);
    if (!extraDeliveryItem) throw new Error('Extra delivery not found in Delivery Boy deliveries list!');
    if (extraDeliveryItem.order.dailyQuantity !== 3) {
      throw new Error(`Delivery Boy saw ${extraDeliveryItem.order.dailyQuantity}L instead of exactly 3L!`);
    }
    if (extraDeliveryItem.effectiveQuantity !== 3) {
      throw new Error(`effectiveQuantity is ${extraDeliveryItem.effectiveQuantity} instead of 3L!`);
    }

    results.push({ caseNum: 7, name: 'Customer accepts 3L -> Delivery Boy sees ONLY 3L (NOT original 5L)', passed: true });
    console.log('✅ CASE 7 PASSED');
  } catch (err) {
    results.push({ caseNum: 7, name: 'CASE 7', passed: false, error: err.message });
    console.error('❌ CASE 7 FAILED:', err.message);
  }

  // =================================================================
  // CASE 8: Customer accepts offer
  // → Admin assigns Customer\'s regular Delivery Boy
  // =================================================================
  console.log('\n--- Running CASE 8 ---');
  try {
    const sub = await setupActiveSubscription();
    const req8 = await milkDeliveryRequestService.createRequest(testCustomer.id, {
      deliveryDate: tomorrowStr,
      requestType: 'EXTRA_MILK',
      extraQuantity: 2,
      subscriptionId: sub.id,
    });
    await milkDeliveryRequestService.offerAvailableQuantity(req8.id, admin.id, {
      availableQuantity: 2,
      offeredQuantity: 2,
    });
    await milkDeliveryRequestService.customerRespondToOffer(req8.id, testCustomer.id, 'ACCEPT');

    // Admin fetches all requests to check regular delivery boy recommendation
    const allReqs = await milkDeliveryRequestService.getAllRequests();
    const enriched = allReqs.find((r) => r.id === req8.id);
    if (!enriched.regularDeliveryBoy || enriched.regularDeliveryBoy.id !== regularBoy.id) {
      throw new Error('Customer regular delivery boy not correctly identified in Admin panel');
    }

    // Admin assigns regular delivery boy
    const assigned8 = await milkDeliveryRequestService.assignDeliveryBoy(req8.id, admin.id, {
      deliveryBoyId: enriched.regularDeliveryBoy.id,
    });
    if (assigned8.assignedDeliveryBoyId !== regularBoy.id) {
      throw new Error('Assigned delivery boy does not match regular delivery boy');
    }

    results.push({ caseNum: 8, name: 'Customer accepts offer -> Admin assigns Customer\'s regular Delivery Boy (Sudhir)', passed: true });
    console.log('✅ CASE 8 PASSED');
  } catch (err) {
    results.push({ caseNum: 8, name: 'CASE 8', passed: false, error: err.message });
    console.error('❌ CASE 8 FAILED:', err.message);
  }

  // =================================================================
  // CASE 9: Regular Delivery Boy is on Leave
  // → Do not assign that Delivery Boy
  // → Admin should be able to select an eligible alternative
  // =================================================================
  console.log('\n--- Running CASE 9 ---');
  try {
    const sub = await setupActiveSubscription();
    const targetDate = new Date(dayAfterTomorrow);

    // Put Regular Delivery Boy (Sudhir) on approved leave for dayAfterTomorrow
    await prisma.deliveryBoyLeave.create({
      data: {
        deliveryBoyId: regularBoy.id,
        startDate: targetDate,
        endDate: targetDate,
        status: 'APPROVED',
        reason: 'Family Emergency Leave',
      },
    });

    const req9 = await milkDeliveryRequestService.createRequest(testCustomer.id, {
      deliveryDate: dayAfterTomorrowStr,
      requestType: 'EXTRA_MILK',
      extraQuantity: 2,
      subscriptionId: sub.id,
    });
    await milkDeliveryRequestService.offerAvailableQuantity(req9.id, admin.id, {
      availableQuantity: 2,
      offeredQuantity: 2,
    });
    await milkDeliveryRequestService.customerRespondToOffer(req9.id, testCustomer.id, 'ACCEPT');

    // Attempt to assign Sudhir (on leave) -> MUST BE BLOCKED
    let regularBlocked = false;
    try {
      await milkDeliveryRequestService.assignDeliveryBoy(req9.id, admin.id, {
        deliveryBoyId: regularBoy.id,
      });
    } catch (e) {
      regularBlocked = e.message.includes('on approved leave');
    }
    if (!regularBlocked) {
      throw new Error('Delivery Boy on approved leave was assigned when they should have been blocked!');
    }

    // Admin assigns eligible alternative (Ramesh) -> MUST SUCCEED
    const assignedAlt = await milkDeliveryRequestService.assignDeliveryBoy(req9.id, admin.id, {
      deliveryBoyId: altBoy.id,
    });
    if (assignedAlt.assignedDeliveryBoyId !== altBoy.id) {
      throw new Error('Alternative delivery boy assignment failed');
    }

    results.push({ caseNum: 9, name: 'Regular Delivery Boy is on Leave -> Blocked from assignment -> Alternative eligible boy (Ramesh) assigned successfully', passed: true });
    console.log('✅ CASE 9 PASSED');
  } catch (err) {
    results.push({ caseNum: 9, name: 'CASE 9', passed: false, error: err.message });
    console.error('❌ CASE 9 FAILED:', err.message);
  }

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('\n================================================================');
  console.log('AUTOMATED TEST SUMMARY');
  console.log('================================================================');
  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`[CASE ${r.caseNum}] ${mark} - ${r.name}`);
    if (!r.passed) {
      allPassed = false;
      console.log(`   Error: ${r.error}`);
    }
  }
  console.log('================================================================');
  console.log(allPassed ? '🎉 ALL 9 TEST CASES PASSED SUCCESSFULLY!' : '⚠️ SOME TEST CASES FAILED');
  console.log('================================================================');

  await prisma.$disconnect();
}

runAllTestCases().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
