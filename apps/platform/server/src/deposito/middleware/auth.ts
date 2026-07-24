import { Request, Response, NextFunction } from 'express'
import { verifyToken as verifyPlatformToken } from '@platform/core'
import { prisma } from '../lib/prisma'

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

  const depositoAccess = payload.apps.deposito

  if (!depositoAccess || depositoAccess.activo !== true) {
    res.status(403).json({ message: 'No tiene acceso a Depósito' })
    return
  }

  let depositoUser = await prisma.user.findFirst({
    where: {
      OR: [
        { platformUserId: payload.sub },
        { email: payload.email },
      ],
    },
  })

  // JIT provisioning: si el usuario no existe en el schema de deposito,
  // lo creamos usando los datos del JWT de la plataforma
  if (!depositoUser) {
    depositoUser = await prisma.user.create({
      data: {
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        role: (depositoAccess.rol as 'encargado' | 'observador' | 'solicitante') || 'observador',
        passwordHash: '', // Ya no usamos pass local, delegamos en platform
        platformUserId: payload.sub,
      },
    })
  } else if (!depositoUser.platformUserId || depositoUser.role !== depositoAccess.rol) {
    // Mantener sincronizado el rol y el platformUserId si faltaba
    depositoUser = await prisma.user.update({
      where: { id: depositoUser.id },
      data: {
        platformUserId: payload.sub,
        role: (depositoAccess.rol as 'encargado' | 'observador' | 'solicitante'),
      },
    })
  }

  req.depositoUser = {
    id: depositoUser.id,
    role: depositoUser.role,
    name: depositoUser.name,
    email: depositoUser.email,
  }

  next()
}
