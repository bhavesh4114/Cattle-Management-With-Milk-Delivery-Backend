const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

if (!process.env.DATABASE_URL) {
  console.error("[db] DATABASE_URL is not configured");
}

const isRemoteDb = Boolean(
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("localhost") &&
  !process.env.DATABASE_URL.includes("127.0.0.1")
);

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

if (isRemoteDb) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const globalForPrisma = global;

if (!globalForPrisma._prisma) {
  const pool = new Pool(poolConfig);
  const adapter = new PrismaPg(pool);
  globalForPrisma._prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });
}

const prisma = globalForPrisma._prisma;

module.exports = prisma;
