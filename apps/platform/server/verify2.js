require('dotenv').config();
const { PrismaClient } = require('../../packages/db/src/generated/client');
const prisma = new PrismaClient();
prisma.platformUser.findMany().then(u => console.log(u.map(x=>x.email))).finally(() => prisma.$disconnect());
