import request from 'supertest'
import type { Express } from 'express'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const JWT_SECRET = 'test-secret-for-jwt-min-32-chars!!'

const {
  acquireIdempotencyRecord,
  completeIdempotencyRecord,
  mockDb,
  pdfDocuments,
  releaseActiveReservations,
  reserveFefo,
  consumeActiveReservations,
} = vi.hoisted(() => ({
  acquireIdempotencyRecord: vi.fn(),
  completeIdempotencyRecord: vi.fn(),
  pdfDocuments: [] as Array<{ texts: string[] }>,
  releaseActiveReservations: vi.fn(),
  reserveFefo: vi.fn(),
  consumeActiveReservations: vi.fn(),
  mockDb: {
    producto: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    lote: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    itemPedido: { findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    pedido: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    cliente: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    reservaStock: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
    movimientoStock: { create: vi.fn() },
    pedidoAuditoria: { create: vi.fn() },
    remito: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    transportista: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

vi.mock('pdfkit', () => {
  class TestPdfDocument {
    readonly texts: string[] = []
    private destination: { end: () => void } | undefined

    pipe(destination: { end: () => void }): this { this.destination = destination; return this }
    fontSize(_size: number): this { return this }
    font(_name: string): this { return this }
    fillColor(_color: string): this { return this }
    lineWidth(_width: number): this { return this }
    text(value: string): this { this.texts.push(value); return this }
    rect(_x: number, _y: number, _width: number, _height: number): this { return this }
    moveTo(_x: number, _y: number): this { return this }
    lineTo(_x: number, _y: number): this { return this }
    stroke(): this { return this }
    addPage(): this { return this }
    end(): void { this.destination?.end() }
  }

  return {
    default: class extends TestPdfDocument {
      constructor() {
        super()
        pdfDocuments.push(this)
      }
    },
  }
})

vi.mock('@platform/core', () => {
  const jsonwebtoken = require('jsonwebtoken')
  return {
    getAppAccess: (user: { apps?: Record<string, unknown> }, app: string) => user.apps?.[app],
    verifyAccessToken: (token: string) => {
      try { return jsonwebtoken.verify(token, process.env.PLATFORM_JWT_SECRET ?? JWT_SECRET) } catch { return null }
    },
    eventBus: { emit: vi.fn(), on: vi.fn() },
  }
})

vi.mock('@platform/db', () => ({
  platformDb: mockDb,
  TipoMovimiento: { ENTRADA_MANUAL: 'ENTRADA_MANUAL', SALIDA_PEDIDO: 'SALIDA_PEDIDO', AJUSTE: 'AJUSTE' },
  Prisma: { sql: (strings: TemplateStringsArray) => strings.join('?') },
}))

vi.mock('../routes/ale-bet/sse-manager', () => ({ sseManager: { emitToRole: vi.fn(), emitToUser: vi.fn() } }))
vi.mock('../routes/ale-bet/reservas-service', () => ({
  StockConflictError: class StockConflictError extends Error {},
  releaseActiveReservations,
  reserveFefo,
  consumeActiveReservations,
}))
vi.mock('../utils/idempotency', () => ({
  calculateFingerprint: () => 'fingerprint',
  getSingleIdempotencyKey: (headers: string[]) => {
    const index = headers.findIndex((value) => value.toLowerCase() === 'idempotency-key')
    return index < 0 ? undefined : headers[index + 1]
  },
  acquireIdempotencyRecord,
  completeIdempotencyRecord,
  toPersistableResponseBody: <T>(body: T) => body,
}))

function token(role: 'admin' | 'vendedor' | 'armador' | 'facturacion', subject = `${role}-1`): string {
  return jwt.sign({ sub: subject, apps: { 'ale-bet': { rol: role, activo: true } } }, JWT_SECRET, { expiresIn: '15m' })
}

function pedido(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pedido-1', numero: 'P-1', vendedorId: 'vendedor-1', estado: 'BORRADOR', version: 1,
    clienteId: 'cliente-1', cliente: { id: 'cliente-1', nombre: 'Cliente', estado: 'VALIDADO' },
    items: [{ id: 'item-1', productoId: 'producto-1', cantidad: 3, completado: false, producto: { id: 'producto-1', nombre: 'Producto' } }],
    ...overrides,
  }
}

async function app(): Promise<Express> {
  const express = await import('express')
  const { createAleBetRoutes } = await import('../routes/ale-bet')
  const { verifyToken } = await import('../middlewares/verify-token')
  const server = express.default()
  server.use(express.json())
  server.use('/api/ale-bet', verifyToken, createAleBetRoutes())
  return server
}

describe('ALEBET-01 HTTP contracts', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = JWT_SECRET
    vi.clearAllMocks()
    pdfDocuments.length = 0
    mockDb.$transaction.mockImplementation(async (work: (tx: typeof mockDb) => Promise<unknown>) => work(mockDb))
    mockDb.$queryRaw.mockResolvedValue([])
    acquireIdempotencyRecord.mockResolvedValue({ type: 'PROPRIETARY', id: 'idem-1' })
    completeIdempotencyRecord.mockResolvedValue(undefined)
    mockDb.remito.updateMany.mockResolvedValue({ count: 0 })
    mockDb.pedidoAuditoria.create.mockResolvedValue({})
  })

  it('creates a validated customer order as BORRADOR without a reservation', async () => {
    mockDb.cliente.findUnique.mockResolvedValue({ id: 'cliente-1', estado: 'VALIDADO' })
    mockDb.pedido.create.mockResolvedValue(pedido())
    const server = await app()
    const response = await request(server).post('/api/ale-bet/pedidos').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ clienteId: 'cliente-1', items: [{ productoId: 'producto-1', cantidad: 3 }] }).expect(201)

    expect(response.body.estado).toBe('BORRADOR')
    expect(reserveFefo).not.toHaveBeenCalled()
  })

  it('rejects approval for PENDIENTE_CLIENTE before reserving stock', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ cliente: { id: 'cliente-1', estado: 'PENDIENTE_CLIENTE' } }))
    const server = await app()
    await request(server).put('/api/ale-bet/pedidos/pedido-1/aprobar').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ expectedVersion: 1 }).expect(409)
    expect(reserveFefo).not.toHaveBeenCalled()
  })

  it('approves the owner order with expectedVersion and reserves it', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido())
    mockDb.pedido.update.mockResolvedValue(pedido({ estado: 'APROBADO', version: 2 }))
    const server = await app()
    const response = await request(server).put('/api/ale-bet/pedidos/pedido-1/aprobar').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ expectedVersion: 1 }).expect(200)
    expect(response.body.estado).toBe('APROBADO')
    expect(reserveFefo).toHaveBeenCalledWith(mockDb, 'pedido-1', expect.any(Array))
  })

  it('returns 409 on stale expectedVersion before modifying an approved order', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'APROBADO', version: 2 }))
    const server = await app()
    await request(server).patch('/api/ale-bet/pedidos/pedido-1').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ clienteId: 'cliente-1', items: [{ productoId: 'producto-1', cantidad: 4 }], expectedVersion: 1 }).expect(409)
    expect(releaseActiveReservations).not.toHaveBeenCalled()
    expect(mockDb.itemPedido.deleteMany).not.toHaveBeenCalled()
  })

  it('releases then recalculates reservations when an approved order is edited', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'APROBADO' }))
    mockDb.cliente.findUnique.mockResolvedValue({ id: 'cliente-1', estado: 'VALIDADO' })
    mockDb.pedido.update.mockResolvedValue(pedido({ estado: 'APROBADO', version: 2, items: [{ id: 'item-2', productoId: 'producto-1', cantidad: 4, producto: {} }] }))
    const server = await app()
    await request(server).patch('/api/ale-bet/pedidos/pedido-1').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ clienteId: 'cliente-1', items: [{ productoId: 'producto-1', cantidad: 4 }], expectedVersion: 1 }).expect(200)
    expect(releaseActiveReservations).toHaveBeenCalledWith(mockDb, 'pedido-1')
    expect(reserveFefo).toHaveBeenCalledWith(mockDb, 'pedido-1', expect.any(Array))
  })

  it('lets a vendor request, but not execute, EN_ARMADO cancellation', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'EN_ARMADO' }))
    mockDb.pedido.update.mockResolvedValue(pedido({ estado: 'EN_ARMADO', version: 2, cancelacionSolicitadaAt: new Date() }))
    const server = await app()
    const response = await request(server).put('/api/ale-bet/pedidos/pedido-1/cancelar').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ expectedVersion: 1, motivo: 'Cliente pidió detener el armado' }).expect(202)
    expect(response.body.requested).toBe(true)
    expect(releaseActiveReservations).not.toHaveBeenCalled()
  })

  it('discards a BORRADOR by deleting its items and order without releasing stock', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'BORRADOR' }))
    mockDb.itemPedido.deleteMany.mockResolvedValue({ count: 1 })
    mockDb.pedido.delete.mockResolvedValue(pedido({ estado: 'BORRADOR' }))
    const server = await app()

    const response = await request(server).put('/api/ale-bet/pedidos/pedido-1/cancelar').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ expectedVersion: 1 }).expect(200)

    expect(response.body).toEqual({ discarded: true, requested: false, pedidoId: 'pedido-1' })
    expect(mockDb.itemPedido.deleteMany).toHaveBeenCalledWith({ where: { pedidoId: 'pedido-1' } })
    expect(mockDb.pedido.delete).toHaveBeenCalledWith({ where: { id: 'pedido-1' } })
    expect(releaseActiveReservations).not.toHaveBeenCalled()
    expect(mockDb.movimientoStock.create).not.toHaveBeenCalled()
    expect(mockDb.pedidoAuditoria.create).not.toHaveBeenCalled()
  })

  it('only armador or admin can confirm an EN_ARMADO cancellation', async () => {
    const server = await app()
    await request(server).put('/api/ale-bet/pedidos/pedido-1/confirmar-cancelacion').set('Authorization', `Bearer ${token('facturacion')}`)
      .send({ expectedVersion: 1, motivo: 'Cliente pidió detener el armado' }).expect(403)

    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'EN_ARMADO', cancelacionSolicitadaAt: new Date() }))
    mockDb.pedido.update.mockResolvedValue(pedido({ estado: 'CANCELADO', version: 2 }))
    await request(server).put('/api/ale-bet/pedidos/pedido-1/confirmar-cancelacion').set('Authorization', `Bearer ${token('armador')}`)
      .send({ expectedVersion: 1, motivo: 'Cancelación confirmada en armado' }).expect(200)
    expect(releaseActiveReservations).toHaveBeenCalledWith(mockDb, 'pedido-1')
  })

  it('does not double-release an already cancelled order', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'CANCELADO' }))
    const server = await app()
    await request(server).put('/api/ale-bet/pedidos/pedido-1/cancelar').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ expectedVersion: 1, motivo: 'Cancelación' }).expect(409)
    expect(releaseActiveReservations).not.toHaveBeenCalled()
  })

  it('requires every item completed before armador can mark PREPARADO', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'EN_ARMADO', armadorId: 'armador-1' }))
    const server = await app()
    await request(server).put('/api/ale-bet/pedidos/pedido-1/preparar').set('Authorization', `Bearer ${token('armador')}`)
      .send({ expectedVersion: 1 }).expect(409)
  })

  it('rejects an unassigned armador before returning an idempotent PREPARADO response', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'PREPARADO', armadorId: 'another-armador' }))
    const server = await app()
    await request(server).put('/api/ale-bet/pedidos/pedido-1/preparar').set('Authorization', `Bearer ${token('armador')}`)
      .send({ expectedVersion: 1 }).expect(403)
  })

  it('requires the current expectedVersion before returning an idempotent PREPARADO response', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'PREPARADO', armadorId: 'armador-1', version: 2 }))
    const server = await app()
    await request(server).put('/api/ale-bet/pedidos/pedido-1/preparar').set('Authorization', `Bearer ${token('armador')}`)
      .send({ expectedVersion: 1 }).expect(409)
  })

  it('replays PREPARADO only after verifying the assigned armador, preserving the original expectedVersion contract', async () => {
    acquireIdempotencyRecord.mockResolvedValue({ type: 'REPLAY', status: 200, body: pedido({ estado: 'PREPARADO', version: 2 }) })
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'PREPARADO', armadorId: 'armador-1', version: 2 }))
    const server = await app()
    const response = await request(server).put('/api/ale-bet/pedidos/pedido-1/preparar').set('Authorization', `Bearer ${token('armador')}`)
      .set('Idempotency-Key', 'prepare-1').send({ expectedVersion: 1 }).expect(200)
    expect(response.headers['idempotency-replayed']).toBe('true')

    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'PREPARADO', armadorId: 'other-armador', version: 2 }))
    await request(server).put('/api/ale-bet/pedidos/pedido-1/preparar').set('Authorization', `Bearer ${token('armador')}`)
      .set('Idempotency-Key', 'prepare-1').send({ expectedVersion: 1 }).expect(403)
  })

  it('replays item completion without applying the mutation twice', async () => {
    acquireIdempotencyRecord.mockResolvedValue({ type: 'REPLAY', status: 200, body: pedido({ estado: 'EN_ARMADO', version: 2 }) })
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'EN_ARMADO', armadorId: 'armador-1', version: 2, items: [{ id: 'item-1', productoId: 'producto-1', cantidad: 3, completado: true, producto: {} }] }))
    const server = await app()
    const response = await request(server).put('/api/ale-bet/pedidos/pedido-1/items/item-1/completar').set('Authorization', `Bearer ${token('armador')}`)
      .set('Idempotency-Key', 'complete-item-1').send({ expectedVersion: 1 }).expect(200)
    expect(response.headers['idempotency-replayed']).toBe('true')
    expect(mockDb.itemPedido.update).not.toHaveBeenCalled()
  })

  it('rejects facturacion dispatch and lets armador dispatch a PREPARADO order with remito', async () => {
    const server = await app()
    await request(server).post('/api/ale-bet/pedidos/pedido-1/despachar').set('Authorization', `Bearer ${token('facturacion')}`)
      .send({ expectedVersion: 1 }).expect(403)

    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'PREPARADO' }))
    mockDb.remito.findFirst.mockResolvedValue({ id: 'remito-1', estado: 'VIGENTE' })
    mockDb.pedido.update.mockResolvedValue(pedido({ estado: 'DESPACHADO', version: 2 }))
    const response = await request(server).post('/api/ale-bet/pedidos/pedido-1/despachar').set('Authorization', `Bearer ${token('armador')}`)
      .send({ expectedVersion: 1 }).expect(200)
    expect(response.body.estado).toBe('DESPACHADO')
    expect(consumeActiveReservations).toHaveBeenCalledWith(mockDb, 'pedido-1', 'armador-1')
  })

  it('replays an idempotent dispatch without consuming reservations again', async () => {
    acquireIdempotencyRecord.mockResolvedValue({ type: 'REPLAY', status: 200, body: pedido({ estado: 'DESPACHADO', version: 2 }) })
    const server = await app()
    const response = await request(server).post('/api/ale-bet/pedidos/pedido-1/despachar').set('Authorization', `Bearer ${token('armador')}`)
      .set('Idempotency-Key', 'dispatch-1').send({ expectedVersion: 1 }).expect(200)
    expect(response.headers['idempotency-replayed']).toBe('true')
    expect(consumeActiveReservations).not.toHaveBeenCalled()
  })

  it('returns physical, reserved and available stock to a vendedor', async () => {
    mockDb.producto.findMany.mockResolvedValue([{ id: 'producto-1', nombre: 'Producto', sku: 'SKU', unidadesPorCaja: 15, lotes: [{ cajas: 1, sueltos: 2, reservas: [{ cantidad: 4 }] }] }])
    const server = await app()
    const response = await request(server).get('/api/ale-bet/productos/search?q=pro').set('Authorization', `Bearer ${token('vendedor')}`).expect(200)
    expect(response.body[0]).toMatchObject({ fisico: 17, reservado: 4, disponible: 13 })
  })

  it('rejects deactivating a lot while it has active reservations', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: 'lote-1', productoId: 'producto-1', cajas: 1, sueltos: 0, unidadesPorCaja: 15 }])
    mockDb.reservaStock.aggregate.mockResolvedValue({ _sum: { cantidad: 3 } })
    const server = await app()
    await request(server).put('/api/ale-bet/productos/producto-1/lotes/lote-1').set('Authorization', `Bearer ${token('admin')}`)
      .send({ activo: false }).expect(409)
    expect(mockDb.lote.update).not.toHaveBeenCalled()
  })

  it('creates a lot using the product presentation and rejects overflowing loose units', async () => {
    mockDb.producto.findUnique.mockResolvedValue({ id: 'producto-20', sku: 'P20', unidadesPorCaja: 20 })
    mockDb.lote.count.mockResolvedValue(0)
    mockDb.lote.create.mockResolvedValue({ id: 'lote-20', numero: 'P200001', cajas: 2, sueltos: 7 })
    mockDb.movimientoStock.create.mockResolvedValue({})
    const server = await app()

    const created = await request(server).post('/api/ale-bet/productos/producto-20/lotes').set('Authorization', `Bearer ${token('admin')}`)
      .send({ cajas: 2, sueltos: 7, fechaProduccion: '2026-01-01T00:00:00.000Z' }).expect(201)
    expect(created.body).toMatchObject({ unidades: 47, unidadesPorCaja: 20 })

    mockDb.producto.findUnique.mockResolvedValue({ id: 'producto-4', sku: 'P4', unidadesPorCaja: 4 })
    await request(server).post('/api/ale-bet/productos/producto-4/lotes').set('Authorization', `Bearer ${token('admin')}`)
      .send({ cajas: 2, sueltos: 4, fechaProduccion: '2026-01-01T00:00:00.000Z' }).expect(400)
  })

  it('rejects a lot edit whose loose units reach the product presentation', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: 'lote-4', productoId: 'producto-4', cajas: 2, sueltos: 3, unidadesPorCaja: 4 }])
    const server = await app()
    await request(server).put('/api/ale-bet/productos/producto-4/lotes/lote-4').set('Authorization', `Bearer ${token('admin')}`)
      .send({ sueltos: 4 }).expect(400)
    expect(mockDb.lote.update).not.toHaveBeenCalled()
  })

  it('creates pending customers for vendedor and only facturacion can validate them', async () => {
    mockDb.cliente.create.mockResolvedValue({ id: 'cliente-1', nombre: 'Nuevo', estado: 'PENDIENTE_CLIENTE' })
    const server = await app()
    await request(server).post('/api/ale-bet/clientes').set('Authorization', `Bearer ${token('vendedor')}`).send({ nombre: 'Nuevo' }).expect(400)
    await request(server).post('/api/ale-bet/clientes').set('Authorization', `Bearer ${token('vendedor')}`).send({ nombre: 'Nuevo', referencia: 'Pedido por WhatsApp' }).expect(201)
    expect(mockDb.cliente.create).toHaveBeenCalledWith({ data: expect.objectContaining({ estado: 'PENDIENTE_CLIENTE', referencia: 'Pedido por WhatsApp' }) })
    await request(server).put('/api/ale-bet/clientes/cliente-1').set('Authorization', `Bearer ${token('vendedor')}`).send({ estado: 'VALIDADO' }).expect(403)
  })

  it('lets facturacion emit a remito snapshot and invalidates it when an approved order changes', async () => {
    mockDb.pedido.findUnique.mockResolvedValue(pedido({ estado: 'APROBADO' }))
    mockDb.transportista.findUnique.mockResolvedValue({ id: 'transportista-1', nombre: 'Transporte', direccion: 'Ruta 1', activo: true })
    mockDb.remito.create.mockResolvedValue({ id: 'remito-1', numero: 'R-1', estado: 'VIGENTE' })
    const server = await app()
    await request(server).post('/api/ale-bet/pedidos/pedido-1/remitos').set('Authorization', `Bearer ${token('facturacion')}`)
      .send({ expectedVersion: 1, transportistaId: 'transportista-1' }).expect(201)
    expect(mockDb.remito.create).toHaveBeenCalledWith({ data: expect.objectContaining({ clienteSnapshot: expect.any(Object), itemsSnapshot: expect.any(Array) }) })

    mockDb.cliente.findUnique.mockResolvedValue({ id: 'cliente-1', estado: 'VALIDADO' })
    mockDb.pedido.update.mockResolvedValue(pedido({ estado: 'APROBADO', version: 2, items: [{ id: 'item-2', productoId: 'producto-1', cantidad: 4, producto: {} }] }))
    await request(server).patch('/api/ale-bet/pedidos/pedido-1').set('Authorization', `Bearer ${token('vendedor')}`)
      .send({ clienteId: 'cliente-1', items: [{ productoId: 'producto-1', cantidad: 4 }], expectedVersion: 1 }).expect(200)
    expect(mockDb.remito.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: 'INVALIDADO' }) }))
  })

  it('downloads a complete habitual-transport remito from historical snapshots without technical JSON', async () => {
    mockDb.remito.findFirst.mockResolvedValue({
      id: 'remito-1',
      numero: 'R-20260805-AB12CD34',
      fecha: new Date('2026-08-05T12:00:00.000Z'),
      pedido: { vendedorId: 'vendedor-1' },
      clienteSnapshot: {
        id: 'old-client-id',
        nombre: 'Cliente histórico',
        direccion: 'Av. Histórica 123',
        localidad: 'Rosario',
        provincia: 'Santa Fe',
        cuit: '30-71234567-9',
        condicionIva: 'Responsable Inscripto',
        condicionVenta: 'Cuenta corriente',
        estado: 'VALIDADO',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-02-01T00:00:00.000Z',
      },
      transporteSnapshot: {
        id: 'old-transport-id',
        nombre: 'Transporte histórico',
        direccion: 'Ruta 2',
        activo: false,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      transporteNombre: 'Transporte histórico',
      transporteDireccion: 'Ruta 2',
      itemsSnapshot: [{ productoId: 'old-product-id', nombre: 'Producto histórico', cantidad: 9, stock: 45, reservado: 9 }],
    })
    mockDb.cliente.findUnique.mockResolvedValue({ nombre: 'Cliente maestro cambiado' })
    mockDb.transportista.findUnique.mockResolvedValue({ nombre: 'Transporte maestro cambiado' })
    const server = await app()

    await request(server).get('/api/ale-bet/pedidos/pedido-1/remito.pdf').set('Authorization', `Bearer ${token('vendedor')}`).expect('Content-Type', /application\/pdf/).expect(200)

    const content = pdfDocuments[0]?.texts.join('\n') ?? ''
    expect(content).toContain('Cliente histórico')
    expect(content).toContain('Av. Histórica 123')
    expect(content).toContain('Rosario / Santa Fe')
    expect(content).toContain('30-71234567-9')
    expect(content).toContain('Responsable Inscripto')
    expect(content).toContain('Cuenta corriente')
    expect(content).toContain('Transporte histórico')
    expect(content).toContain('Ruta 2')
    expect(content).toContain('Producto histórico')
    expect(content).toContain('9')
    expect(content).toContain('R-20260805-AB12CD34')
    expect(content).toContain('Fecha: 2026-08-05')
    expect(content).toContain('BULTOS: __________________')
    expect(content).toContain('PESO: ____________________')
    expect(content).not.toContain('old-client-id')
    expect(content).not.toContain('old-transport-id')
    expect(content).not.toContain('old-product-id')
    expect(content).not.toContain('VALIDADO')
    expect(content).not.toContain('productoId')
    expect(content).not.toContain('createdAt')
    expect(content).not.toContain('updatedAt')
    expect(content).not.toContain('Cliente maestro cambiado')
    expect(content).not.toContain('Transporte maestro cambiado')
    expect(content).not.toContain('{')
    expect(content).not.toContain('}')
    expect(mockDb.cliente.findUnique).not.toHaveBeenCalled()
    expect(mockDb.transportista.findUnique).not.toHaveBeenCalled()
  })

  it('downloads an occasional-transport remito with absent optional snapshot values left blank', async () => {
    mockDb.remito.findFirst.mockResolvedValue({
      id: 'remito-2',
      numero: 'R-20260805-EF56GH78',
      fecha: new Date('2026-08-05T12:00:00.000Z'),
      pedido: { vendedorId: 'vendedor-1' },
      clienteSnapshot: {
        id: 'occasional-client-id',
        nombre: 'Cliente ocasional',
        direccion: null,
        localidad: null,
        provincia: null,
        cuit: null,
        condicionIva: null,
        condicionVenta: null,
        updatedAt: null,
      },
      transporteSnapshot: { nombre: 'Flete ocasional', direccion: 'Calle Ocasional 456', activo: null },
      transporteNombre: 'Fallback no utilizado',
      transporteDireccion: 'Fallback no utilizado',
      itemsSnapshot: [{ productoId: 'occasional-product-id', nombre: 'Mercadería ocasional', cantidad: 2, createdAt: null }],
    })
    const server = await app()

    await request(server).get('/api/ale-bet/pedidos/pedido-1/remito.pdf').set('Authorization', `Bearer ${token('vendedor')}`).expect('Content-Type', /application\/pdf/).expect(200)

    const content = pdfDocuments[0]?.texts.join('\n') ?? ''
    expect(content).toContain('Cliente ocasional')
    expect(content).toContain('Flete ocasional')
    expect(content).toContain('Calle Ocasional 456')
    expect(content).toContain('Mercadería ocasional')
    expect(content).toContain('R-20260805-EF56GH78')
    expect(content).toContain('Fecha: 2026-08-05')
    expect(content).not.toContain('Fallback no utilizado')
    expect(content).not.toContain('occasional-client-id')
    expect(content).not.toContain('occasional-product-id')
    expect(content).not.toContain('activo')
    expect(content).not.toContain('null')
    expect(content).not.toContain('undefined')
    expect(content).not.toContain('{')
    expect(content).not.toContain('}')
  })
})
