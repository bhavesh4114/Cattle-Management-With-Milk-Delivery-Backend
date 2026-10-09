require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../src/config/db');

async function checkCols() {
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'MilkDeliveryRequest'
    ORDER BY ordinal_position;
  `);
  console.log('Columns in MilkDeliveryRequest:', cols);
  await prisma.$disconnect();
}

checkCols().catch(console.error);
