import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasPermission } from '@platform/core'
import { requirePermission } from '../../middlewares/require-permission'

const secret = 'deposito-permissions-contract-secret'
process.env.PLATFORM_JWT_SECRET = secret

const routesDir = join(__dirname, '..', 'routes')

function token(role?: string, active = true, platformAdmin = false): string {
  return jwt.sign({
    sub: 'platform-user-1',
    email: 'platform@example.com',
    isPlatformAdmin: platformAdmin,
    apps: role === undefined ? {} : { deposito: { rol: role, activo: active } },
  }, secret, { expiresIn: '15m' })
}

function protectedApp(permission: 'dashboard.read' | 'pendientes.manage') {
  const app = express()
  app.get('/resource', requirePermission('deposito', permission), (_req, res) => res.status(204).send())
  return app
}

describe('Depósito permission contract', () => {
  it('binds every migrated operational route to its exact shared permission without requireRole', () => {
    const bindings = [
      ['dashboard.ts', "requirePermission('deposito', 'dashboard.read')"],
      ['drogas.ts', "requirePermission('deposito', 'drogas.read')", "requirePermission('deposito', 'drogas.read.por_vencer')"],
      ['actas.ts', "requirePermission('deposito', 'actas.read')", "requirePermission('deposito', 'actas.create')", "requirePermission('deposito', 'actas.items.add')", "requirePermission('deposito', 'actas.items.quality_approve')", "requirePermission('deposito', 'actas.items.distribute')"],
      ['frascos.ts', "requirePermission('deposito', 'frascos.read')", "requirePermission('deposito', 'frascos.manage')"],
      ['pendientes.ts', "requirePermission('deposito', 'pendientes.read')", "requirePermission('deposito', 'pendientes.manage')"],
      ['ingresos.ts', "requirePermission('deposito', 'ingresos.create')"],
      ['ordenes.ts', "requirePermission('deposito', 'ordenes.read')", "requirePermission('deposito', 'ordenes.create')", "requirePermission('deposito', 'ordenes.approve')", "requirePermission('deposito', 'ordenes.execute')", "requirePermission('deposito', 'ordenes.reject')", "requirePermission('deposito', 'ordenes.complete')"],
      ['metricas.ts', "requirePermission('deposito', 'metricas.read')", "requirePermission('deposito', 'metricas.export.pdf')", "requirePermission('deposito', 'metricas.productos.read')"],
      ['movimientos.ts', "requirePermission('deposito', 'movimientos.read')"],
      ['lotes.ts', "requirePermission('deposito', 'lotes.read.next')"],
      ['events.ts', "requirePermission('deposito', 'eventos.stream')"],
      ['importacion-inicial-estuches.ts', "requirePermission('deposito', 'importaciones_iniciales.create')"],
      ['users.ts', "requirePermission('deposito', 'usuarios_deposito.read')", "requirePermission('deposito', 'usuarios_deposito.manage')"],
    ] as const

    for (const [file, ...permissions] of bindings) {
      const source = readFileSync(join(routesDir, file), 'utf8')
      for (const permission of permissions) expect(source).toContain(permission)
      expect(source).not.toContain('requireRole(')
    }

    const inventoryHelper = readFileSync(join(routesDir, 'shared', 'mercado-inventory-helpers.ts'), 'utf8')
    expect(inventoryHelper).toContain("requirePermission('deposito', permissions.read)")
    expect(inventoryHelper).toContain("requirePermission('deposito', permissions.manage)")
    expect(inventoryHelper).not.toContain('requireRole(')
  })

  it('denies missing, inactive, unknown, and Platform Admin-only access before the handler', async () => {
    const app = protectedApp('dashboard.read')
    for (const value of [token(), token('observador', false), token('unknown'), token(undefined, true, true)]) {
      await request(app).get('/resource').set('Authorization', `Bearer ${value}`).expect(403)
    }
  })

  it('uses the matrix for capability decisions', async () => {
    const dashboard = protectedApp('dashboard.read')
    for (const role of ['encargado', 'observador', 'solicitante']) {
      await request(dashboard).get('/resource').set('Authorization', `Bearer ${token(role)}`).expect(204)
    }

    const pendingManage = protectedApp('pendientes.manage')
    await request(pendingManage).get('/resource').set('Authorization', `Bearer ${token('encargado')}`).expect(204)
    await request(pendingManage).get('/resource').set('Authorization', `Bearer ${token('observador')}`).expect(403)
    await request(pendingManage).get('/resource').set('Authorization', `Bearer ${token('solicitante')}`).expect(403)
  })

  it('keeps solicitante ownership derived from canonical AppAccess, not deposito.User.role', () => {
    const source = readFileSync(join(routesDir, 'ordenes.ts'), 'utf8')
    expect(source).toContain("return req.user?.apps.deposito?.rol === 'solicitante'")
    expect(hasPermission({ sub: 's', email: 's@example.com', apps: { deposito: { rol: 'solicitante', activo: true } } }, 'deposito', 'ordenes.read')).toBe(true)
    expect(hasPermission({ sub: 's', email: 's@example.com', apps: { deposito: { rol: 'solicitante', activo: true } } }, 'deposito', 'ordenes.approve')).toBe(false)
  })

  it('lets the ticket-authenticated Depósito SSE endpoint reach its own guard before the global JWT middleware', () => {
    const serverIndex = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8')
    const eventsMount = "app.use('/api/deposito/events', depositoEventsRoutes)"
    const protectedDepositoMount = "app.use('/api/deposito', verifyToken, createDepositoRoutes())"

    expect(serverIndex.indexOf(eventsMount)).toBeGreaterThanOrEqual(0)
    expect(serverIndex.indexOf(eventsMount)).toBeLessThan(serverIndex.indexOf(protectedDepositoMount))
  })
})
