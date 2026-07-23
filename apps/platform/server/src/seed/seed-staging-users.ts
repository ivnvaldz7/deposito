import 'dotenv/config'
import { AppId, platformDb } from '@platform/db'
import { hashPassword } from '@platform/core'

type StagingUser = {
  email: string
  nombre: string
  isPlatformAdmin?: boolean
  appAccess: Array<{
    app: AppId
    rol: string
  }>
}

const password = process.env.STAGING_USER_PASSWORD ?? process.env.ADMIN_PASSWORD

const users: StagingUser[] = [
  {
    email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
    nombre: 'Administrador Plataforma',
    isPlatformAdmin: true,
    appAccess: [
      { app: AppId.admin, rol: 'admin' },
      { app: AppId.deposito, rol: 'encargado' },
      { app: AppId.ale_bet, rol: 'admin' },
      { app: AppId.portal, rol: 'viewer' },
    ],
  },
  {
    email: 'encargado@deposito.com',
    nombre: 'Encargado Deposito',
    appAccess: [{ app: AppId.deposito, rol: 'encargado' }],
  },
  {
    email: 'solicitante@deposito.com',
    nombre: 'Solicitante Deposito',
    appAccess: [{ app: AppId.deposito, rol: 'solicitante' }],
  },
  {
    email: 'observador@deposito.com',
    nombre: 'Observador Deposito',
    appAccess: [{ app: AppId.deposito, rol: 'observador' }],
  },
  {
    email: 'admin@ale-bet.com',
    nombre: 'Admin Ale-Bet',
    appAccess: [{ app: AppId.ale_bet, rol: 'admin' }],
  },
  {
    email: 'vendedor@ale-bet.com',
    nombre: 'Vendedor Ale-Bet',
    appAccess: [{ app: AppId.ale_bet, rol: 'vendedor' }],
  },
  {
    email: 'armador@ale-bet.com',
    nombre: 'Armador Ale-Bet',
    appAccess: [{ app: AppId.ale_bet, rol: 'armador' }],
  },
  {
    email: 'observador@ale-bet.com',
    nombre: 'Observador Ale-Bet',
    appAccess: [{ app: AppId.ale_bet, rol: 'observador' }],
  },
]

async function upsertUser(user: StagingUser, hashedPassword: string): Promise<void> {
  const platformUser = await platformDb.platformUser.upsert({
    where: { email: user.email },
    update: {
      nombre: user.nombre,
      password: hashedPassword,
      activo: true,
      estado: 'active',
      isPlatformAdmin: user.isPlatformAdmin ?? false,
    },
    create: {
      email: user.email,
      nombre: user.nombre,
      password: hashedPassword,
      activo: true,
      estado: 'active',
      isPlatformAdmin: user.isPlatformAdmin ?? false,
    },
  })

  for (const access of user.appAccess) {
    await platformDb.appAccess.upsert({
      where: {
        userId_app: {
          userId: platformUser.id,
          app: access.app,
        },
      },
      update: {
        rol: access.rol,
        activo: true,
      },
      create: {
        userId: platformUser.id,
        app: access.app,
        rol: access.rol,
        activo: true,
      },
    })
  }
}

async function main(): Promise<void> {
  if (!password) {
    console.error('STAGING_USER_PASSWORD o ADMIN_PASSWORD debe estar definido')
    process.exit(1)
  }

  const hashedPassword = await hashPassword(password)

  for (const user of users) {
    await upsertUser(user, hashedPassword)
    console.log(`staging user ready: ${user.email}`)
  }
}

main()
  .catch((err) => {
    console.error('Error seeding staging users:', err)
    process.exit(1)
  })
  .finally(async () => {
    await platformDb.$disconnect()
  })
