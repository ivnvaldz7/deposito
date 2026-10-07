import crypto from 'crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createAleBetRoutes } from '../../routes/ale-bet/index'
import { truncateDb } from '../utils/db-cleaner'
import { buildCurrentStockProjectionSnapshot } from '../../routes/ale-bet/stock-projection/snapshot-repository'

declare module 'express-serve-static-core' {
  interface Request { user?: JwtPayload }
}

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) req.user = jwt.verify(token, process.env.PLATFORM_JWT_SECRET ?? 'test-secret') as JwtPayload
  next()
})
app.use('/api/ale-bet', createAleBetRoutes())

const auth = (role: 'admin' | 'vendedor' | 'armador' | 'facturacion') => `Bearer ${jwt.sign({ sub: 'slice2-test', email: 'slice2@test.local', apps: { 'ale-bet': { rol: role, activo: true } } }, process.env.PLATFORM_JWT_SECRET ?? 'test-secret')}`

describe('SDD-01 Slice 2 — Stock Projection Outbox', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => { await truncateDb(prisma) })
  afterAll(async () => { await prisma.$disconnect() })

  async function fixture() {
    const id = crypto.randomUUID()
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const acondicionado = await prisma.ubicacionStock.create({ data: { codigo: 'ACONDICIONADO', nombre: 'Acondicionado' } })
    const producto = await prisma.producto.create({ data: { nombre: `Producto ${id}`, sku: `SKU-${id}`, unidadesPorCaja: 1 } })
    const lote = await prisma.lote.create({ data: { productoId: producto.id, numero: `L-${id.slice(0, 6)}`, cajas: 0, sueltos: 0 } })
    return { deposito, acondicionado, producto, lote }
  }

  describe('Manual stock adjustment', () => {
    it('creates PENDING outbox when stock changes (100 → 120)', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 100 } })

      const response = await request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${data.lote.id}/ajuste`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ubicacionId: data.deposito.id, cantidadFinal: 120 })

      expect(response.status).toBe(200)
      expect(response.body.delta).toBe(20)
      expect(response.body.nuevo).toBe(120)

      const saldo = await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id } } })
      expect(saldo?.cantidad).toBe(120)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(1)
      expect(outbox[0]).toMatchObject({ causeType: 'MANUAL_ADJUST', estado: 'PENDING' })
    })

    it('does NOT create outbox when adjustment has no change (100 → 100)', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 100 } })

      const response = await request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${data.lote.id}/ajuste`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ubicacionId: data.deposito.id, cantidadFinal: 100 })

      expect(response.status).toBe(200)
      expect(response.body.delta).toBe(0)
      expect(response.body.movimientoId).toBeNull()

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(0)
    })
  })

  describe('Stock opening (saldo de apertura)', () => {
    it('keeps the retired opening endpoint closed', async () => {
      const data = await fixture()

      const response = await request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${data.lote.id}/apertura`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ubicacionId: data.deposito.id, cantidadFinal: 2400, motivo: 'Apertura inicial', fechaEfectiva: '2026-01-01' })

      expect(response.status).toBe(410)
      expect(await prisma.stockProjectionOutbox.count({ where: { productId: data.producto.id } })).toBe(0)
    })
  })

  describe('Internal transfer', () => {
    it('creates PENDING outbox when transferring ACONDICIONADO → DEPOSITO', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 0 } })

      const response = await request(app)
        .post(`/api/ale-bet/stock/transferencias`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ productoId: data.producto.id, loteId: data.lote.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 40 })

      expect(response.status).toBe(201)

      const acondicionado = await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.acondicionado.id } } })
      const deposito = await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id } } })
      expect(acondicionado?.cantidad).toBe(60)
      expect(deposito?.cantidad).toBe(40)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(1)
      expect(outbox[0]).toMatchObject({ causeType: 'TRANSFER', estado: 'PENDING' })
    })

    it('rolls back and creates NO outbox when transfer fails (insufficient stock)', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.acondicionado.id, cantidad: 10 } })

      const response = await request(app)
        .post(`/api/ale-bet/stock/transferencias`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ productoId: data.producto.id, loteId: data.lote.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 50 })

      expect(response.status).toBe(409)

      const acondicionado = await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.acondicionado.id } } })
      expect(acondicionado?.cantidad).toBe(10)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(0)
    })
  })

  describe('Remitos (regression)', () => {
    it('does NOT create outbox when emitting/anulando remito', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 100 } })

      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente Test', direccion: 'Dir Test' } })
      await prisma.configuracionRemito.create({ data: { id: 'DEFAULT', puntoVenta: '00001', proximoCorrelativo: 1, cai: '52166218186464', caiVencimiento: new Date('2027-04-17T00:00:00.000Z') } })
      const pedido = await prisma.pedido.create({ data: { numero: `TEST-${crypto.randomUUID().slice(0, 8)}`, clienteId: cliente.id, estado: 'APROBADO', items: { create: { productoId: data.producto.id, cantidad: 10 } } } })

      const emit = await request(app)
        .post(`/api/ale-bet/pedidos/${pedido.id}/remitos`)
        .set('Authorization', auth('facturacion'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ expectedVersion: 1, transporteOcasional: { nombre: 'Transporte Test', direccion: 'Dir Test 123' } })

      expect(emit.status).toBe(201)

      const remito = await prisma.remito.findFirst({ where: { pedidoId: pedido.id } })
      expect(remito).toBeTruthy()

      const anular = await request(app)
        .put(`/api/ale-bet/pedidos/${pedido.id}/remitos/${remito!.id}/anular`)
        .set('Authorization', auth('admin'))
        .send({ motivo: 'Test anulación' })

      expect(anular.status).toBe(200)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(0)
    })
  })

  describe('Snapshot integration', () => {
    it('reflects adjusted stock in snapshot', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 100 } })

      const response = await request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${data.lote.id}/ajuste`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ubicacionId: data.deposito.id, cantidadFinal: 150 })

      expect(response.status).toBe(200)

      const snapshot = await buildCurrentStockProjectionSnapshot(prisma)
      expect(snapshot.productoTerminado).toEqual([expect.objectContaining({ producto: data.producto.nombre, lote: data.lote.numero, total: 150, vencimiento: 'SIN VTO' })])
    })

    it('reflects transferred stock in snapshot', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.acondicionado.id, cantidad: 200 } })
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 0 } })

      const response = await request(app)
        .post(`/api/ale-bet/stock/transferencias`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ productoId: data.producto.id, loteId: data.lote.id, origen: 'ACONDICIONADO', destino: 'DEPOSITO', cantidad: 80 })

      expect(response.status).toBe(201)

      const snapshot = await buildCurrentStockProjectionSnapshot(prisma)
      expect(snapshot.productoTerminado).toEqual([expect.objectContaining({ producto: data.producto.nombre, lote: data.lote.numero, total: 80, vencimiento: 'SIN VTO' })])
      expect(snapshot.sinAcondicionar).toEqual([expect.objectContaining({ producto: data.producto.nombre, lote: data.lote.numero, total: 120, vencimiento: 'SIN VTO' })])
    })
  })

  describe('Idempotency and transactional risk cases (Review/Verify)', () => {
    it('distinct operations on the same product produce distinct logical events', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 100 } })

      const adjust = await request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${data.lote.id}/ajuste`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ubicacionId: data.deposito.id, cantidadFinal: 120 })
      expect(adjust.status).toBe(200)

      const transfer = await request(app)
        .post(`/api/ale-bet/stock/transferencias`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ productoId: data.producto.id, loteId: data.lote.id, origen: 'DEPOSITO', destino: 'ACONDICIONADO', cantidad: 20 })
      expect(transfer.status).toBe(201)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id }, orderBy: { causeType: 'asc' } })
      expect(outbox.map((event) => event.causeType).sort()).toEqual(['MANUAL_ADJUST', 'TRANSFER'])
      expect(new Set(outbox.map((event) => event.causeId)).size).toBe(2)
    })

    it('retrying the same adjustment with the same key does not duplicate the logical event', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 100 } })
      const key = crypto.randomUUID()
      const payload = { ubicacionId: data.deposito.id, cantidadFinal: 120 }

      const first = await request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${data.lote.id}/ajuste`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', key)
        .send(payload)
      expect(first.status).toBe(200)

      const retry = await request(app)
        .patch(`/api/ale-bet/productos/${data.producto.id}/stock/lotes/${data.lote.id}/ajuste`)
        .set('Authorization', auth('admin'))
        .set('Idempotency-Key', key)
        .send(payload)
      expect(retry.status).toBe(200)
      expect(retry.body.movimientoId).toBe(first.body.movimientoId)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(1)
    })

    it('consumeActiveReservations default generates CONSUMO_PEDIDO outbox', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 50 } })
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente Consume', direccion: 'Dir Consume' } })
      const pedido = await prisma.pedido.create({
        data: {
          numero: `CONS-${crypto.randomUUID().slice(0, 8)}`,
          clienteId: cliente.id,
          estado: 'PREPARADO',
          items: { create: { productoId: data.producto.id, cantidad: 30 } },
        },
        include: { items: true },
      })
      await prisma.reservaStock.create({
        data: {
          cantidad: 30,
          pedidoId: pedido.id,
          itemPedidoId: pedido.items[0]!.id,
          loteId: data.lote.id,
          ubicacionId: data.deposito.id,
          estado: 'ACTIVA',
        },
      })

      const { consumeActiveReservations } = await import('../../routes/ale-bet/reservas-service')
      await prisma.$transaction((tx) => consumeActiveReservations(tx, pedido.id, 'slice2-reviewer'))

      const saldo = await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id } } })
      expect(saldo?.cantidad).toBe(20)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(1)
      expect(outbox[0]).toMatchObject({ causeType: 'CONSUMO_PEDIDO', causeId: pedido.id, estado: 'PENDING' })
    })

    it('consumeActiveReservations with skipOutbox generates no event (caller owns its own signal)', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 50 } })
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente Skip', direccion: 'Dir Skip' } })
      const pedido = await prisma.pedido.create({
        data: {
          numero: `SKIP-${crypto.randomUUID().slice(0, 8)}`,
          clienteId: cliente.id,
          estado: 'PREPARADO',
          items: { create: { productoId: data.producto.id, cantidad: 30 } },
        },
        include: { items: true },
      })
      await prisma.reservaStock.create({
        data: {
          cantidad: 30,
          pedidoId: pedido.id,
          itemPedidoId: pedido.items[0]!.id,
          loteId: data.lote.id,
          ubicacionId: data.deposito.id,
          estado: 'ACTIVA',
        },
      })

      const { consumeActiveReservations } = await import('../../routes/ale-bet/reservas-service')
      await prisma.$transaction((tx) => consumeActiveReservations(tx, pedido.id, 'slice2-reviewer', { skipOutbox: true }))

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(0)
    })

    it('a failure after a successful in-transaction transfer rolls back stock and outbox together', async () => {
      const data = await fixture()
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.acondicionado.id, cantidad: 100 } })
      await prisma.saldoStock.create({ data: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id, cantidad: 0 } })

      const { transferInternal } = await import('../../routes/ale-bet/inventory-service')
      await expect(prisma.$transaction(async (tx) => {
        await transferInternal(tx, {
          actorId: 'slice2-reviewer',
          productoId: data.producto.id,
          loteId: data.lote.id,
          origen: 'ACONDICIONADO',
          destino: 'DEPOSITO',
          cantidad: 40,
          idempotencyKey: `forced-fail:${crypto.randomUUID()}`,
        })
        throw new Error('forced post-write failure')
      })).rejects.toThrow('forced post-write failure')

      const acondicionado = await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.acondicionado.id } } })
      const deposito = await prisma.saldoStock.findUnique({ where: { productoId_loteId_ubicacionId: { productoId: data.producto.id, loteId: data.lote.id, ubicacionId: data.deposito.id } } })
      expect(acondicionado?.cantidad).toBe(100)
      expect(deposito?.cantidad).toBe(0)

      const movements = await prisma.movimientoStock.count({ where: { productoId: data.producto.id } })
      expect(movements).toBe(0)

      const outbox = await prisma.stockProjectionOutbox.findMany({ where: { productId: data.producto.id } })
      expect(outbox).toHaveLength(0)
    })
  })
})
