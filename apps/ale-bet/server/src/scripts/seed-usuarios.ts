import 'dotenv/config'
import { AppId, platformDb } from '@platform/db'
import { createUser, getUserByEmail } from '@platform/core'

interface SeedUserInput {
  email: string
  nombre: string
  password: string
  app: 'ale_bet' | 'deposito'
  rol: string
}

const usuarios: SeedUserInput[] = [
  {
    email: 'alejandro@alebet.com',
    nombre: 'Alejandro',
    password: 'Alebet2026',
    app: 'ale_bet',
    rol: 'vendedor',
  },
  {
    email: 'meir@alebet.com',
    nombre: 'Meir',
    password: 'Alebet2026',
    app: 'ale_bet',
    rol: 'vendedor',
  },
  {
    email: 'pablo@alebet.com',
    nombre: 'Pablo',
    password: 'Alebet2026',
    app: 'ale_bet',
    rol: 'armador',
  },
  {
    email: 'ivan@alebet.com',
    nombre: 'Ivan',
    password: 'Alebet2026',
    app: 'ale_bet',
    rol: 'armador',
  },
  {
    email: 'admin-deposito@alebet.com',
    nombre: 'Ivan',
    password: 'Alebet2026',
    app: 'deposito',
    rol: 'encargado',
  },
]

async function ensureUser(input: SeedUserInput): Promise<'created' | 'skipped'> {
  const existingUser = await getUserByEmail(platformDb, input.email)

  if (existingUser) {
    return 'skipped'
  }

  await createUser(platformDb, {
    email: input.email,
    nombre: input.nombre,
    password: input.password,
    appAccess: [
      {
        app: input.app === 'ale_bet' ? AppId.ale_bet : AppId.deposito,
        rol: input.rol,
      },
    ],
  })

  return 'created'
}

async function main(): Promise<void> {
  let created = 0
  let skipped = 0

  for (const usuario of usuarios) {
    const result = await ensureUser(usuario)

    if (result === 'created') {
      created += 1
      console.log(`created  ${usuario.email} -> ${usuario.app}:${usuario.rol}`)
      continue
    }

    skipped += 1
    console.log(`skipped  ${usuario.email} (ya existe)`)
  }

  console.log(`Seed usuarios completado. created=${created} skipped=${skipped}`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await platformDb.$disconnect()
  })
