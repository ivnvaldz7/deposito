import 'dotenv/config'
import { AppId, platformDb } from '../src'

const emailsAEliminar = [
  'armador@alebet.com',
  'vendedor@alebet.com',
  'admin@alebet.com',
  'solicitante.deposito@platform.local',
  'observador.deposito@platform.local',
  'usuario.regular@platform.local',
  'encargado.deposito@platform.local',
]

async function main(): Promise<void> {
  for (const email of emailsAEliminar) {
    const user = await platformDb.platformUser.findUnique({
      where: { email },
    })

    if (!user) {
      console.log(`No encontrado: ${email}`)
      continue
    }

    await platformDb.appAccess.deleteMany({
      where: { userId: user.id },
    })

    await platformDb.platformUser.delete({
      where: { id: user.id },
    })

    console.log(`Eliminado: ${email}`)
  }

  const adminDeposito = await platformDb.platformUser.findUnique({
    where: { email: 'admin-deposito@alebet.com' },
  })

  if (adminDeposito) {
    await platformDb.platformUser.update({
      where: { id: adminDeposito.id },
      data: { activo: true },
    })

    await platformDb.appAccess.deleteMany({
      where: { userId: adminDeposito.id },
    })

    await platformDb.appAccess.create({
      data: {
        userId: adminDeposito.id,
        app: AppId.deposito,
        rol: 'encargado',
        activo: true,
      },
    })

    console.log('Corregido: admin-deposito@alebet.com')
  } else {
    console.log('No encontrado: admin-deposito@alebet.com')
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await platformDb.$disconnect()
  })
