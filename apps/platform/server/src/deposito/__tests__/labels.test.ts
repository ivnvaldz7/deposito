import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  printCuarentenaLabel: vi.fn(),
}))

vi.mock('../lib/prisma', () => ({ prisma: { actaItem: { findUnique: mocks.findUnique } } }))
vi.mock('../middleware/auth', () => ({ authenticate: (req: any, _res: any, next: any) => { req.depositoUser = { id: 'user-1', role: 'encargado' }; next() } }))
vi.mock('../../middlewares/require-permission', () => ({ requirePermission: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../services/cuarentena-label-printer', () => ({
  CuarentenaLabelPrinterError: class CuarentenaLabelPrinterError extends Error { constructor(message: string, readonly statusCode = 503) { super(message) } },
  printCuarentenaLabel: mocks.printCuarentenaLabel,
}))

import labelsRouter from '../routes/labels'

const app = createTestApp('/api/deposito/labels', labelsRouter)
const item = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  categoria: 'droga',
  productoNombre: 'OLIVITASAN PLUS 500ML',
  lote: '3506',
  acta: { fecha: new Date('2026-10-02T00:00:00.000Z') },
}

describe('POST /api/deposito/labels/cuarentena', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue(item)
    mocks.printCuarentenaLabel.mockResolvedValue(undefined)
  })

  it('prints only a registered materia prima item with the ingress date and requested copies', async () => {
    const response = await request(app).post('/api/deposito/labels/cuarentena').send({ itemId: item.id, copias: 2 })

    expect(response.status).toBe(200)
    expect(mocks.printCuarentenaLabel).toHaveBeenCalledWith({ producto: item.productoNombre, lote: item.lote, fechaIngreso: '02/10/2026', copias: 2 })
  })

  it('rejects labels for packaging materials', async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...item, categoria: 'frasco' })

    const response = await request(app).post('/api/deposito/labels/cuarentena').send({ itemId: item.id, copias: 1 })

    expect(response.status).toBe(422)
    expect(mocks.printCuarentenaLabel).not.toHaveBeenCalled()
  })
})
