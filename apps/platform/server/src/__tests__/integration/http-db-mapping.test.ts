import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { platformDb as prisma, Role, Mercado } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createDepositoRoutes } from '../../deposito/routes/index'
import { truncateDb } from '../utils/db-cleaner'

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.PLATFORM_JWT_SECRET || 'test-secret') as JwtPayload
      req.user = decoded
      req.depositoUser = { id: decoded.sub, email: decoded.email ?? '', name: decoded.name ?? '', role: decoded.apps?.deposito?.rol ?? 'encargado' }
    } catch { /* invalid token remains unauthenticated */ }
  }
  next()
})
app.use('/api/deposito', createDepositoRoutes())

function token(id: string): string {
  return jwt.sign({ sub: id, email: 'ordenes-integration@test.local', name: 'Integration', apps: { deposito: { rol: 'encargado', activo: true } } }, process.env.PLATFORM_JWT_SECRET || 'test-secret')
}

describe('POST /api/deposito/ordenes/:id/aprobar — PostgreSQL integration', () => {
  let actorId: string
  let auth: string

  beforeEach(async () => {
    await truncateDb(prisma)
    const actor = await prisma.user.create({ data: { email: `approver-${crypto.randomUUID()}@test.local`, name: 'Approver', passwordHash: 'hash', role: Role.ADMIN } })
    actorId = actor.id
    auth = `Bearer ${token(actorId)}`
  })

  afterAll(async () => { await prisma.$disconnect() })

  async function product(categoria: 'droga' | 'frasco' | 'estuche' | 'etiqueta', name: string) {
    const mercados = categoria === 'estuche' ? [Mercado.argentina] : categoria === 'etiqueta' ? [Mercado.argentina, Mercado.colombia] : []
    return prisma.depositoProducto.create({ data: { nombreBase: name, nombreCompleto: name, categoria, codigo: `IT-${crypto.randomUUID()}`, mercadosHabilitados: mercados, ...(categoria === 'estuche' ? { mercado: Mercado.argentina } : {}) } })
  }

  async function order(producto: { id: string, nombreCompleto: string }, categoria: 'droga' | 'frasco' | 'estuche' | 'etiqueta', cantidad: number, mercado?: Mercado) {
    return prisma.ordenProduccion.create({ data: { solicitanteId: actorId, productoId: producto.id, productoNombre: producto.nombreCompleto, categoria, cantidad, mercado, estado: 'solicitada' } })
  }

  async function approve(id: string) {
    return request(app).post(`/api/deposito/ordenes/${id}/aprobar`).set('Authorization', auth)
  }

  it('descuenta droga FIFO real y persiste movimientos por lote y estado', async () => {
    const p = await product('droga', 'Drug FIFO')
    const late = new Date('2027-12-01T00:00:00Z')
    const early = new Date('2027-01-01T00:00:00Z')
    const laterLot = await prisma.inventarioDroga.create({ data: { productoId: p.id, nombre: p.nombreCompleto, lote: 'LATE', vencimiento: late, cantidad: 8 } })
    const firstLot = await prisma.inventarioDroga.create({ data: { productoId: p.id, nombre: p.nombreCompleto, lote: 'EARLY', vencimiento: early, cantidad: 6 } })
    const o = await order(p, 'droga', 10)

    const res = await approve(o.id)

    expect(res.status).toBe(200)
    expect((await prisma.inventarioDroga.findUniqueOrThrow({ where: { id: firstLot.id } })).cantidad).toBe(0)
    expect((await prisma.inventarioDroga.findUniqueOrThrow({ where: { id: laterLot.id } })).cantidad).toBe(4)
    expect(await prisma.movimiento.findMany({ where: { referenciaId: o.id }, orderBy: { lote: 'asc' } })).toMatchObject([
      { lote: 'EARLY', cantidad: -6 }, { lote: 'LATE', cantidad: -4 },
    ])
    expect((await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: o.id } })).estado).toBe('aprobada')
  })

  it('revierte stock, movimientos y orden al fallar dentro de la transacción', async () => {
    const p = await product('droga', 'Rollback drug')
    const lot = await prisma.inventarioDroga.create({ data: { productoId: p.id, nombre: p.nombreCompleto, lote: 'ROLLBACK', cantidad: 20 } })
    const o = await order(p, 'droga', 7)
    const suffix = crypto.randomUUID().replaceAll('-', '')
    const fn = `test_fail_movement_${suffix}`
    const trigger = `test_fail_movement_${suffix}`
    await prisma.$executeRawUnsafe(`CREATE FUNCTION deposito.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced integration rollback'; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON deposito.movimientos FOR EACH ROW EXECUTE FUNCTION deposito.${fn}()`)
    try {
      expect((await approve(o.id)).status).toBe(500)
      expect((await prisma.inventarioDroga.findUniqueOrThrow({ where: { id: lot.id } })).cantidad).toBe(20)
      expect(await prisma.movimiento.count({ where: { referenciaId: o.id } })).toBe(0)
      expect((await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: o.id } })).estado).toBe('solicitada')
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON deposito.movimientos`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS deposito.${fn}()`)
    }
  })

  it('mapea una violación de constraint real de PostgreSQL a conflicto HTTP 409', async () => {
    const p = await product('droga', 'Constraint mapping drug')
    await prisma.inventarioDroga.create({ data: { productoId: p.id, nombre: p.nombreCompleto, lote: 'CONSTRAINT', cantidad: 20 } })
    const o = await order(p, 'droga', 2)
    const suffix = crypto.randomUUID().replaceAll('-', '')
    const fn = `test_constraint_${suffix}`
    const trigger = `test_constraint_${suffix}`
    await prisma.$executeRawUnsafe(`CREATE FUNCTION deposito.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE deposito.inventario_drogas SET cantidad = -1 WHERE producto_id = '${p.id}'; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON deposito.movimientos FOR EACH ROW EXECUTE FUNCTION deposito.${fn}()`)
    try {
      const res = await approve(o.id)
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVENTORY_CONSTRAINT_VIOLATION')
      expect(await prisma.inventarioDroga.count({ where: { productoId: p.id, cantidad: 20 } })).toBe(1)
      expect(await prisma.movimiento.count({ where: { referenciaId: o.id } })).toBe(0)
      expect((await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: o.id } })).estado).toBe('solicitada')
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON deposito.movimientos`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS deposito.${fn}()`)
    }
  })

  it('serializa aprobaciones simultáneas: una transición y un único descuento', async () => {
    const p = await product('droga', 'Concurrent drug')
    const lot = await prisma.inventarioDroga.create({ data: { productoId: p.id, nombre: p.nombreCompleto, lote: 'ONLY', cantidad: 20 } })
    const o = await order(p, 'droga', 8)
    const [a, b] = await Promise.all([approve(o.id), approve(o.id)])

    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect((await prisma.inventarioDroga.findUniqueOrThrow({ where: { id: lot.id } })).cantidad).toBe(12)
    expect(await prisma.movimiento.count({ where: { referenciaId: o.id } })).toBe(1)
    expect((await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: o.id } })).estado).toBe('aprobada')
  })

  it('stock insuficiente conserva stock, movimientos y estado solicitado', async () => {
    const p = await product('droga', 'Insufficient drug')
    const lot = await prisma.inventarioDroga.create({ data: { productoId: p.id, nombre: p.nombreCompleto, lote: 'LOW', cantidad: 3 } })
    const o = await order(p, 'droga', 4)
    expect((await approve(o.id)).status).toBe(409)
    expect((await prisma.inventarioDroga.findUniqueOrThrow({ where: { id: lot.id } })).cantidad).toBe(3)
    expect(await prisma.movimiento.count({ where: { referenciaId: o.id } })).toBe(0)
    expect((await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: o.id } })).estado).toBe('solicitada')
  })

  it('frasco descuenta unidades y deriva cajas completas restantes', async () => {
    const p = await product('frasco', 'Bottle 24')
    const stock = await prisma.inventarioFrasco.create({ data: { productoId: p.id, articulo: p.nombreCompleto, unidadesPorCaja: 24, total: 2400, cantidadCajas: 100 } })
    const o = await order(p, 'frasco', 2000)
    const response = await approve(o.id)
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(await prisma.inventarioFrasco.findUniqueOrThrow({ where: { id: stock.id } })).toMatchObject({ total: 400, cantidadCajas: 16 })
    expect(await prisma.movimiento.count({ where: { referenciaId: o.id, cantidad: -2000 } })).toBe(1)
  })

  it.each([
    ['estuche', 'inventarioEstuche', Mercado.argentina, Mercado.colombia],
    ['etiqueta', 'inventarioEtiqueta', Mercado.argentina, Mercado.colombia],
  ] as const)('%s descuenta únicamente el mercado solicitado', async (categoria, table, market, otherMarket) => {
    const p = await product(categoria, `Packaging ${categoria}`)
    const createInventory = table === 'inventarioEstuche' ? prisma.inventarioEstuche.create.bind(prisma.inventarioEstuche) : prisma.inventarioEtiqueta.create.bind(prisma.inventarioEtiqueta)
    const arg = await createInventory({ data: { productoId: p.id, articulo: p.nombreCompleto, mercado: market, cantidad: 30 } })
    const other = await createInventory({ data: { productoId: p.id, articulo: p.nombreCompleto, mercado: otherMarket, cantidad: 50 } })
    const o = await order(p, categoria, 12, market)
    expect((await approve(o.id)).status).toBe(200)
    expect((await (table === 'inventarioEstuche' ? prisma.inventarioEstuche : prisma.inventarioEtiqueta).findUniqueOrThrow({ where: { id: arg.id } })).cantidad).toBe(18)
    expect((await (table === 'inventarioEstuche' ? prisma.inventarioEstuche : prisma.inventarioEtiqueta).findUniqueOrThrow({ where: { id: other.id } })).cantidad).toBe(50)
    expect(await prisma.movimiento.count({ where: { referenciaId: o.id, cantidad: -12 } })).toBe(1)
  })

  it('mantiene /ejecutar como único endpoint 410', async () => {
    const res = await request(app).post('/api/deposito/ordenes/not-a-real-id/ejecutar').set('Authorization', auth)
    expect(res.status).toBe(410)
  })
})
