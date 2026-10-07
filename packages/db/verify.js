const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.platformUser.findFirst();
  console.log('User mustChangePassword:', user ? user.mustChangePassword : 'No users');
  
  const session = await prisma.session.findFirst();
  console.log('Session exists:', session || 'No sessions but table exists');
  
  const auditoria = await prisma.platformAuditoria.findFirst();
  console.log('Auditoria exists:', auditoria || 'No audits but table exists');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
