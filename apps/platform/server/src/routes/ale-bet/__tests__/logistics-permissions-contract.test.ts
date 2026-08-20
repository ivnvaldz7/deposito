import request from 'supertest'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const secret = 'test-secret-for-logistics-permissions'
const db = vi.hoisted(() => ({
  pedido: { findUnique: vi.fn(), update: vi.fn() },
  remito: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  transportista: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  pedidoAuditoria: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}))

vi.mock('@platform/core', () => {
  const { hasPermission } = require('@platform/core/permissions')
  return {
    getAppAccess: (user: { apps?: Record<string, unknown> }, app: string) => user.apps?.[app],
    hasPermission,
    verifyAccessToken: (value: string) => {
      try { return jwt.verify(value, process.env.PLATFORM_JWT_SECRET ?? secret) } catch { return null }
    },
  }
})
vi.mock('@platform/db', () => ({
  platformDb: db,
  Prisma: { sql: (parts: TemplateStringsArray) => parts.join('?') },
}))

type Role = 'admin' | 'vendedor' | 'armador' | 'encargado' | 'facturacion' | 'observador'
const roles: Role[] = ['admin', 'vendedor', 'armador', 'encargado', 'facturacion', 'observador']

function token(role?: string, active = true, subject = `${role ?? 'none'}-1`) {
  const apps = role === undefined ? {} : { 'ale-bet': { rol: role, activo: active } }
  return jwt.sign({ sub: subject, apps }, secret, { expiresIn: '15m' })
}

async function app() {
  const express = await import('express')
  const remitos = (await import('../remitos')).default
  const transportistas = (await import('../transportistas')).default
  const server = express.default()
  server.use(express.json())
  server.use('/api/ale-bet/pedidos', remitos)
  server.use('/api/ale-bet/transportistas', transportistas)
  return server
}

function auth(value: string) { return { Authorization: `Bearer ${value}` } }

describe('Remitos and Transportistas HTTP permission contract', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = secret
    vi.resetAllMocks()
    db.$transaction.mockImplementation(async (work: (tx: typeof db) => Promise<unknown>) => work(db))
    db.$queryRaw.mockResolvedValue([])
    db.remito.updateMany.mockResolvedValue({ count: 0 })
    db.pedido.update.mockResolvedValue({ id: 'pedido-1', version: 2 })
    db.pedidoAuditoria.create.mockResolvedValue({})
  })

  it('enforces the six-role matrix for remito creation without mutations on deny', async () => {
    const server = await app()
    for (const role of roles) {
      const response = await request(server).post('/api/ale-bet/pedidos/pedido-1/remitos').set(auth(token(role)))
        .send({ expectedVersion: 1, transporteOcasional: { nombre: 'Flete Norte', direccion: 'Ruta 2 km 50' } })
      expect(response.status).toBe(['admin', 'facturacion'].includes(role) ? 404 : 403)
    }
    expect(db.$transaction).toHaveBeenCalledTimes(2)
    expect(db.remito.create).not.toHaveBeenCalled()
  })

  it('denies missing, inactive, unknown and Platform Admin access before Remitos or Transportistas mutate', async () => {
    const server = await app()
    const denied = [token(), token('facturacion', false), token('desconocido'), jwt.sign({ sub: 'platform-admin', isPlatformAdmin: true, apps: {} }, secret)]
    for (const value of denied) {
      await request(server).post('/api/ale-bet/pedidos/pedido-1/remitos').set(auth(value))
        .send({ expectedVersion: 1, transporteOcasional: { nombre: 'Flete Norte', direccion: 'Ruta 2 km 50' } }).expect(403)
      await request(server).post('/api/ale-bet/transportistas').set(auth(value))
        .send({ nombre: 'Transporte Sur', direccion: 'Calle 123' }).expect(403)
    }
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.remito.create).not.toHaveBeenCalled()
    expect(db.transportista.create).not.toHaveBeenCalled()
  })

  it('creates and voids remitos only for permitted roles and preserves business validations', async () => {
    const server = await app()
    db.pedido.findUnique.mockResolvedValue({ id: 'pedido-1', estado: 'APROBADO', version: 1, cliente: { id: 'cliente-1' }, items: [{ productoId: 'p1', cantidad: 2, producto: { nombre: 'Producto' } }] })
    db.remito.create.mockResolvedValue({ id: 'remito-1', numero: 'R-1' })
    const created = await request(server).post('/api/ale-bet/pedidos/pedido-1/remitos').set(auth(token('facturacion')))
      .send({ expectedVersion: 1, transporteOcasional: { nombre: 'Flete Norte', direccion: 'Ruta 2 km 50' } }).expect(201)
    expect(created.body.id).toBe('remito-1')
    expect(db.remito.create).toHaveBeenCalledOnce()

    db.remito.findFirst.mockResolvedValue({ id: 'remito-1', pedidoId: 'pedido-1' })
    db.remito.update.mockResolvedValue({ id: 'remito-1', estado: 'INVALIDADO' })
    await request(server).put('/api/ale-bet/pedidos/pedido-1/remitos/remito-1/anular').set(auth(token('admin')))
      .send({ motivo: 'Documento emitido por error' }).expect(200)
    expect(db.remito.update).toHaveBeenCalledOnce()

    await request(server).put('/api/ale-bet/pedidos/pedido-1/remitos/remito-1/anular').set(auth(token('vendedor')))
      .send({ motivo: 'Documento emitido por error' }).expect(403)
    expect(db.remito.update).toHaveBeenCalledOnce()
  })

  it('enforces the six-role matrix for remito voiding without updating denied requests', async () => {
    const server = await app()
    db.remito.findFirst.mockResolvedValue({ id: 'remito-1', pedidoId: 'pedido-1' })
    db.remito.update.mockResolvedValue({ id: 'remito-1', estado: 'INVALIDADO' })
    for (const role of roles) {
      const status = ['admin', 'facturacion'].includes(role) ? 200 : 403
      await request(server).put('/api/ale-bet/pedidos/pedido-1/remitos/remito-1/anular').set(auth(token(role)))
        .send({ motivo: 'Documento emitido por error' }).expect(status)
    }
    expect(db.remito.update).toHaveBeenCalledTimes(2)
  })

  it('enforces the six-role transportistas matrix and never mutates denied requests', async () => {
    const server = await app()
    db.transportista.findMany.mockResolvedValue([])
    for (const role of roles) {
      const status = ['admin', 'facturacion'].includes(role) ? 200 : 403
      await request(server).get('/api/ale-bet/transportistas').set(auth(token(role))).expect(status)
    }
    for (const role of roles) {
      const status = ['admin', 'facturacion'].includes(role) ? 201 : 403
      db.transportista.create.mockResolvedValue({ id: 'transportista-1', nombre: 'Transporte Sur', direccion: 'Calle 123', activo: true })
      await request(server).post('/api/ale-bet/transportistas').set(auth(token(role)))
        .send({ nombre: 'Transporte Sur', direccion: 'Calle 123' }).expect(status)
    }
    expect(db.transportista.create).toHaveBeenCalledTimes(2)
    for (const role of roles) {
      const status = ['admin', 'facturacion'].includes(role) ? 200 : 403
      db.transportista.update.mockResolvedValue({ id: 'transportista-1', nombre: 'Transporte Sur', direccion: 'Ruta 3', activo: false })
      await request(server).patch('/api/ale-bet/transportistas/transportista-1').set(auth(token(role)))
        .send({ activo: false }).expect(status)
    }
    expect(db.transportista.update).toHaveBeenCalledTimes(2)
  })

  it('allows PDF permission but keeps vendedor remito ownership enforcement', async () => {
    const server = await app()
    db.remito.findFirst.mockResolvedValue({ id: 'remito-1', numero: 'R-1', pedido: { vendedorId: 'other-vendedor' } })
    await request(server).get('/api/ale-bet/pedidos/pedido-1/remito.pdf').set(auth(token('vendedor'))).expect(403)
    expect(db.remito.findFirst).toHaveBeenCalledOnce()
  })
})
