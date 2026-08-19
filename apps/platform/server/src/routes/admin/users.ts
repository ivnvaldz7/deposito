import { Router, type NextFunction, type Request, type Response } from 'express'
import { AppId, platformDb } from '@platform/db'
import {
  createUser,
  getUserByEmail,
  getUserById,
  hashPassword,
  isValidAppRole,
  listUsers,
  removeAppAccess,
  updateAppAccess,
  PLATFORM_AUDIT_ACTIONS,
} from '@platform/core'
import { requirePlatformAdmin } from '../../middlewares/require-admin'
import { revokeAllUserSessions } from '../../services/auth/session-service'
import { auditAdminEvent } from '../../services/audit/platform-audit-service'
import { generateSecureTemporaryPassword } from '../../services/auth/session-service'

const router = Router()

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

interface CreateUserBody {
  email?: string
  nombre?: string
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
    mustChangePassword: user.mustChangePassword,
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

function getAuditContext(req: Request) {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? undefined,
    userAgent: req.headers['user-agent'] ?? undefined,
  }
}

router.use((req, res, next) => {
  requirePlatformAdmin(req, res, next).catch(next)
})

// GET — list all users
router.get('/', asyncHandler(async (_req, res) => {
  const users = await listUsers(platformDb as any)
  res.json(users.map(sanitizeUser))
}))

// POST — create user (internal onboarding with temporary password)
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body as CreateUserBody
  const ctx = getAuditContext(req)
  const adminId = req.user?.sub

  if (!body.email || !body.nombre) {
    res.status(400).json({ error: 'Nombre y email son obligatorios' })
    return
  }

  const appAccess: Array<{ app: AppId; rol: string }> = []
  const seenApps = new Set<string>()

  for (const entry of body.appAccess ?? []) {
    const app = parseAppId(entry.app)
    if (!app) {
      res.status(400).json({ error: 'App inválida' })
      return
    }
    if (seenApps.has(app)) {
      res.status(400).json({ error: 'Acceso duplicado para la app' })
      return
    }
    if (!isValidAppRole(app, entry.rol)) {
      res.status(400).json({ error: `Rol inválido para la app ${app}` })
      return
    }
    seenApps.add(app)
    appAccess.push({ app, rol: entry.rol })
  }

  const existingUser = await getUserByEmail(platformDb as any, body.email)
  if (existingUser) {
    res.status(409).json({ error: 'Ya existe un usuario con ese email' })
    return
  }

  const temporaryPassword = generateSecureTemporaryPassword()
  const user = await createUser(platformDb as any, {
    email: body.email,
    nombre: body.nombre,
    password: temporaryPassword,
    mustChangePassword: true,
    appAccess,
  })

  await auditAdminEvent(platformDb as any, {
    actorId: adminId,
    targetUserId: user.id,
    action: PLATFORM_AUDIT_ACTIONS.USER_CREATED,
    previous: { email: body.email, nombre: body.nombre },
    next: { appAccess: appAccess.map((a) => ({ app: a.app, rol: a.rol })) },
    ...ctx,
  })

  for (const access of appAccess) {
    await auditAdminEvent(platformDb as any, {
      actorId: adminId,
      targetUserId: user.id,
      action: PLATFORM_AUDIT_ACTIONS.APP_ACCESS_GRANTED,
      app: access.app,
      next: { rol: access.rol, activo: true },
      ...ctx,
    })
  }

  res.status(201).json({
    user: sanitizeUser(user),
    temporaryPassword,
  })
}))

// PUT /:id/access — update app access
router.put('/:id/access', asyncHandler(async (req, res) => {
  const body = req.body as UpdateAccessBody
  const ctx = getAuditContext(req)
  const adminId = req.user?.sub

  const app = parseAppId(body.app)
  if (!app) {
    res.status(400).json({ error: 'App inválida' })
    return
  }

  if (body.rol !== undefined && !isValidAppRole(app, body.rol)) {
    res.status(400).json({ error: `Rol inválido para la app ${app}` })
    return
  }

  const existingUser = await getUserById(platformDb as any, req.params.id as string)
  if (!existingUser) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  const previousAccess = existingUser.appAccess.find((a) => a.app === app)

  const access = await updateAppAccess(platformDb as any, req.params.id as string, app, {
    rol: body.rol,
    activo: body.activo,
  })

  if (!previousAccess) {
    await auditAdminEvent(platformDb as any, {
      actorId: adminId,
      targetUserId: existingUser.id,
      action: PLATFORM_AUDIT_ACTIONS.APP_ACCESS_GRANTED,
      app,
      next: { rol: access.rol, activo: access.activo },
      ...ctx,
    })
  } else {
    if (body.rol !== undefined && previousAccess.rol !== body.rol) {
      await auditAdminEvent(platformDb as any, {
        actorId: adminId,
        targetUserId: existingUser.id,
        action: PLATFORM_AUDIT_ACTIONS.APP_ACCESS_ROLE_CHANGED,
        app,
        previous: { rol: previousAccess.rol },
        next: { rol: access.rol },
        ...ctx,
      })
    }

    if (body.activo !== undefined && previousAccess.activo !== body.activo) {
      await auditAdminEvent(platformDb as any, {
        actorId: adminId,
        targetUserId: existingUser.id,
        action: body.activo
          ? PLATFORM_AUDIT_ACTIONS.APP_ACCESS_ENABLED
          : PLATFORM_AUDIT_ACTIONS.APP_ACCESS_DISABLED,
        app,
        previous: { activo: previousAccess.activo },
        next: { activo: access.activo },
        ...ctx,
      })
    }
  }

  res.json(access)
}))

// DELETE /:id/access/:app — hard-remove an app access
router.delete('/:id/access/:app', asyncHandler(async (req, res) => {
  const app = parseAppId(req.params.app as string)
  if (!app) {
    res.status(400).json({ error: 'App inválida' })
    return
  }

  const ctx = getAuditContext(req)
  const adminId = req.user?.sub

  const existingUser = await getUserById(platformDb as any, req.params.id as string)
  const previousAccess = existingUser?.appAccess.find((a) => a.app === app)

  const deleted = await removeAppAccess(platformDb as any, req.params.id as string, app)

  if (!deleted) {
    res.status(404).json({ error: 'Acceso no encontrado' })
    return
  }

  await auditAdminEvent(platformDb as any, {
    actorId: adminId,
    targetUserId: req.params.id as string,
    action: PLATFORM_AUDIT_ACTIONS.APP_ACCESS_REVOKED,
    app,
    previous: previousAccess
      ? { rol: previousAccess.rol, activo: previousAccess.activo }
      : undefined,
    ...ctx,
  })

  res.json(deleted)
}))

// PUT /:id/status — enable/disable user
router.put('/:id/status', asyncHandler(async (req, res) => {
  const { activo, estado } = req.body as { activo?: boolean; estado?: string }
  const ctx = getAuditContext(req)
  const adminId = req.user?.sub

  const data: any = {}
  if (typeof activo === 'boolean') data.activo = activo
  if (estado) data.estado = estado

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Estado inválido' })
    return
  }

  const existingUser = await getUserById(platformDb as any, req.params.id as string)
  if (!existingUser) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  const user = await platformDb.platformUser.update({
    where: { id: req.params.id as string },
    data,
    include: { appAccess: true },
  })

  const isDisabling = (typeof activo === 'boolean' && activo === false) || estado === 'disabled'

  if (isDisabling) {
    const revoked = await revokeAllUserSessions(platformDb as any, user.id)
    await auditAdminEvent(platformDb as any, {
      actorId: adminId,
      targetUserId: user.id,
      action: PLATFORM_AUDIT_ACTIONS.SESSIONS_REVOKED,
      previous: { reason: 'user_deactivated', revokedSessions: revoked.count },
      ...ctx,
    })
  }

  await auditAdminEvent(platformDb as any, {
    actorId: adminId,
    targetUserId: user.id,
    action: isDisabling
      ? PLATFORM_AUDIT_ACTIONS.USER_DEACTIVATED
      : PLATFORM_AUDIT_ACTIONS.USER_ACTIVATED,
    previous: {
      activo: existingUser.activo,
      estado: existingUser.estado,
    },
    next: {
      activo: user.activo,
      estado: user.estado,
    },
    ...ctx,
  })

  res.json(sanitizeUser(user))
}))

// POST /:id/reset-password — admin resets user password to a temporary one
router.post('/:id/reset-password', asyncHandler(async (req, res) => {
  const ctx = getAuditContext(req)
  const adminId = req.user?.sub

  const existingUser = await getUserById(platformDb as any, req.params.id as string)
  if (!existingUser) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  const temporaryPassword = generateSecureTemporaryPassword()
  const newHash = await hashPassword(temporaryPassword)

  await platformDb.platformUser.update({
    where: { id: existingUser.id },
    data: {
      password: newHash,
      mustChangePassword: true,
    },
  })

  const revoked = await revokeAllUserSessions(platformDb as any, existingUser.id)

  await auditAdminEvent(platformDb as any, {
    actorId: adminId,
    targetUserId: existingUser.id,
    action: PLATFORM_AUDIT_ACTIONS.PASSWORD_RESET,
    previous: { revokedSessions: revoked.count },
    ...ctx,
  })

  res.json({ temporaryPassword })
}))

export default router
