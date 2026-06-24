import { Router } from 'express'
import { AppId, platformDb } from '@platform/db'
import { createUser, getUserByEmail } from '@platform/core'

export function createBootstrapRoutes(): Router {
  const router = Router()

  /**
   * POST /api/bootstrap
   *
   * Crea o actualiza el superadmin inicial de la plataforma.
   *
   * Gating profesional:
   * 1. Solo se activa si BOOTSTRAP_ADMIN_EMAIL está definido en env
   * 2. Si BOOTSTRAP_KEY está definido, requiere header x-bootstrap-key
   * 3. Idempotente: si el usuario ya existe, solo actualiza isPlatformAdmin
   *
   * Uso en dev:
   *   curl -X POST http://localhost:3000/api/bootstrap
   *
   * Uso en producción (con key):
   *   curl -X POST http://localhost:3000/api/bootstrap \
   *     -H "x-bootstrap-key: tu-key-segura"
   */
  router.post('/bootstrap', async (_req, res) => {
    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL
    const bootstrapKey = process.env.BOOTSTRAP_KEY

    // Gating: si no está configurado, el endpoint no existe funcionalmente
    if (!adminEmail) {
      res.status(404).json({ error: 'Bootstrap no configurado (BOOTSTRAP_ADMIN_EMAIL)' })
      return
    }

    // Validar bootstrap key si está configurada
    const providedKey = _req.headers['x-bootstrap-key'] as string | undefined
    if (bootstrapKey && providedKey !== bootstrapKey) {
      res.status(403).json({ error: 'x-bootstrap-key inválido' })
      return
    }

    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminPassword) {
      res.status(500).json({ error: 'ADMIN_PASSWORD no configurado' })
      return
    }

    // Idempotente: si ya existe, actualizar a admin
    const existingUser = await getUserByEmail(platformDb as any, adminEmail)
    if (existingUser) {
      await platformDb.platformUser.update({
        where: { id: existingUser.id },
        data: {
          isPlatformAdmin: true,
          estado: existingUser.estado === 'disabled' ? 'active' : existingUser.estado,
        },
      })

      console.log(`✅ Bootstrap: admin ${adminEmail} actualizado (ya existía)`)
      res.json({
        created: false,
        email: adminEmail,
        message: 'Usuario existente actualizado como administrador',
      })
      return
    }

    // Crear nuevo superadmin
    const user = await createUser(platformDb as any, {
      email: adminEmail,
      nombre: 'Administrador',
      password: adminPassword,
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

    console.log(`✅ Bootstrap: superadmin ${adminEmail} creado exitosamente`)
    res.status(201).json({
      created: true,
      email: adminEmail,
      message: 'Superadmin creado exitosamente',
    })
  })

  return router
}
