import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('@platform/db', () => ({
  EstadoProductoCatalogo: { ACTIVO: 'ACTIVO' },
  Mercado: { argentina: 'argentina' },
}))
vi.mock('@platform/core', () => {
  const { hasPermission } = require('@platform/core/permissions')
  return { eventBus: { emit: vi.fn() }, hasPermission }
})

const mocks = vi.hoisted(() => {
  const product = { id: '550e8400-e29b-41d4-a716-446655440000', categoria: 'droga', estado: 'ACTIVO', mercadosHabilitados: [], nombreCompleto: 'ATP' }
  const tx = {
    acta: { create: vi.fn(async () => ({ id: 'acta-1' })), update: vi.fn(async () => ({ id: 'acta-1' })) },
    actaItem: { create: vi.fn(async () => ({ id: 'item-1' })) },
    movimiento: { create: vi.fn(async () => ({})) },
  }
  const prisma = {
    depositoProducto: { findUnique: vi.fn(async () => product) },
    user: { findUnique: vi.fn(async () => ({ id: 'user-1', name: 'Encargado' })) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  }
  const addDrugLotInventory = vi.fn(async () => ({}))
  return { prisma, tx, addDrugLotInventory }
})

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('../middleware/auth', () => ({ authenticate: (req: any, _res: any, next: any) => { req.depositoUser = { id: 'user-1', role: 'encargado' }; req.user = { sub: 'user-1', apps: { deposito: { rol: 'encargado', activo: true } } }; next() } }))
vi.mock('../middleware/require-role', () => ({ requireRole: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../lib/sse-manager', () => ({ sseManager: { broadcastGlobal: vi.fn() } }))
vi.mock('../lib/lote-generator', () => ({ generarLote: vi.fn(async () => 'generated') }))
vi.mock('../services/droga-inventory-service', () => ({
  DrugLotConflictError: class DrugLotConflictError extends Error {},
  addDrugLotInventory: mocks.addDrugLotInventory,
}))

import ingresosRouter from '../routes/ingresos'

const app = createTestApp('/api/deposito/ingresos', ingresosRouter)
const validPayload = {
  fecha: '2026-08-13',
  productoId: '550e8400-e29b-41d4-a716-446655440000',
  lote: 'ATP-001',
  vencimientoMes: '2099-08',
  cantidad: 10,
}

describe('POST /api/deposito/ingresos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a valid drug ingress and stores the technical month end', async () => {
    const response = await request(app).post('/api/deposito/ingresos').send(validPayload)
    expect(response.status).toBe(201)
    expect(mocks.addDrugLotInventory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      productoId: validPayload.productoId,
      lote: 'ATP-001',
      vencimiento: new Date('2099-08-31T00:00:00.000Z'),
      cantidad: 10,
    }))
  })

  it('returns 400 instead of reaching Prisma for an invalid expiry payload', async () => {
    const response = await request(app).post('/api/deposito/ingresos').send({ ...validPayload, vencimientoMes: '2099-13' })
    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Vencimiento inválido')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns a safe coherent message for an unexpected persistence error', async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'))
    const response = await request(app).post('/api/deposito/ingresos').send(validPayload)
    expect(response.status).toBe(500)
    expect(response.body.message).toBe('No se pudo registrar el ingreso. Intentá nuevamente.')
  })
})
