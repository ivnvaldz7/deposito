import 'dotenv/config'
import { AppId, platformDb } from '@platform/db'
import { prisma } from '../lib/prisma'

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: {
      createdAt: 'asc',
    },
  })

  let migratedCount = 0

  for (const user of users) {
    let platformUser = await platformDb.platformUser.findUnique({
      where: { email: user.email },
    })

    if (!platformUser) {
      platformUser = await platformDb.platformUser.create({
        data: {
          email: user.email,
          nombre: user.name,
          password: user.passwordHash,
        },
      })
    }

    await platformDb.appAccess.upsert({
      where: {
        userId_app: {
          userId: platformUser.id,
          app: AppId.deposito,
        },
      },
      update: {
        rol: user.role,
        activo: true,
      },
      create: {
        userId: platformUser.id,
        app: AppId.deposito,
        rol: user.role,
        activo: true,
      },
    })

    await prisma.user.update({
      where: { id: user.id },
      data: {
        platformUserId: platformUser.id,
      },
    })

    migratedCount += 1
    console.log(`Migrado: ${user.email} → ${platformUser.id}`)
  }

  console.log(`${migratedCount} usuarios migrados`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await platformDb.$disconnect()
  })
