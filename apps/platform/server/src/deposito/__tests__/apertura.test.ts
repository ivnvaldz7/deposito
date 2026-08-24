import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const state = vi.hoisted(() => ({
  estuche: { id: '00000000-0000-4000-8000-000000000001', articulo: 'Estuche UAT', cantidad: 0 },
  etiqueta: { id: '00000000-0000-4000-8000-000000000002', articulo: 'Etiqueta UAT', cantidad: 0 },
  frasco: { id: '00000000-0000-4000-8000-000000000003', articulo: 'Frasco UAT', cantidadCajas: 0, unidadesPorCaja: 12, total: 0 },
  droga: { id: '00000000-0000-4000-8000-000000000004', nombre: 'Droga UAT', lote: 'L-UAT', cantidad: 0, vencimiento: new Date('2030-12-31T00:00:00.000Z') },
  movimientos: [] as Array<Record<string, unknown>>,
  keys: new Map<string, unknown>(),
}))

vi.mock('@platform/db', () => ({ Categoria: { estuche: 'estuche', etiqueta: 'etiqueta', frasco: 'frasco', droga: 'droga' } }))
vi.mock('@platform/core', () => ({ hasPermission: () => true }))
vi.mock('../middleware/auth', () => ({ authenticate: (req: any, _res: any, next: any) => { req.depositoUser = { id: 'user-uat', role: 'encargado' }; req.user = { sub: 'user-uat', apps: { deposito: { rol: 'encargado', activo: true } } }; next() } }))
vi.mock('../../utils/idempotency', () => ({
  getSingleIdempotencyKey: (headers: string[]) => headers[headers.findIndex((h) => h.toLowerCase() === 'idempotency-key') + 1],
  calculateFingerprint: () => 'fingerprint',
  acquireIdempotencyRecord: vi.fn(async (_tx: unknown, _actor: string, _scope: string, key: string) => {
    const prior = state.keys.get(key)
    if (prior) return { type: 'REPLAY', status: 201, body: prior }
    const id = `idem-${key}`
    state.keys.set(key, { id, processing: true })
    return { type: 'PROPRIETARY', id }
  }),
  completeIdempotencyRecord: vi.fn(async (_tx: unknown, id: string, _status: number, body: Record<string, unknown>) => { state.keys.forEach((value, key) => { if ((value as { id: string }).id === id) state.keys.set(key, body) }) }),
  toPersistableResponseBody: (body: unknown) => body,
}))

vi.mock('../lib/prisma', () => {
  const tx = {
    inventarioEstuche: { findUnique: vi.fn(async () => state.estuche), update: vi.fn(async ({ data }: any) => Object.assign(state.estuche, data)) },
    inventarioEtiqueta: { findUnique: vi.fn(async () => state.etiqueta), update: vi.fn(async ({ data }: any) => Object.assign(state.etiqueta, data)) },
    inventarioFrasco: { findUnique: vi.fn(async () => state.frasco), update: vi.fn(async ({ data }: any) => Object.assign(state.frasco, data)) },
    depositoProducto: { findUnique: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000010', nombreCompleto: 'Droga UAT' })) },
    inventarioDroga: {
      findUnique: vi.fn(async () => state.droga.lote === 'L-UAT' ? state.droga : null),
      update: vi.fn(async ({ data }: any) => Object.assign(state.droga, data)),
      create: vi.fn(async ({ data }: any) => Object.assign(state.droga, data))
    },
    movimiento: { create: vi.fn(async ({ data }: any) => { const row = { id: `m-${state.movimientos.length + 1}`, ...data }; state.movimientos.push(row); return row }) },
  }
  return { prisma: { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) } }
})

import aperturaRouter from '../routes/apertura'

const app = createTestApp('/api/deposito/apertura', aperturaRouter)

describe('POST /api/deposito/apertura', () => {
  beforeEach(() => { state.estuche.cantidad = 0; state.etiqueta.cantidad = 0; state.frasco.cantidadCajas = 0; state.frasco.total = 0; state.droga.cantidad = 0; state.movimientos.length = 0; state.keys.clear() })

  it('creates and replays an estuche opening without duplicating or creating Acta/Ingreso', async () => {
    const payload = { categoria: 'estuche', inventarioId: state.estuche.id, cantidad: 25, fechaEfectiva: '2026-08-24' }
    const first = await request(app).post('/api/deposito/apertura').set('Idempotency-Key', 'e-key').send(payload)
    const retry = await request(app).post('/api/deposito/apertura').set('Idempotency-Key', 'e-key').send(payload)
    expect(first.status).toBe(201); expect(retry.body).toEqual(first.body); expect(state.estuche.cantidad).toBe(25)
    expect(state.movimientos).toHaveLength(1); expect(state.movimientos[0]).toMatchObject({ tipo: 'stock_inicial', createdBy: 'user-uat', justificacion: 'Saldo de apertura', cantidad: 25 })
  })

  it('covers etiqueta, frasco and droga invariants and rejects negative/second openings', async () => {
    const etiqueta = await request(app).post('/api/deposito/apertura').set('Idempotency-Key', 't-key').send({ categoria: 'etiqueta', inventarioId: state.etiqueta.id, cantidad: 8 }); expect(etiqueta.status).toBe(201)
    const frasco = await request(app).post('/api/deposito/apertura').set('Idempotency-Key', 'f-key').send({ categoria: 'frasco', inventarioId: state.frasco.id, cantidad: 3 }); expect(frasco.status).toBe(201); expect(state.frasco).toMatchObject({ cantidadCajas: 3, total: 36 })
    const droga = await request(app).post('/api/deposito/apertura').set('Idempotency-Key', 'd-key').send({ categoria: 'droga', inventarioId: '00000000-0000-4000-8000-000000000010', cantidad: 4, lote: 'L-UAT', vencimiento: '2031-01-01', fechaEfectiva: '2026-08-24' }); expect(droga.status).toBe(201); expect(state.droga.cantidad).toBe(4); expect(state.droga.lote).toBe('L-UAT')
    const negative = await request(app).post('/api/deposito/apertura').set('Idempotency-Key', 'neg').send({ categoria: 'etiqueta', inventarioId: state.etiqueta.id, cantidad: -1 }); expect(negative.status).toBe(400)
    const second = await request(app).post('/api/deposito/apertura').set('Idempotency-Key', 'second').send({ categoria: 'etiqueta', inventarioId: state.etiqueta.id, cantidad: 9 }); expect(second.status).toBe(409)
    expect(state.movimientos.every((movement) => movement.tipo === 'stock_inicial')).toBe(true)
  })
})
