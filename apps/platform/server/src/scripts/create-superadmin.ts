import 'dotenv/config'
import { AppId, platformDb } from '@platform/db'
import { createUser, getUserByEmail } from '@platform/core'

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.error('❌ ADMIN_EMAIL y ADMIN_PASSWORD deben estar definidos en .env')
    process.exit(1)
  }

  console.log(`🔧 Creando/actualizando superadmin: ${email}`)

  const existing = await getUserByEmail(platformDb as any, email)
  if (existing) {
    await platformDb.platformUser.update({
      where: { id: existing.id },
      data: {
        isPlatformAdmin: true,
        estado: existing.estado === 'disabled' ? 'active' : existing.estado,
      },
    })

    console.log(`✅ ${email} actualizado como superadmin (ya existía)`)
    process.exit(0)
  }

  const user = await createUser(platformDb as any, {
    email,
    nombre: 'Administrador',
    password,
    appAccess: [
      { app: AppId.deposito, rol: 'encargado' },
      { app: AppId.ale_bet, rol: 'supervisor' },
      { app: AppId.admin, rol: 'admin' },
      { app: AppId.portal, rol: 'viewer' },
    ],
  })

  await platformDb.platformUser.update({
    where: { id: user.id },
    data: { isPlatformAdmin: true },
  })

  console.log(`✅ Superadmin ${email} creado exitosamente`)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error al crear superadmin:', err)
  process.exit(1)
})
