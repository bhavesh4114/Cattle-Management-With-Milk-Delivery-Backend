require("dotenv/config");
const {PrismaClient}=require("@prisma/client")
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcrypt");
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});
const prisma =new PrismaClient({ adapter })

async function main() {
    const hashedPassword=await bcrypt.hash("Admin123",10)
    await prisma.admin.upsert({
        where:{
            email:"admin@gmail.com",
        },
        update:{
            password:hashedPassword,
        },
        create:{
            name:"admin",
            email:"admin@gmail.com",
            password:hashedPassword,
            role:"ADMIN"
        }
    });
    console.log("Admin created Successfully")
}
main()
.catch((err)=>{
    console.log(err);
})
.finally(async()=>{
    await prisma.$disconnect();
})
