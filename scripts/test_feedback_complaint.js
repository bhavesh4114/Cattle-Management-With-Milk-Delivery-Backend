require("dotenv").config();
const jwt = require("jsonwebtoken");
const service = require("../src/services/feedbackComplaintService");
const prisma = require("../src/config/db");

async function runTests() {
  console.log("=== STARTING FEEDBACK & COMPLAINT SUITE TESTS ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    const customerId = 11; // harsh@gmail.com
    const otherCustomerId = 14; // extra_delivery_customer
    const adminId = 10; // Main Admin
    const deliveryBoyId = 12; // deliveryboy

    // Test 1: Undelivered order eligibility check
    console.log("Test 1: Undelivered order eligibility check");
    const pendingSubId = 56; // Sub 56 is Pending
    const check1 = await service.checkEligibility("subscription", pendingSubId, otherCustomerId);
    assert(!check1.isDelivered, "Order 56 is detected as NOT delivered");
    assert(!check1.eligibleForFeedback, "Feedback option is NOT eligible before delivery");
    assert(!check1.eligibleForComplaint, "Complaint option is NOT eligible before delivery");

    // Test 1b: Attempt feedback on undelivered order should fail
    try {
      await service.submitFeedback({
        orderType: "subscription",
        orderId: pendingSubId,
        customerId: otherCustomerId,
        rating: 5,
        review: "Too early"
      });
      assert(false, "Should have thrown error on undelivered order");
    } catch (err) {
      assert(
        err.message.includes("only be submitted after the order has been delivered"),
        `Correctly rejected undelivered feedback: "${err.message}"`
      );
    }

    // Clean up test feedback on Trial 8 if any from previous test runs
    await prisma.orderFeedback.deleteMany({
      where: { orderType: "trial", orderId: 8 }
    });

    // Test 2: Delivered order feedback submission
    console.log("\nTest 2: Delivered order feedback submission");
    const deliveredTrialId = 8;
    const check2 = await service.checkEligibility("trial", deliveredTrialId, customerId);
    assert(check2.isDelivered, "Order 8 is detected as DELIVERED");
    assert(check2.eligibleForFeedback, "Eligible for feedback after delivery");

    const feedback = await service.submitFeedback({
      orderType: "trial",
      orderId: deliveredTrialId,
      customerId,
      rating: 5,
      deliveryBoyRating: 4,
      productQualityRating: 5,
      review: "Fresh milk, excellent delivery punctuality!"
    });
    assert(feedback && feedback.id, `Feedback created with ID ${feedback.id}`);
    assert(feedback.rating === 5, "Rating is 5 stars");
    assert(feedback.deliveryBoyRating === 4, "Delivery boy rating is 4 stars");

    // Test 3: Duplicate feedback prevention
    console.log("\nTest 3: Duplicate feedback prevention");
    try {
      await service.submitFeedback({
        orderType: "trial",
        orderId: deliveredTrialId,
        customerId,
        rating: 4,
        review: "Duplicate attempt"
      });
      assert(false, "Should have blocked duplicate feedback");
    } catch (err) {
      assert(
        err.message.includes("Feedback has already been submitted"),
        `Duplicate feedback correctly prevented: "${err.message}"`
      );
    }

    // Test 4: Cross-customer access security
    console.log("\nTest 4: Cross-customer access security");
    try {
      await service.checkEligibility("trial", deliveredTrialId, otherCustomerId);
      assert(false, "Should have blocked cross-customer access");
    } catch (err) {
      assert(
        err.message.includes("does not belong to your account"),
        `Cross-customer order access blocked: "${err.message}"`
      );
    }

    // Clean up test complaints on Trial 8
    await prisma.customerComplaint.deleteMany({
      where: { orderType: "trial", orderId: 8 }
    });

    // Test 5: Customer complaint submission
    console.log("\nTest 5: Customer complaint submission");
    const complaint = await service.submitComplaint({
      orderType: "trial",
      orderId: deliveredTrialId,
      customerId,
      category: "Wrong milk quantity",
      description: "Ordered 2 liters cow milk, but delivery boy only handed over 1 liter bottle.",
      attachmentPath: null
    });
    assert(complaint && complaint.id, `Complaint created with ID ${complaint.id}`);
    assert(complaint.complaintCode.startsWith("CMP-"), `Generated valid Complaint Code: ${complaint.complaintCode}`);
    assert(complaint.status === "PENDING", "Initial status is PENDING");

    // Test 6: Customer viewing "My Complaints"
    console.log("\nTest 6: Customer viewing My Complaints list");
    const myComplaints = await service.getCustomerComplaints(customerId);
    assert(myComplaints.length > 0, "Customer retrieved their complaints");
    const found = myComplaints.find(c => c.id === complaint.id);
    assert(found != null, "Found newly submitted complaint in My Complaints");
    assert(found.history.length > 0, "Complaint history is present");

    // Test 7: Admin investigation and status workflow
    console.log("\nTest 7: Admin investigation and status workflow");
    const adminUser = { id: adminId, name: "Main Admin", role: "ADMIN" };
    
    // Status update to IN_PROGRESS
    const inProgress = await service.updateAdminComplaint(
      complaint.id,
      {
        status: "IN_PROGRESS",
        assignedStaffId: adminId,
        adminNotes: "Spoke with delivery boy; verifying batch dispatch log"
      },
      adminUser
    );
    assert(inProgress.status === "IN_PROGRESS", "Status updated to IN_PROGRESS");
    assert(inProgress.assignedStaffId === adminId, "Assigned to staff successfully");

    // Status update to RESOLVED with resolution notes
    const resolved = await service.updateAdminComplaint(
      complaint.id,
      {
        status: "RESOLVED",
        resolutionNotes: "Dispatched replacement 1L bottle and added Rs. 50 wallet credit"
      },
      adminUser
    );
    assert(resolved.status === "RESOLVED", "Status updated to RESOLVED");
    assert(resolved.resolvedAt != null, "resolvedAt timestamp is recorded");

    // Test 8: Customer reopening resolved complaint
    console.log("\nTest 8: Customer reopening resolved complaint");
    const reopened = await service.reopenCustomerComplaint(
      complaint.id,
      customerId,
      "Replacement bottle was delayed by another day, please expedite."
    );
    assert(reopened.status === "REOPENED", "Status updated to REOPENED");
    assert(reopened.reopenedAt != null, "reopenedAt timestamp is recorded");

    // Test 9: Admin Analytics and Statistics
    console.log("\nTest 9: Admin Analytics and Statistics");
    const stats = await service.getAdminStats();
    assert(stats.totalComplaints > 0, `Total complaints count: ${stats.totalComplaints}`);
    assert(stats.reopenedComplaints > 0, `Reopened complaints count: ${stats.reopenedComplaints}`);
    assert(stats.feedbackStats.totalFeedbacks > 0, `Total feedbacks count: ${stats.feedbackStats.totalFeedbacks}`);
    assert(stats.feedbackStats.avgRating > 0, `Average rating: ${stats.feedbackStats.avgRating}`);
    assert(stats.feedbackStats.ratingDistribution[5] > 0, "5-star rating recorded in distribution");

    console.log("\n==========================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================");

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("Test execution encountered an error:", error);
    process.exit(1);
  }
}

runTests();
