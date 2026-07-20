import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'
import jwt from 'jsonwebtoken'

// ──────────────────────────────────────────────────
// Hoisted mocks
// ──────────────────────────────────────────────────
const { mockDb, mockSseManager, mockEventBus } = vi.hoisted(() => ({
  mockDb: {
    producto: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    lote: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    itemPedido: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    pedido: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    movimientoStock: {
      create: vi.fn(),
    },
    platformUser: {
      findMany: vi.fn(),
    },
    cliente: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockSseManager: {
    emitToRole: vi.fn(),
    emitToUser: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
  },
  mockEventBus: {
    on: vi.fn().mockReturnValue(vi.fn()),
    emit: vi.fn(),
  },
}))

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
const JWT_SECRET = 'test-secret-for-jwt-min-32-chars!!'

function signToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      apps: {
        ale_bet: { rol: 'admin', activo: true },
        deposito: { rol: 'encargado', activo: true },
      },
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  )
}

function signVendedorToken(): string {
  return signToken({
    sub: 'vendedor-1',
    apps: { ale_bet: { rol: 'vendedor', activo: true } },
  })
}

function signArmadorToken(): string {
  return signToken({
    sub: 'armador-1',
    apps: { ale_bet: { rol: 'armador', activo: true } },
  })
}

function signSinAccesoToken(): string {
  return signToken({
    sub: 'no-access',
    apps: { deposito: { rol: 'encargado', activo: true } },
  })
}

// ──────────────────────────────────────────────────
// Module-level mocking
// ──────────────────────────────────────────────────
vi.mock('@platform/core', () => {
  const _jwt = require('jsonwebtoken')

  function _getSecret(): string {
    return process.env.PLATFORM_JWT_SECRET || JWT_SECRET
  }

  return {
    signAccessToken: (payload: Record<string, unknown>) => {
      return _jwt.sign(payload, _getSecret(), { expiresIn: '15m' })
    },
    signRefreshToken: (userId: string) => {
      return _jwt.sign({ sub: userId, type: 'refresh' }, _getSecret(), { expiresIn: '7d' })
    },
    verifyAccessToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret()) as Record<string, unknown>
        return decoded
      } catch {
        return null
      }
    },
    verifyRefreshToken: (token: string) => {
      try {
        const decoded = _jwt.verify(token, _getSecret()) as Record<string, unknown>
        return decoded.type === 'refresh' ? decoded : null
      } catch {
        return null
      }
    },
    decodeToken: (token: string) => {
      return _jwt.decode(token)
    },
    createUser: vi.fn(),
    getUserById: vi.fn(),
    getUserByEmail: vi.fn(),
    listUsers: vi.fn(),
    updateAppAccess: vi.fn(),
    deactivateUser: vi.fn(),
    hashPassword: vi.fn(),
    comparePassword: vi.fn(),
    eventBus: mockEventBus,
  }
})

vi.mock('@platform/db', () => ({
  platformDb: mockDb,
  TipoMovimiento: {
    ENTRADA_MANUAL: 'ENTRADA_MANUAL',
    SALIDA_PEDIDO: 'SALIDA_PEDIDO',
    AJUSTE: 'AJUSTE',
  },
  Prisma: {},
}))

vi.mock('../routes/ale-bet/sse-manager', () => ({
  sseManager: mockSseManager,
}))

// ──────────────────────────────────────────────────
// Test app factory
// ──────────────────────────────────────────────────
async function createTestApp(): Promise<Express> {
  const express = await import('express')
  const { createAleBetRoutes } = await import('../routes/ale-bet/index')
  const { verifyToken } = await import('../middlewares/verify-token')
  const app = express.default()
  app.use(express.json())
  app.use('/api/ale-bet', verifyToken, createAleBetRoutes())
  return app
}

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────
describe('Ale-Bet Module', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = JWT_SECRET
    vi.clearAllMocks()
    mockDb.$transaction.mockImplementation(async (fn: Function) => fn(mockDb))
  })

  // ─── Productos ─────────────────────────────────
  describe('GET /api/ale-bet/productos', () => {
    it('lista productos con stock calculado', async () => {
      mockDb.producto.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          nombre: 'Producto A',
          sku: 'SKU001',
          stockMinimo: 10,
          activo: true,
          lotes: [
            { id: 'lote-1', numero: 'L001', cajas: 2, sueltos: 5, fechaProduccion: new Date(), fechaVencimiento: new Date() },
          ],
        },
      ])
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/productos')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body[0].nombre).toBe('Producto A')
      expect(typeof res.body[0].stock).toBe('number')
    })

    it('devuelve 401 sin token', async () => {
      const app = await createTestApp()
      await request(app).get('/api/ale-bet/productos').expect(401)
    })

    it('devuelve 403 sin acceso a ale_bet', async () => {
      const app = await createTestApp()
      await request(app)
        .get('/api/ale-bet/productos')
        .set('Authorization', `Bearer ${signSinAccesoToken()}`)
        .expect(403)
    })
  })

  describe('POST /api/ale-bet/productos', () => {
    it('crea un producto con datos válidos', async () => {
      mockDb.producto.create.mockResolvedValue({
        id: 'prod-new',
        nombre: 'Nuevo Producto',
        sku: 'SKU002',
        stockMinimo: 5,
        activo: true,
      })
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/productos')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ nombre: 'Nuevo Producto', sku: 'SKU002', stockMinimo: 5 })
        .expect(201)

      expect(res.body.nombre).toBe('Nuevo Producto')
    })

    it('devuelve 400 con datos inválidos', async () => {
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/productos')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ nombre: 'A', sku: '' })
        .expect(400)

      expect(res.body.error).toBe('Datos inválidos')
    })
  })

  describe('DELETE /api/ale-bet/productos/:id', () => {
    it('elimina producto sin pedidos activos', async () => {
      mockDb.itemPedido.findFirst.mockResolvedValue(null)
      mockDb.producto.delete.mockResolvedValue({} as any)
      const app = await createTestApp()

      await request(app)
        .delete('/api/ale-bet/productos/prod-1')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(204)
    })

    it('devuelve 409 si tiene pedidos activos', async () => {
      mockDb.itemPedido.findFirst.mockResolvedValue({ id: 'item-1' })
      const app = await createTestApp()

      const res = await request(app)
        .delete('/api/ale-bet/productos/prod-1')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(409)

      expect(res.body.error).toBe('El producto tiene pedidos activos asociados')
    })
  })

  // ─── Pedidos ───────────────────────────────────
  describe('GET /api/ale-bet/pedidos', () => {
    it('lista pedidos para admin', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/pedidos')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(Array.isArray(res.body)).toBe(true)
    })

    it('filtra por vendedorId para rol vendedor', async () => {
      mockDb.pedido.findMany.mockResolvedValue([])
      mockDb.platformUser.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/pedidos')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .expect(200)

      expect(mockDb.pedido.findMany).toHaveBeenCalled()
      expect(res.body).toEqual([])
    })
  })

  describe('POST /api/ale-bet/pedidos', () => {
    it('crea un pedido con items', async () => {
      mockDb.pedido.create.mockResolvedValue({
        id: 'pedido-1',
        numero: 'P-20260624-0001',
        clienteId: 'cliente-1',
        vendedorId: 'vendedor-1',
        estado: 'PENDIENTE',
        items: [],
        cliente: { id: 'cliente-1', nombre: 'Cliente A' },
      })
      mockDb.platformUser.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/pedidos')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .send({
          clienteId: 'cliente-1',
          items: [{ productoId: 'prod-1', cantidad: 5 }],
        })
        .expect(201)

      expect(res.body.estado).toBe('PENDIENTE')
    })

    it('devuelve 400 sin items', async () => {
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/pedidos')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .send({ clienteId: 'cliente-1', items: [] })
        .expect(400)

      expect(res.body.error).toBe('Datos inválidos')
    })
  })

  describe('PUT /api/ale-bet/pedidos/:id/aprobar', () => {
    it('aprueba un pedido PENDIENTE', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'PENDIENTE',
        numero: 'P-001',
        cliente: { id: 'cliente-1', nombre: 'Cliente A' },
        vendedorId: 'vendedor-1',
        items: [],
      })
      mockDb.pedido.update.mockResolvedValue({
        id: 'pedido-1',
        estado: 'APROBADO',
        numero: 'P-001',
        cliente: { id: 'cliente-1', nombre: 'Cliente A' },
        vendedorId: 'vendedor-1',
        items: [],
      })
      mockDb.platformUser.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/aprobar')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.estado).toBe('APROBADO')
      expect(mockSseManager.emitToRole).toHaveBeenCalled()
    })

    it('devuelve 409 si no está PENDIENTE', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'COMPLETADO',
        cliente: { nombre: 'Cliente A' },
      })
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/aprobar')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(409)
    })
  })

  describe('PUT /api/ale-bet/pedidos/:id/tomar', () => {
    it('toma un pedido APROBADO', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'APROBADO',
      })
      mockDb.pedido.update.mockResolvedValue({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        armadorId: 'armador-1',
        cliente: { nombre: 'Cliente A' },
        items: [],
        vendedorId: 'vendedor-1',
      })
      mockDb.platformUser.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/tomar')
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(200)

      expect(res.body.estado).toBe('EN_ARMADO')
    })
  })

  describe('PUT /api/ale-bet/pedidos/:id/cancelar', () => {
    it('cancela un pedido PENDIENTE', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'PENDIENTE',
      })
      mockDb.pedido.update.mockResolvedValue({
        id: 'pedido-1',
        estado: 'CANCELADO',
        cliente: { nombre: 'Cliente A' },
        items: [],
        vendedorId: 'vendedor-1',
      })
      mockDb.platformUser.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/cancelar')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body.estado).toBe('CANCELADO')
    })

    it('devuelve 409 si ya está COMPLETADO', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'COMPLETADO',
      })
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/cancelar')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(409)

      expect(res.body.error).toBe('No se puede cancelar un pedido en estado COMPLETADO')
    })
  })

  // ─── Clientes ─────────────────────────────────
  describe('GET /api/ale-bet/clientes', () => {
    it('lista clientes', async () => {
      mockDb.cliente.findMany.mockResolvedValue([
        { id: 'c-1', nombre: 'Cliente A', contacto: null, direccion: null, activo: true },
      ])
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/clientes')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body).toHaveLength(1)
      expect(res.body[0].nombre).toBe('Cliente A')
    })

    it('crea un cliente (POST /api/ale-bet/clientes)', async () => {
      const nuevoCliente = { id: 'c-2', nombre: 'Cliente B', contacto: 'Juan', direccion: 'Calle 123' }
      mockDb.cliente.create.mockResolvedValue(nuevoCliente)
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/clientes')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ nombre: 'Cliente B', contacto: 'Juan', direccion: 'Calle 123' })
        .expect(201)

      expect(res.body.nombre).toBe('Cliente B')
      expect(mockDb.cliente.create).toHaveBeenCalledWith({
        data: { nombre: 'Cliente B', contacto: 'Juan', direccion: 'Calle 123' }
      })
    })

    it('actualiza un cliente (PUT /api/ale-bet/clientes/:id)', async () => {
      const clienteActualizado = { id: 'c-1', nombre: 'Cliente Modificado', contacto: 'Juan', direccion: 'Calle 123', activo: true }
      mockDb.cliente.update.mockResolvedValue(clienteActualizado)
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/clientes/c-1')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ nombre: 'Cliente Modificado' })
        .expect(200)

      expect(res.body.nombre).toBe('Cliente Modificado')
      expect(mockDb.cliente.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { nombre: 'Cliente Modificado' }
      })
    })
  })

  // ─── Notificaciones (SSE Stream) ───────────────
  describe('GET /api/ale-bet/notificaciones/stream', () => {
    it('inicia conexion SSE y registra cliente', async () => {
      mockSseManager.addClient.mockImplementation((userId, rol, res) => {
        setImmediate(() => {
          res.end()
        })
      })
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/notificaciones/stream')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect('Content-Type', /text\/event-stream/)
        .expect(200)

      expect(mockSseManager.addClient).toHaveBeenCalledWith('user-1', 'admin', expect.any(Object))
    })
  })

  // ─── Productos (Update) ─────────────────────────
  describe('PUT /api/ale-bet/productos/:id', () => {
    it('actualiza un producto y devuelve stock calculado', async () => {
      mockDb.producto.update.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Producto Modificado',
        sku: 'SKU001',
        stockMinimo: 10,
        activo: true,
      })
      mockDb.lote.findMany.mockResolvedValue([
        { cajas: 2, sueltos: 5 },
      ])
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/productos/prod-1')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ nombre: 'Producto Modificado' })
        .expect(200)

      expect(res.body.nombre).toBe('Producto Modificado')
      expect(res.body.stock).toBe(35)
      expect(res.body.stockBajo).toBe(false)
    })

    it('devuelve 400 con nombre demasiado corto', async () => {
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/productos/prod-1')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ nombre: 'A' })
        .expect(400)

      expect(res.body.error).toBe('Datos inválidos')
    })

    it('devuelve 401 sin token', async () => {
      const app = await createTestApp()
      await request(app)
        .put('/api/ale-bet/productos/prod-1')
        .send({ nombre: 'Test' })
        .expect(401)
    })

    it('devuelve 403 con rol vendedor', async () => {
      const app = await createTestApp()
      await request(app)
        .put('/api/ale-bet/productos/prod-1')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .send({ nombre: 'Test' })
        .expect(403)
    })
  })

  // ─── Lotes (Get) ────────────────────────────────
  describe('GET /api/ale-bet/productos/:id/lotes', () => {
    it('devuelve lotes con unidades calculadas', async () => {
      mockDb.lote.findMany.mockResolvedValue([
        { id: 'lote-1', numero: 'L001', productoId: 'prod-1', cajas: 2, sueltos: 5, activo: true, fechaProduccion: new Date(), fechaVencimiento: new Date() },
        { id: 'lote-2', numero: 'L002', productoId: 'prod-1', cajas: 1, sueltos: 10, activo: true, fechaProduccion: new Date(), fechaVencimiento: new Date() },
      ])
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/productos/prod-1/lotes')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body).toHaveLength(2)
      expect(res.body[0].unidades).toBe(35)
      expect(res.body[1].unidades).toBe(25)
    })

    it('devuelve array vacío cuando no hay lotes', async () => {
      mockDb.lote.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .get('/api/ale-bet/productos/prod-1/lotes')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200)

      expect(res.body).toEqual([])
    })

    it('devuelve 401 sin token', async () => {
      const app = await createTestApp()
      await request(app)
        .get('/api/ale-bet/productos/prod-1/lotes')
        .expect(401)
    })

    it('devuelve 403 con rol vendedor', async () => {
      const app = await createTestApp()
      await request(app)
        .get('/api/ale-bet/productos/prod-1/lotes')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .expect(403)
    })
  })

  // ─── Lotes (Create) ─────────────────────────────
  describe('POST /api/ale-bet/productos/:id/lotes', () => {
    it('crea un lote y devuelve 201 con unidades', async () => {
      mockDb.producto.findUnique.mockResolvedValue({ id: 'prod-1', sku: 'SKU001', nombre: 'Producto A', stockMinimo: 10, activo: true })
      mockDb.lote.count.mockResolvedValue(0)
      mockDb.lote.create.mockResolvedValue({
        id: 'lote-new',
        numero: 'SKU0010001',
        productoId: 'prod-1',
        cajas: 2,
        sueltos: 5,
        activo: true,
        fechaProduccion: new Date('2026-01-01'),
        fechaVencimiento: new Date('2028-01-01'),
      })
      mockDb.movimientoStock.create.mockResolvedValue({})
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/productos/prod-1/lotes')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ cajas: 2, sueltos: 5, fechaProduccion: '2026-01-01T00:00:00.000Z' })
        .expect(201)

      expect(res.body.numero).toBe('SKU0010001')
      expect(res.body.unidades).toBe(35)
    })

    it('devuelve 400 con cajas negativas', async () => {
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/productos/prod-1/lotes')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ cajas: -1, sueltos: 5, fechaProduccion: '2026-01-01T00:00:00.000Z' })
        .expect(400)

      expect(res.body.error).toBe('Datos inválidos')
    })

    it('devuelve 404 cuando el producto no existe', async () => {
      mockDb.producto.findUnique.mockResolvedValue(null)
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/productos/prod-404/lotes')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ cajas: 2, sueltos: 5, fechaProduccion: '2026-01-01T00:00:00.000Z' })
        .expect(404)

      expect(res.body.error).toBe('Producto no encontrado')
    })

    it('devuelve 409 cuando el número de lote ya existe', async () => {
      mockDb.producto.findUnique.mockResolvedValue({ id: 'prod-1', sku: 'SKU001', nombre: 'Producto A', stockMinimo: 10, activo: true })
      mockDb.lote.count.mockResolvedValue(0)
      const p2002Error = Object.assign(new Error('Unique constraint violation'), { code: 'P2002' })
      mockDb.$transaction.mockRejectedValue(p2002Error)
      const app = await createTestApp()

      const res = await request(app)
        .post('/api/ale-bet/productos/prod-1/lotes')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ cajas: 2, sueltos: 5, fechaProduccion: '2026-01-01T00:00:00.000Z' })
        .expect(409)

      expect(res.body.error).toBe('Ya existe un lote con ese número para este producto')
    })

    it('devuelve 401 sin token', async () => {
      const app = await createTestApp()
      await request(app)
        .post('/api/ale-bet/productos/prod-1/lotes')
        .send({ cajas: 2, sueltos: 5, fechaProduccion: '2026-01-01T00:00:00.000Z' })
        .expect(401)
    })

    it('devuelve 403 con rol vendedor', async () => {
      const app = await createTestApp()
      await request(app)
        .post('/api/ale-bet/productos/prod-1/lotes')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .send({ cajas: 2, sueltos: 5, fechaProduccion: '2026-01-01T00:00:00.000Z' })
        .expect(403)
    })
  })

  // ─── Pedidos (Completar Item) ───────────────────
  describe('PUT /api/ale-bet/pedidos/:id/items/:itemId/completar', () => {
    it('completa un item y devuelve el pedido actualizado', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        items: [
          { id: 'item-1', productoId: 'prod-1', cantidad: 5, completado: false },
          { id: 'item-2', productoId: 'prod-1', cantidad: 3, completado: false },
        ],
      })
      mockDb.itemPedido.update.mockResolvedValue({ id: 'item-1', completado: true })
      mockDb.pedido.findUniqueOrThrow.mockResolvedValue({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        numero: 'P-001',
        clienteId: 'cliente-1',
        vendedorId: 'vendedor-1',
        armadorId: null,
        createdAt: new Date(),
        cliente: { id: 'cliente-1', nombre: 'Cliente A' },
        items: [
          { id: 'item-1', productoId: 'prod-1', cantidad: 5, completado: true, producto: { id: 'prod-1', nombre: 'Producto A' } },
          { id: 'item-2', productoId: 'prod-1', cantidad: 3, completado: false, producto: { id: 'prod-1', nombre: 'Producto A' } },
        ],
      })
      mockDb.platformUser.findMany.mockResolvedValue([
        { id: 'vendedor-1', nombre: 'Vendedor Test' },
      ])
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/items/item-1/completar')
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(200)

      expect(res.body.id).toBe('pedido-1')
      expect(res.body.estado).toBe('EN_ARMADO')
    })

    it('completa el último item y finaliza el pedido', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        items: [
          { id: 'item-1', productoId: 'prod-1', cantidad: 5, completado: false },
          { id: 'item-2', productoId: 'prod-2', cantidad: 3, completado: true },
        ],
      })
      mockDb.itemPedido.update.mockResolvedValue({ id: 'item-1', completado: true })
      mockDb.pedido.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        numero: 'P-001',
        clienteId: 'cliente-1',
        vendedorId: 'vendedor-1',
        armadorId: null,
        createdAt: new Date(),
        cliente: { id: 'cliente-1', nombre: 'Cliente A' },
        items: [
          { id: 'item-1', productoId: 'prod-1', cantidad: 5, completado: true, producto: { id: 'prod-1', nombre: 'Producto A' } },
          { id: 'item-2', productoId: 'prod-2', cantidad: 3, completado: true, producto: { id: 'prod-2', nombre: 'Producto B' } },
        ],
      })
      mockDb.lote.findMany.mockResolvedValue([
        { id: 'lote-1', cajas: 1, sueltos: 0, activo: true, fechaVencimiento: new Date('2027-01-01') },
      ])
      mockDb.lote.update.mockResolvedValue({})
      mockDb.movimientoStock.create.mockResolvedValue({})
      mockDb.pedido.update.mockResolvedValue({
        id: 'pedido-1',
        estado: 'COMPLETADO',
        numero: 'P-001',
        clienteId: 'cliente-1',
        vendedorId: 'vendedor-1',
        armadorId: null,
        createdAt: new Date(),
        cliente: { id: 'cliente-1', nombre: 'Cliente A' },
        items: [
          { id: 'item-1', productoId: 'prod-1', cantidad: 5, completado: true, producto: { id: 'prod-1', nombre: 'Producto A' } },
          { id: 'item-2', productoId: 'prod-2', cantidad: 3, completado: true, producto: { id: 'prod-2', nombre: 'Producto B' } },
        ],
      })
      mockDb.platformUser.findMany.mockResolvedValue([
        { id: 'vendedor-1', nombre: 'Vendedor Test' },
      ])
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/items/item-1/completar')
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(200)

      expect(res.body.estado).toBe('COMPLETADO')
      expect(mockSseManager.emitToUser).toHaveBeenCalledWith(
        'vendedor-1',
        'pedido:completado',
        expect.objectContaining({ pedidoId: 'pedido-1', numero: 'P-001', clienteNombre: 'Cliente A' })
      )
      expect(mockSseManager.emitToRole).toHaveBeenCalledWith(
        'admin',
        'pedido:completado',
        expect.objectContaining({ pedidoId: 'pedido-1' })
      )
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'ale_bet', tipo: 'pedido:completado' })
      )
    })

    it('devuelve 404 cuando el pedido no existe', async () => {
      mockDb.pedido.findUnique.mockResolvedValue(null)
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-404/items/item-1/completar')
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(404)

      expect(res.body.error).toBe('Pedido no encontrado')
    })

    it('devuelve 409 cuando el pedido no está EN_ARMADO', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'PENDIENTE',
        items: [{ id: 'item-1' }],
      })
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/items/item-1/completar')
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(409)

      expect(res.body.error).toBe('Solo se pueden completar items de un pedido en estado EN_ARMADO')
    })

    it('devuelve 404 cuando el item no existe en el pedido', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        items: [{ id: 'item-2', productoId: 'prod-1', cantidad: 3, completado: false }],
      })
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/items/item-999/completar')
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(404)

      expect(res.body.error).toBe('Item no encontrado')
    })

    it('devuelve 409 cuando el stock es insuficiente', async () => {
      mockDb.pedido.findUnique.mockResolvedValue({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        items: [
          { id: 'item-1', productoId: 'prod-1', cantidad: 5, completado: false },
          { id: 'item-2', productoId: 'prod-2', cantidad: 3, completado: true },
        ],
      })
      mockDb.itemPedido.update.mockResolvedValue({ id: 'item-1', completado: true })
      mockDb.pedido.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'pedido-1',
        estado: 'EN_ARMADO',
        numero: 'P-001',
        clienteId: 'cliente-1',
        vendedorId: 'vendedor-1',
        armadorId: null,
        createdAt: new Date(),
        cliente: { id: 'cliente-1', nombre: 'Cliente A' },
        items: [
          { id: 'item-1', productoId: 'prod-1', cantidad: 5, completado: true, producto: { id: 'prod-1', nombre: 'Producto A' } },
          { id: 'item-2', productoId: 'prod-2', cantidad: 3, completado: true, producto: { id: 'prod-2', nombre: 'Producto B' } },
        ],
      })
      mockDb.lote.findMany.mockResolvedValue([])
      const app = await createTestApp()

      const res = await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/items/item-1/completar')
        .set('Authorization', `Bearer ${signArmadorToken()}`)
        .expect(409)

      expect(res.body.error).toBe('Stock insuficiente para completar el pedido')
    })

    it('devuelve 401 sin token', async () => {
      const app = await createTestApp()
      await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/items/item-1/completar')
        .expect(401)
    })

    it('devuelve 403 con rol vendedor', async () => {
      const app = await createTestApp()
      await request(app)
        .put('/api/ale-bet/pedidos/pedido-1/items/item-1/completar')
        .set('Authorization', `Bearer ${signVendedorToken()}`)
        .expect(403)
    })
  })
})
