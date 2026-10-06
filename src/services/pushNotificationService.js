/**
 * Push Notification Service (Firebase / FCM integration)
 * Fail-safe: push notification failures will NEVER crash or rollback business operations.
 */
let firebaseAdmin = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const admin = require("firebase-admin");
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = admin.credential.cert(serviceAccount);
    } else {
      credential = admin.credential.applicationDefault();
    }
    firebaseAdmin = admin.initializeApp({ credential });
    console.log("[PushService] Firebase Admin SDK initialized successfully");
  }
} catch (err) {
  console.warn("[PushService] Firebase Admin initialization skipped/failed:", err.message);
}

/**
 * Send push notification to user device(s)
 * @param {Object} options
 * @param {number} options.userId - User Admin ID
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {Object} [options.data] - Extra payload
 */
async function sendPushNotification({ userId, title, body, data = {} }) {
  try {
    if (!firebaseAdmin) {
      // Firebase is not configured in this environment
      return { success: false, reason: "FIREBASE_NOT_CONFIGURED" };
    }

    // If device tokens exist in database or user profile in the future:
    // const tokens = await prisma.userDeviceToken.findMany({ where: { userId } });
    // if (!tokens || tokens.length === 0) return { success: false, reason: "NO_DEVICE_TOKENS" };
    
    // Convert all data values to strings for FCM
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }

    /*
    const response = await firebaseAdmin.messaging().sendEachForMulticast({
      tokens: tokens.map(t => t.token),
      notification: { title, body },
      data: stringData,
    });
    return { success: true, response };
    */
    return { success: true, simulated: true };
  } catch (err) {
    console.error("[PushService] Failed to send push notification:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendPushNotification
};
