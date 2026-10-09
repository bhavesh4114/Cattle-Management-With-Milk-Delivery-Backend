require('dotenv/config');
const prisma = require('./src/config/db');
const bcrypt = require('bcrypt');

async function resetDatabase() {
    console.log('--- Starting Complete Database Reset ---');

    console.log('Cleaning up existing data...');
    // Delete in order to respect foreign key constraints
    const tablesToClear = [
        'milkDeliveryRequest',
        'deliveryBoyLeave',
        'deliveryHistory',
        'userAlert',
        'deliveryAssignment',
        'deliveryAvailability',
        'deliveryBoyProfile',
        'milkPayment',
        'milkSubscription',
        'milkTrial',
        'orderHistoryLine',
        'customerMilkOrder',
        'staffMilkReport',
        'milkAllocation',
        'conversionRule',
        'product',
        'foodIntake',
        'cowFoodRecord',
        'foodPurchase',
        'milkRecord',
        'treatment',
        'cowSale',
        'cowDeath',
        'reproductionRecord',
        'animalFeedingPlan',
        'stockAdjustment',
        'orderItem',
        'order',
        'item',
        'cow',
        'admin',
        'customRole'
    ];

    for (const table of tablesToClear) {
        if (prisma[table] && typeof prisma[table].deleteMany === 'function') {
            await prisma[table].deleteMany();
            console.log(`✓ Cleared ${table}`);
        }
    }

    console.log('✓ All old data successfully cleared.');

    // 2. Create Default Custom Roles
    console.log('Creating standard system roles...');
    const deliveryRole = await prisma.customRole.create({
        data: {
            name: 'delevery',
            status: 'Active',
            permissions: [
                'milk_view',
                'milk_add',
                'milk_edit',
                'milk_delete',
                'my-deliveries_view',
                'my-deliveries_add',
                'my-deliveries_edit',
                'my-deliveries_delete'
            ]
        }
    });

    const userRole = await prisma.customRole.create({
        data: {
            name: 'User',
            status: 'Active',
            permissions: [
                'orders_view',
                'orders_add',
                'orders_edit',
                'orders_delete',
                'milk-subscriptions_view',
                'milk-subscriptions_add',
                'milk-subscriptions_edit',
                'milk-subscriptions_delete',
                'alerts_view',
                'alerts_add',
                'alerts_edit',
                'alerts_delete',
                'reports_view',
                'reports_add',
                'reports_edit',
                'reports_delete'
            ]
        }
    });

    // 3. Create Default Super Admin Account
    console.log('Creating default Admin account (admin@gmail.com)...');
    const hashedPassword = await bcrypt.hash('Admin123', 10);
    const admin = await prisma.admin.create({
        data: {
            name: 'Main Admin',
            email: 'admin@gmail.com',
            password: hashedPassword,
            role: 'ADMIN',
            status: 'Active'
        }
    });

    // 4. Create Default Dairy Products
    console.log('Setting up default dairy products...');
    await prisma.product.createMany({
        data: [
            {
                adminId: admin.id,
                name: 'Cow Milk',
                price: 60,
                unit: 'L',
                size: '1 Litre',
                description: 'Pure, fresh cow milk delivered daily morning & evening.',
                isActive: true
            },
            {
                adminId: admin.id,
                name: 'Buffalo Milk',
                price: 70,
                unit: 'L',
                size: '1 Litre',
                description: 'Rich & thick fresh buffalo milk.',
                isActive: true
            },
            {
                adminId: admin.id,
                name: 'Pure Desi Ghee',
                price: 650,
                unit: 'KG',
                size: '1 KG',
                description: 'Traditional bilona method pure desi cow ghee.',
                isActive: true
            },
            {
                adminId: admin.id,
                name: 'Fresh Paneer',
                price: 350,
                unit: 'KG',
                size: '1 KG',
                description: 'Soft & fresh farm-made paneer.',
                isActive: true
            },
            {
                adminId: admin.id,
                name: 'Fresh Chaas',
                price: 30,
                unit: 'L',
                size: '1 Litre',
                description: 'Refreshing traditional butter milk.',
                isActive: true
            }
        ]
    });

    console.log('--- Database Reset Complete Successfully ---');
    console.log('Login credentials:');
    console.log('Email: admin@gmail.com');
    console.log('Password: Admin123');
}

resetDatabase()
    .catch((err) => {
        console.error('Database reset failed:', err);
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
