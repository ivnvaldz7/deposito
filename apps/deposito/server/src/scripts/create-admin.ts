import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? 'Admin'

  if (!email || !password) {
    console.error('❌ Faltan variables requeridas: ADMIN_EMAIL y ADMIN_PASSWORD')
    console.error('   Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:create-admin')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`⚠️  Ya existe un usuario con email ${email}`)
    process.exit(0)
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: 'encargado' },
    select: { id: true, email: true, name: true, role: true },
  })

  console.log(`✅ Usuario encargado creado: ${user.email} (${user.name})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
