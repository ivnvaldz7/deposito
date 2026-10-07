import { Request, Response, NextFunction } from 'express'
import { isValidAppRole, verifyToken as verifyPlatformToken } from '@platform/core'
import { prisma } from '../lib/prisma'

type DepositoRole = 'encargado' | 'observador' | 'solicitante'

class LegacyIdentityConflictError extends Error {
  constructor() {
    super('El usuario legacy de Depósito ya está vinculado a otra identidad')
    this.name = 'LegacyIdentityConflictError'
  }
}

class JitReconciliationError extends Error {
  constructor() {
    super('No se pudo reconciliar el usuario legacy de Depósito')
    this.name = 'JitReconciliationError'
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = error.code
  return typeof code === 'string' ? code : undefined
}

function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === 'P2002' || errorCode(error) === '23505'
}

async function findByPlatformUserId(platformUserId: string) {
  return prisma.user.findUnique({ where: { platformUserId } })
}

async function findByCanonicalEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  })
}

async function ensureDepositoUser(
  platformUserId: string,
  email: string,
  name: string,
  role: DepositoRole,
  attempt = 0,
) {
  const linkedUser = await findByPlatformUserId(platformUserId)
  if (linkedUser) {
    if (linkedUser.role === role) return linkedUser
    return prisma.user.update({ where: { id: linkedUser.id }, data: { role } })
  }

  const legacyUser = await findByCanonicalEmail(email)
  if (legacyUser) {
    if (legacyUser.platformUserId && legacyUser.platformUserId !== platformUserId) {
      throw new LegacyIdentityConflictError()
    }

    try {
      return await prisma.user.update({
        where: { id: legacyUser.id },
        data: { platformUserId, role },
      })
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 1) throw new JitReconciliationError()
      return ensureDepositoUser(platformUserId, email, name, role, attempt + 1)
    }
  }

  try {
    return await prisma.user.create({
      data: {
        email,
        name,
        role,
        passwordHash: '', // Ya no usamos pass local, delegamos en platform
        platformUserId,
      },
    })
  } catch (error) {
    if (!isUniqueViolation(error) || attempt >= 1) throw new JitReconciliationError()
    return ensureDepositoUser(platformUserId, email, name, role, attempt + 1)
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[authenticate] Token requerido');
    res.status(401).json({ message: 'Token requerido' })
    return
  }

  const token = authHeader.slice(7)
  const payload = verifyPlatformToken(token)

  if (!payload) {
    console.log('[authenticate] Token inválido o expirado');
    res.status(401).json({ message: 'Token inválido o expirado' })
    return
  }

  req.user = payload

  const depositoAccess = payload.apps.deposito

  if (!depositoAccess || depositoAccess.activo !== true) {
    res.status(403).json({ message: 'No tiene acceso a Depósito' })
    return
  }

  if (!isValidAppRole('deposito', depositoAccess.rol)) {
    res.status(403).json({ message: 'Rol de Depósito inválido' })
    return
  }

  const email = normalizeEmail(payload.email)
  const role = depositoAccess.rol as DepositoRole
  let depositoUser
  try {
    depositoUser = await ensureDepositoUser(
      payload.sub,
      email,
      payload.name || email.split('@')[0],
      role,
    )
  } catch (error) {
    if (error instanceof LegacyIdentityConflictError) {
      res.status(403).json({ message: 'Identidad de Depósito no reconciliable' })
      return
    }

    console.error('[authenticate] Depósito JIT reconciliation failed', {
      code: errorCode(error),
    })
    res.status(500).json({ message: 'No se pudo sincronizar el usuario de Depósito' })
    return
  }

  req.depositoUser = {
    id: depositoUser.id,
    role: depositoUser.role,
    name: depositoUser.name,
    email: depositoUser.email,
  }

  next()
}
