import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }))

vi.mock('../middleware/auth', () => ({
  authenticate: (req: { depositoUser?: { id: string } }, _res: object, next: () => void) => {
    req.depositoUser = { id: 'user-uat' }
    next()
  },
}))
vi.mock('../lib/prisma', () => ({ prisma: { $transaction: transaction } }))

import aperturaRouter from '../routes/apertura'

const app = createTestApp('/api/deposito/apertura', aperturaRouter)

describe('POST /api/deposito/apertura', () => {
  it('is explicitly closed and leaves historical data untouched', async () => {
    const response = await request(app)
      .post('/api/deposito/apertura')
      .set('Idempotency-Key', 'closed-opening')
      .send({ categoria: 'droga', productoId: '00000000-0000-4000-8000-000000000001', cantidad: 10, lote: 'APERTURA' })

    expect(response.status).toBe(410)
    expect(response.body.error).toMatch(/cerrada.*operación normal/i)
    expect(transaction).not.toHaveBeenCalled()
  })
})
