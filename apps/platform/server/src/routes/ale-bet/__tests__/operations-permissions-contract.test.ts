import type { Express } from 'express'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const secret = 'test-secret-for-operations-permissions'

const { db, sseManager } = vi.hoisted(() => ({
  db: {
    cliente: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    producto: { findMany: vi.fn() },
    pedido: { count: vi.fn(), findMany: vi.fn() },
    platformUser: { findMany: vi.fn() },
  },
  sseManager: { addClient: vi.fn(), removeClient: vi.fn() },
}))

vi.mock('@platform/core', () => {
  const { hasPermission } = require('@platform/core/permissions')
  return {
    getAppAccess: (user: { apps?: Record<string, unknown> }, app: string) => user.apps?.[app],
    hasPermission,
    verifyAccessToken: (value: string) => {
      try {
        return jwt.verify(value, process.env.PLATFORM_JWT_SECRET ?? secret)
      } catch {
        return null
      }
    },
  }
})

vi.mock('@platform/db', () => ({ platformDb: db }))
vi.mock('../sse-manager', () => ({ sseManager }))

type Role = 'admin' | 'vendedor' | 'armador' | 'encargado' | 'facturacion' | 'observador'

const roles: readonly Role[] = ['admin', 'vendedor', 'armador', 'encargado', 'facturacion', 'observador']

function token(role?: string, active = true, subject = `${role ?? 'none'}-1`): string {
  const apps = role === undefined ? {} : { 'ale-bet': { rol: role, activo: active } }
  return jwt.sign({ sub: subject, apps }, secret, { expiresIn: '15m' })
}

function auth(value: string): Record<string, string> {
  return { Authorization: `Bearer ${value}` }
}

async function app(): Promise<Express> {
  const express = await import('express')
  const clientes = (await import('../clientes')).default
  const dashboard = (await import('../dashboard')).default
  const historial = (await import('../historial')).default
  const notificaciones = (await import('../notificaciones')).default
  const server = express.default()
  server.use(express.json())
  server.use('/api/ale-bet/clientes', clientes)
  server.use('/api/ale-bet/dashboard', dashboard)
  server.use('/api/ale-bet/historial', historial)
  server.use('/api/ale-bet/notificaciones', notificaciones)
  return server
}

describe('Ale-Bet operations HTTP permission contract', () => {
  beforeEach(() => {
    process.env.PLATFORM_JWT_SECRET = secret
    vi.clearAllMocks()
    db.cliente.findMany.mockResolvedValue([])
    db.cliente.create.mockResolvedValue({ id: 'cliente-1' })
    db.cliente.update.mockResolvedValue({ id: 'cliente-1' })
    db.cliente.createMany.mockResolvedValue({ count: 1 })
    db.producto.findMany.mockResolvedValue([])
    db.pedido.count.mockResolvedValue(0)
    db.pedido.findMany.mockResolvedValue([])
    db.platformUser.findMany.mockResolvedValue([])
  })

  it('binds each migrated route to its exact shared permission without a legacy role gate', () => {
    const root = join(__dirname, '..')
    const bindings = [
      ['clientes.ts', "router.get('/', requirePermission('ale-bet', 'clientes.read')"],
      ['clientes.ts', "router.post('/', requirePermission('ale-bet', 'clientes.create')"],
      ['clientes.ts', "router.put('/:id', requirePermission('ale-bet', 'clientes.update')"],
      ['clientes.ts', "router.post('/import', requirePermission('ale-bet', 'clientes.import')"],
      ['dashboard.ts', "router.get('/', requirePermission('ale-bet', 'dashboard.read')"],
      ['historial.ts', "router.get('/', requirePermission('ale-bet', 'historial.read')"],
      ['historial.ts', "router.get('/export', requirePermission('ale-bet', 'historial.export')"],
      ['notificaciones.ts', "requirePermission('ale-bet', 'notificaciones.stream')"],
    ] as const

    for (const [file, binding] of bindings) {
      const source = readFileSync(join(root, file), 'utf8')
      expect(source).toContain(binding)
      expect(source).not.toContain('requireApp(')
      expect(source).not.toContain('requireRole(')
    }
  })

  it('enforces the Clientes matrix and never mutates denied requests', async () => {
    const server = await app()
    const payload = { nombre: 'Cliente prueba', contacto: 'Contacto válido' }

    for (const role of roles) {
      await request(server).get('/api/ale-bet/clientes').set(auth(token(role))).expect(200)
      await request(server).post('/api/ale-bet/clientes').set(auth(token(role))).send(payload)
        .expect(['admin', 'vendedor', 'facturacion'].includes(role) ? 201 : 403)
      await request(server).put('/api/ale-bet/clientes/cliente-1').set(auth(token(role))).send({ nombre: 'Cliente editado' })
        .expect(['admin', 'facturacion'].includes(role) ? 200 : 403)
      await request(server).post('/api/ale-bet/clientes/import').set(auth(token(role))).send({ clientes: [payload] })
        .expect(['admin', 'facturacion'].includes(role) ? 201 : 403)
    }

    expect(db.cliente.create).toHaveBeenCalledTimes(3)
    expect(db.cliente.update).toHaveBeenCalledTimes(2)
    expect(db.cliente.createMany).toHaveBeenCalledTimes(2)
  }, 15_000)

  it('denies inactive, missing, unknown, and Platform Admin-only access before Clientes reaches the database', async () => {
    const server = await app()
    const denied = [
      token('vendedor', false),
      token(),
      token('rol-desconocido'),
      jwt.sign({ sub: 'platform-admin', isPlatformAdmin: true, apps: {} }, secret, { expiresIn: '15m' }),
    ]

    for (const value of denied) {
      await request(server).get('/api/ale-bet/clientes').set(auth(value)).expect(403)
    }

    expect(db.cliente.findMany).not.toHaveBeenCalled()
  })

  it('allows dashboard only to roles with dashboard.read', async () => {
    const server = await app()
    for (const role of roles) {
      await request(server).get('/api/ale-bet/dashboard').set(auth(token(role))).expect(200)
    }
    await request(server).get('/api/ale-bet/dashboard').set(auth(token('rol-desconocido'))).expect(403)
  })

  it('separates historial read/export permissions while preserving vendedor scope', async () => {
    const server = await app()
    for (const role of roles) {
      await request(server).get('/api/ale-bet/historial').set(auth(token(role))).expect(200)
    }

    await request(server).get('/api/ale-bet/historial/export').set(auth(token('vendedor', true, 'vendedor-1'))).expect(200)
    expect(db.pedido.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { vendedorId: 'vendedor-1' },
    }))
  })

  it('authorizes the SSE stream only for notificaciones.stream and retains the SSE handshake', async () => {
    const server = await app()
    sseManager.addClient.mockImplementation((_userId: string, _role: string, response: { end: () => void }) => {
      setImmediate(() => response.end())
    })
    for (const role of ['admin', 'vendedor', 'armador', 'encargado'] as const) {
      const response = await request(server).get('/api/ale-bet/notificaciones/stream').set(auth(token(role)))
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe('text/event-stream')
    }

    for (const role of ['facturacion', 'observador'] as const) {
      await request(server).get('/api/ale-bet/notificaciones/stream').set(auth(token(role))).expect(403)
    }
    await request(server).get('/api/ale-bet/notificaciones/stream').set(auth(token('vendedor', false))).expect(403)
    expect(sseManager.addClient).toHaveBeenCalledTimes(4)
  })
})
