import { Router } from 'express'
import { AppId, platformDb } from '@platform/db'
import {
  createUser,
  deactivateUser,
  getUserByEmail,
  listUsers,
  updateAppAccess,
} from '@platform/core'
import { requirePlatformAdmin } from '../middleware/auth'

const router = Router()

interface CreateUserBody {
  email?: string
  nombre?: string
  password?: string
  appAccess?: Array<{
    app: 'deposito' | 'ale_bet'
    rol: string
  }>
}

interface UpdateAccessBody {
  app?: 'deposito' | 'ale_bet'
  rol?: string
  activo?: boolean
}

interface UpdateStatusBody {
  activo?: boolean
}

interface SanitizedUser {
  id: string
  email: string
  nombre: string
  activo: boolean
  createdAt: Date
  updatedAt: Date
  appAccess: Array<{
    id: string
    app: AppId
    rol: string
    activo: boolean
    createdAt: Date
    userId: string
  }>
}

function sanitizeUser(user: {
  id: string
  email: string
  nombre: string
  activo: boolean
  createdAt: Date
  updatedAt: Date
  appAccess: SanitizedUser['appAccess']
}): SanitizedUser {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    activo: user.activo,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    appAccess: user.appAccess,
  }
}

function parseAppId(value: 'deposito' | 'ale_bet' | undefined): AppId | null {
  if (value === 'deposito') {
    return AppId.deposito
  }

  if (value === 'ale_bet') {
    return AppId.ale_bet
  }

  return null
}

router.use(requirePlatformAdmin)

router.get('/', async (_req, res) => {
  const users = await listUsers(platformDb)
  res.json(users.map(sanitizeUser))
})

router.post('/', async (req, res) => {
  const body = req.body as CreateUserBody

  if (!body.email || !body.nombre || !body.password) {
    res.status(400).json({ error: 'Nombre, email y password son obligatorios' })
    return
  }

  const appAccess = (body.appAccess ?? [])
    .map((access) => {
      const app = parseAppId(access.app)

      if (!app || !access.rol) {
        return null
      }

      return {
        app,
        rol: access.rol,
      }
    })
    .filter((access): access is { app: AppId; rol: string } => access !== null)

  const existingUser = await getUserByEmail(platformDb, body.email)

  if (existingUser) {
    res.status(409).json({ error: 'Ya existe un usuario con ese email' })
    return
  }

  const user = await createUser(platformDb, {
    email: body.email,
    nombre: body.nombre,
    password: body.password,
    appAccess,
  })

  res.status(201).json(sanitizeUser(user))
})

router.put('/:id/access', async (req, res) => {
  const body = req.body as UpdateAccessBody
  const app = parseAppId(body.app)

  if (!app) {
    res.status(400).json({ error: 'App inválida' })
    return
  }

  const access = await updateAppAccess(platformDb, req.params.id, app, {
    rol: body.rol,
    activo: body.activo,
  })

  res.json(access)
})

router.put('/:id/status', async (req, res) => {
  const body = req.body as UpdateStatusBody

  if (typeof body.activo !== 'boolean') {
    res.status(400).json({ error: 'Estado inválido' })
    return
  }

  const user = body.activo
    ? await platformDb.platformUser.update({
        where: { id: req.params.id },
        data: { activo: true },
        include: { appAccess: true },
      })
    : await deactivateUser(platformDb, req.params.id).then(async (updatedUser) =>
        platformDb.platformUser.findUniqueOrThrow({
          where: { id: updatedUser.id },
          include: { appAccess: true },
        })
      )

  res.json(sanitizeUser(user))
})

export default router
