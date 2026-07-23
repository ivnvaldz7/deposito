import { Router, type NextFunction, type Request, type Response } from 'express'
import { AppId, platformDb } from '@platform/db'
import {
  createUser,
  deactivateUser,
  getUserByEmail,
  listUsers,
  updateAppAccess,
} from '@platform/core'
import { requirePlatformAdmin } from '../../middlewares/require-admin'

const router = Router()

// Express 4 does not forward async rejections — wrap each handler to call next(err)
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

interface CreateUserBody {
  email?: string
  nombre?: string
  password?: string
  appAccess?: Array<{
    app: 'deposito' | 'ale_bet' | 'portal' | 'admin'
    rol: string
  }>
}

interface UpdateAccessBody {
  app?: 'deposito' | 'ale_bet' | 'portal' | 'admin'
  rol?: string
  activo?: boolean
}

function sanitizeUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    activo: user.activo,
    estado: user.estado,
    isPlatformAdmin: user.isPlatformAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    appAccess: user.appAccess,
  }
}

function parseAppId(value: string | undefined): AppId | null {
  if (value === 'deposito') return AppId.deposito
  if (value === 'ale_bet') return AppId.ale_bet
  if (value === 'portal') return AppId.portal
  if (value === 'admin') return AppId.admin
  return null
}

// All routes require admin
router.use((req, res, next) => {
  requirePlatformAdmin(req, res, next).catch(next)
})

// GET — list all users
router.get('/', asyncHandler(async (_req, res) => {
  const users = await listUsers(platformDb as any)
  res.json(users.map(sanitizeUser))
}))

// POST — create user (pre-register)
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body as CreateUserBody

  if (!body.email || !body.nombre || !body.password) {
    res.status(400).json({ error: 'Nombre, email y password son obligatorios' })
    return
  }

  const appAccess = (body.appAccess ?? [])
    .map((access) => {
      const app = parseAppId(access.app)
      if (!app || !access.rol) return null
      return { app, rol: access.rol }
    })
    .filter((access): access is { app: AppId; rol: string } => access !== null)

  const existingUser = await getUserByEmail(platformDb as any, body.email)
  if (existingUser) {
    res.status(409).json({ error: 'Ya existe un usuario con ese email' })
    return
  }

  const user = await createUser(platformDb as any, {
    email: body.email,
    nombre: body.nombre,
    password: body.password,
    appAccess,
  })

  res.status(201).json(sanitizeUser(user))
}))

// PUT /:id/access — update app access
router.put('/:id/access', asyncHandler(async (req, res) => {
  const body = req.body as UpdateAccessBody
  const app = parseAppId(body.app)
  if (!app) {
    res.status(400).json({ error: 'App inválida' })
    return
  }

  const access = await updateAppAccess(platformDb as any, req.params.id as string, app, {
    rol: body.rol,
    activo: body.activo,
  })

  res.json(access)
}))

// PUT /:id/status — enable/disable user
router.put('/:id/status', asyncHandler(async (req, res) => {
  const { activo, estado } = req.body as { activo?: boolean; estado?: string }

  const data: any = {}
  if (typeof activo === 'boolean') data.activo = activo
  if (estado) data.estado = estado

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Estado inválido' })
    return
  }

  const user = await platformDb.platformUser.update({
    where: { id: req.params.id as string },
    data,
    include: { appAccess: true },
  })

  res.json(sanitizeUser(user))
}))

export default router
