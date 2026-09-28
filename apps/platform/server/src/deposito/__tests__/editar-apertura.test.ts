import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }))

vi.mock('@platform/core', () => ({ hasPermission: () => true }))
vi.mock('../middleware/auth', () => ({
  authenticate: (req: { depositoUser?: { id: string }; user?: object }, _res: object, next: () => void) => {
    req.depositoUser = { id: 'user-uat' }
    req.user = { sub: 'user-uat', apps: { deposito: { rol: 'encargado', activo: true } } }
    next()
  },
}))
vi.mock('../lib/prisma', () => ({ prisma: { $transaction: transaction } }))

import drogasRouter from '../routes/drogas'

const app = createTestApp('/api/deposito/drogas', drogasRouter)

describe('PATCH /api/deposito/drogas/:productoId/apertura/:inventarioId', () => {
  it('is explicitly closed and cannot mutate a historical opening lot', async () => {
    const response = await request(app)
      .patch('/api/deposito/drogas/00000000-0000-4000-8000-000000000001/apertura/00000000-0000-4000-8000-000000000002')
      .set('Idempotency-Key', 'closed-opening-edit')
      .send({ cantidad: 82, motivo: 'Intento operativo' })

    expect(response.status).toBe(410)
    expect(response.body.error).toMatch(/ajuste de stock/i)
    expect(transaction).not.toHaveBeenCalled()
  })
})
