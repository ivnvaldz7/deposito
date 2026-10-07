import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const { transaction, findUnique, update, create } = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}))

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
const lotId = '00000000-0000-4000-8000-000000000001'

describe('PATCH /api/deposito/drogas/:inventarioId/cantidad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (callback) => callback({
      inventarioDroga: { findUnique, update },
      movimiento: { create },
    }))
  })

  it('updates the current lot quantity and records only the audited delta', async () => {
    findUnique.mockResolvedValue({ id: lotId, productoId: 'product-1', nombre: 'VITAMINA A', lote: 'APERTURA', cantidad: 240 })
    update.mockResolvedValue({ id: lotId, cantidad: 180 })
    create.mockResolvedValue({ id: 'movement-1' })

    const response = await request(app)
      .patch(`/api/deposito/drogas/${lotId}/cantidad`)
      .send({ cantidad: 180, motivo: 'Recuento físico' })

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ where: { id: lotId }, data: { cantidad: 180 } })
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'ajuste_manual', categoria: 'droga', productoNombre: 'VITAMINA A', productoId: 'product-1', lote: 'APERTURA', cantidad: -60, justificacion: 'Recuento físico', createdBy: 'user-uat',
      }),
    })
  })

  it('rejects negative quantities before starting a transaction', async () => {
    const response = await request(app)
      .patch(`/api/deposito/drogas/${lotId}/cantidad`)
      .send({ cantidad: -1, motivo: 'Error' })

    expect(response.status).toBe(400)
    expect(transaction).not.toHaveBeenCalled()
  })
})
