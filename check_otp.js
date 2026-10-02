require('dotenv').config();
const prisma = require('./src/config/db.js');

async function check() {
    const assignments = await prisma.deliveryAssignment.findMany({ where: { isActive: true } });
    console.log(assignments.map(x => ({id: x.id, orderId: x.orderId, status: x.deliveryStatus, otp: x.deliveryOtp})));
    await prisma.$disconnect();
}
check();
