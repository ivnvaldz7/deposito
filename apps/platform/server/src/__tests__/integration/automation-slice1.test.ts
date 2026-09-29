import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Prisma, platformDb as prisma } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { createAleBetRoutes } from '../../routes/ale-bet'
import { truncateDb } from '../utils/db-cleaner'
import type { ParsedOrder } from '../../routes/ale-bet/automation/contracts'

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) req.user = jwt.verify(token, process.env.PLATFORM_JWT_SECRET ?? 'test-secret') as JwtPayload
  next()
})
app.use('/api/ale-bet', createAleBetRoutes())

function adminToken(): string {
  return jwt.sign({ sub: 'automation-admin', email: 'automation-admin@test.local', apps: { 'ale-bet': { rol: 'admin', activo: true } } }, process.env.PLATFORM_JWT_SECRET ?? 'test-secret')
}

function token(role: 'armador' | 'facturacion', subject = role): string {
  return jwt.sign({ sub: subject, apps: { 'ale-bet': { rol: role, activo: true } } }, process.env.PLATFORM_JWT_SECRET ?? 'test-secret')
}

describe('AUTOMATION-01 Slice 1', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => { await truncateDb(prisma) })

  async function seed(quantity = 120) {
    const suffix = crypto.randomUUID()
    const customer = await prisma.cliente.create({ data: { nombre: `Veterinaria ${suffix}`, cuit: '30-12345678-9', condicionIva: 'RI', direccion: 'Ruta 2 km 50' } })
    const product = await prisma.producto.create({ data: { nombre: 'Olivitasan 500 ML', sku: `OLIVITASAN-500-${suffix}`, unidadesPorCaja: 20 } })
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const expired = await prisma.lote.create({ data: { numero: `EXP-${suffix}`, productoId: product.id, cajas: 5, sueltos: 0, fechaVencimiento: new Date(Date.now() - 86_400_000) } })
    const valid = await prisma.lote.create({ data: { numero: `VALID-${suffix}`, productoId: product.id, cajas: Math.floor(quantity / 20), sueltos: quantity % 20, fechaVencimiento: new Date(Date.now() + 86_400_000) } })
    await prisma.saldoStock.createMany({ data: [
      { productoId: product.id, loteId: expired.id, ubicacionId: deposito.id, cantidad: 100 },
      { productoId: product.id, loteId: valid.id, ubicacionId: deposito.id, cantidad: quantity },
    ] })
    return { customer, product, valid, expired }
  }

  async function seedCetri(quantity = 120) {
    const suffix = crypto.randomUUID()
    const customer = await prisma.cliente.create({ data: { nombre: `Veterinaria CETRI ${suffix}`, cuit: '30-12345678-9', condicionIva: 'RI', direccion: 'Ruta 2 km 50' } })
    const product = await prisma.producto.create({ data: { nombre: 'CETRI-AMON 1 L', sku: `CETRI-1L-${suffix}`, unidadesPorCaja: 12 } })
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const lote = await prisma.lote.create({ data: { numero: `CETRI-${suffix}`, productoId: product.id, cajas: quantity / 12, sueltos: quantity % 12, fechaVencimiento: new Date(Date.now() + 86_400_000) } })
    await prisma.saldoStock.create({ data: { productoId: product.id, loteId: lote.id, ubicacionId: deposito.id, cantidad: quantity } })
    return { customer, product, lote, deposito }
  }

  async function confirmAutomationUnits(input: { auth: string; customerId: string; productId: string; productName: string; units: number }) {
    const draft = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', input.auth)
      .send({ originalText: `${input.units} ${input.productName}` }).expect(201)
    const customer = await request(app).put(`/api/ale-bet/automation/drafts/${draft.body.id}`).set('Authorization', input.auth)
      .send({ expectedVersion: draft.body.version, clienteId: input.customerId }).expect(200)
    const lineId = draft.body.proposedSnapshot.lines[0].lineId as string
    const edited = await request(app).put(`/api/ale-bet/automation/drafts/${draft.body.id}`).set('Authorization', input.auth)
      .send({ expectedVersion: customer.body.version, line: { lineId, productId: input.productId, unidades: input.units } }).expect(200)
    return request(app).post(`/api/ale-bet/automation/drafts/${draft.body.id}/confirm`).set('Authorization', input.auth)
      .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: edited.body.version }).expect(200)
  }

  function json(value: ParsedOrder): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }

  async function createPartialDraft() {
    const suffix = crypto.randomUUID()
    const customer = await prisma.cliente.create({ data: { nombre: `EL FEDERAL ${suffix}`, cuit: '30-12345678-9', condicionIva: 'RI', direccion: 'Ruta 2 km 50' } })
    const [productA, productB, productC] = await Promise.all([
      prisma.producto.create({ data: { nombre: `Producto A ${suffix}`, sku: `PARTIAL-A-${suffix}`, unidadesPorCaja: 10 } }),
      prisma.producto.create({ data: { nombre: `Producto B ${suffix}`, sku: `PARTIAL-B-${suffix}`, unidadesPorCaja: 10 } }),
      prisma.producto.create({ data: { nombre: `Producto C ${suffix}`, sku: `PARTIAL-C-${suffix}`, unidadesPorCaja: 10 } }),
    ])
    const snapshot: ParsedOrder = {
      originalText: 'FEDERAL 3\n5 producto A\n6 producto B\n7 producto C',
      customerCandidate: null,
      customerCandidateText: 'FEDERAL 3',
      customerAlternatives: [{ customerId: customer.id, nombre: customer.nombre, confidence: 0.7 }],
      customerConfidence: 0.7,
      warnings: ['CUSTOMER_UNRESOLVED'],
      requiresReview: true,
      lines: [
        { lineId: 'line-a', originalText: '5 producto A', productCandidate: null, alternatives: [{ productId: productA.id, nombre: productA.nombre, confidence: 0.7 }], confidence: 0.7, quantity: { originalExpression: '5 producto A', mode: 'UNITS', explicitBoxes: null, explicitUnits: 5, totalUnits: null, normalizedBoxes: null, normalizedLooseUnits: null }, requiresReview: true, warnings: ['PRODUCT_UNRESOLVED'] },
        { lineId: 'line-b', originalText: '6 producto B', productCandidate: null, alternatives: [{ productId: productB.id, nombre: productB.nombre, confidence: 0.7 }], confidence: 0.7, quantity: { originalExpression: '6 producto B', mode: 'UNITS', explicitBoxes: null, explicitUnits: 6, totalUnits: null, normalizedBoxes: null, normalizedLooseUnits: null }, requiresReview: true, warnings: ['PRODUCT_UNRESOLVED'] },
        { lineId: 'line-c', originalText: '7 producto C', productCandidate: { productId: productC.id, nombre: productC.nombre, confidence: 1 }, alternatives: [], confidence: 1, quantity: { originalExpression: '7 producto C', mode: 'UNITS', explicitBoxes: null, explicitUnits: 7, totalUnits: 7, normalizedBoxes: 0, normalizedLooseUnits: 7 }, requiresReview: false, warnings: [] },
      ],
    }
    const draft = await prisma.orderInterpretationDraft.create({ data: { originalText: snapshot.originalText, proposedSnapshot: json(snapshot), estado: 'DRAFT', createdBy: 'automation-admin' } })
    return { auth: `Bearer ${adminToken()}`, customer, productA, productB, productC, draft }
  }

  async function createDiscardableDraft(unresolvedCount = 1, duplicateLineWarningsAtOrderLevel = false) {
    const fixture = await seed(120)
    const unresolved = Array.from({ length: unresolvedCount }, (_, index) => ({
      lineId: `line-unresolved-${index + 1}`,
      originalText: index === 0 ? 'Y sin cargo' : `Desconocido ${index + 1}`,
      productCandidate: null,
      alternatives: [],
      confidence: 0,
      quantity: { originalExpression: index === 0 ? 'Y sin cargo' : `Desconocido ${index + 1}`, mode: 'AMBIGUOUS' as const, explicitBoxes: null, explicitUnits: null, totalUnits: null, normalizedBoxes: null, normalizedLooseUnits: null },
      requiresReview: true,
      warnings: ['PRODUCT_UNRESOLVED', 'QUANTITY_AMBIGUOUS'],
    }))
    const snapshot: ParsedOrder = {
      originalText: 'Pedido de prueba',
      customerCandidate: { customerId: fixture.customer.id, nombre: fixture.customer.nombre, confidence: 1 },
      customerAlternatives: [],
      customerConfidence: 1,
      warnings: duplicateLineWarningsAtOrderLevel ? ['PRODUCT_UNRESOLVED', 'QUANTITY_AMBIGUOUS'] : [],
      requiresReview: true,
      lines: [
        { lineId: 'line-valid-a', originalText: '4 Olivitasan', productCandidate: { productId: fixture.product.id, nombre: fixture.product.nombre, confidence: 1 }, alternatives: [], confidence: 1, quantity: { originalExpression: '4 Olivitasan', mode: 'UNITS', explicitBoxes: null, explicitUnits: 4, totalUnits: 4, normalizedBoxes: 0, normalizedLooseUnits: 4 }, requiresReview: false, warnings: [] },
        { lineId: 'line-valid-b', originalText: '8 Olivitasan', productCandidate: { productId: fixture.product.id, nombre: fixture.product.nombre, confidence: 1 }, alternatives: [], confidence: 1, quantity: { originalExpression: '8 Olivitasan', mode: 'UNITS', explicitBoxes: null, explicitUnits: 8, totalUnits: 8, normalizedBoxes: 0, normalizedLooseUnits: 8 }, requiresReview: false, warnings: [] },
        ...unresolved,
      ],
    }
    const draft = await prisma.orderInterpretationDraft.create({ data: { originalText: snapshot.originalText, proposedSnapshot: json(snapshot), estado: 'DRAFT', createdBy: 'automation-admin' } })
    return { ...fixture, auth: `Bearer ${adminToken()}`, draft }
  }

  async function getEffective(id: string, auth: string) {
    const response = await request(app).get(`/api/ale-bet/automation/drafts/${id}`).set('Authorization', auth).expect(200)
    return response.body
  }

  async function seedB12Catalog() {
    const suffix = crypto.randomUUID()
    const customer = await prisma.cliente.create({ data: { nombre: `Cliente B12 ${suffix}`, cuit: '30-12345678-9', condicionIva: 'RI', direccion: 'Ruta 2 km 50' } })
    const product100 = await prisma.producto.create({ data: { nombre: 'COMPLEJO B B12 B15 100 ML', sku: `B12-100-${suffix}`, unidadesPorCaja: 10 } })
    const product250 = await prisma.producto.create({ data: { nombre: 'COMPLEJO B B12 B15 250 ML', sku: `B12-250-${suffix}`, unidadesPorCaja: 10 } })
    return { auth: `Bearer ${adminToken()}`, customer, product100, product250 }
  }

  async function seedPresentationProduct() {
    const suffix = crypto.randomUUID()
    const customer = await prisma.cliente.create({ data: { nombre: `Veterinaria Presentación ${suffix}`, cuit: '30-12345678-9', condicionIva: 'RI', direccion: 'Ruta 2 km 50' } })
    const source = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L', sku: `AMINO-BASE-${suffix}`, unidadesPorCaja: 12 } })
    const aves = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L AVES', sku: `AMINO-AVES-${suffix}`, unidadesPorCaja: 12 } })
    const equino = await prisma.producto.create({ data: { nombre: 'AMINOÁCIDOS 1 L EQUINO', sku: `AMINO-EQUINO-${suffix}`, unidadesPorCaja: 12 } })
    await prisma.productoTransferRule.createMany({ data: [
      { sourceProductId: source.id, targetProductId: aves.id, label: 'Aves', tipo: 'PRESENTATION', orden: 1 },
      { sourceProductId: source.id, targetProductId: equino.id, label: 'Equino', tipo: 'PRESENTATION', orden: 2 },
    ] })
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const lote = await prisma.lote.create({ data: { numero: `AMINO-EQUINO-${suffix}`, productoId: equino.id, cajas: 2, fechaVencimiento: new Date(Date.now() + 86_400_000) } })
    await prisma.saldoStock.create({ data: { productoId: equino.id, loteId: lote.id, ubicacionId: deposito.id, cantidad: 24 } })
    return { auth: `Bearer ${adminToken()}`, customer, source, aves, equino, lote, deposito }
  }

  it('exige elegir la presentación configurada y descuenta el destino seleccionado', async () => {
    const fixture = await seedPresentationProduct()
    const created = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', fixture.auth)
      .send({ originalText: '12 AMINOÁCIDOS 1 L' }).expect(201)
    expect(created.body.estado).toBe('DRAFT')

    const customer = await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: created.body.version, clienteId: fixture.customer.id }).expect(200)
    const reviewed = await getEffective(created.body.id, fixture.auth)
    const line = reviewed.effectiveSnapshot.lines[0]
    expect(line).toMatchObject({ productCandidate: { productId: fixture.source.id }, requiresReview: true, warnings: ['PRESENTATION_REQUIRED'] })
    expect(reviewed.presentationOptions).toEqual([
      expect.objectContaining({ sourceProductId: fixture.source.id, targetProductId: fixture.aves.id, label: 'Aves' }),
      expect.objectContaining({ sourceProductId: fixture.source.id, targetProductId: fixture.equino.id, label: 'Equino' }),
    ])

    await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: customer.body.version, line: { lineId: line.lineId, productId: fixture.source.id, unidades: 12 } })
      .expect(409)

    const selected = await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: customer.body.version, line: { lineId: line.lineId, presentationProductId: fixture.equino.id } })
      .expect(200)
    const ready = await getEffective(created.body.id, fixture.auth)
    expect(selected.body.estado).toBe('READY')
    expect(ready.effectiveSnapshot.lines[0]).toMatchObject({
      productCandidate: { productId: fixture.equino.id },
      requiresReview: false,
      warnings: [],
      quantity: { totalUnits: 12 },
    })
    expect(ready.availability).toEqual([expect.objectContaining({ productId: fixture.equino.id, requestedUnits: 12, status: 'DISPONIBLE' })])

    const confirmed = await request(app).post(`/api/ale-bet/automation/drafts/${created.body.id}/confirm`).set('Authorization', fixture.auth)
      .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: selected.body.version }).expect(200)
    expect(confirmed.body.pedido.items).toEqual([expect.objectContaining({ productoId: fixture.equino.id, cantidad: 12 })])
    expect((await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.equino.id, loteId: fixture.lote.id, ubicacionId: fixture.deposito.id } } })).cantidad).toBe(12)
  })

  it('A: corregir cliente conserva el producto unresolved', async () => {
    const fixture = await createPartialDraft()
    await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, clienteId: fixture.customer.id }).expect(200)
    const current = await getEffective(fixture.draft.id, fixture.auth)
    expect(current.effectiveSnapshot.customerCandidate.customerId).toBe(fixture.customer.id)
    expect(current.effectiveSnapshot.lines[0]).toMatchObject({ lineId: 'line-a', productCandidate: null, requiresReview: true, warnings: ['PRODUCT_UNRESOLVED'] })
  })

  it('B: corregir producto no auto-selecciona la primera alternativa de cliente', async () => {
    const fixture = await createPartialDraft()
    await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, line: { lineId: 'line-a', productId: fixture.productA.id, unidades: 5 } }).expect(200)
    const current = await getEffective(fixture.draft.id, fixture.auth)
    expect(current.effectiveSnapshot.customerCandidate).toBeNull()
    expect(current.effectiveSnapshot.customerAlternatives).toEqual([{ customerId: fixture.customer.id, nombre: fixture.customer.nombre, confidence: 0.7 }])
    expect(current.effectiveSnapshot.warnings).toContain('CUSTOMER_UNRESOLVED')
  })

  it('C: corregir el primer producto conserva el segundo unresolved', async () => {
    const fixture = await createPartialDraft()
    await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, line: { lineId: 'line-a', productId: fixture.productA.id, unidades: 5 } }).expect(200)
    const current = await getEffective(fixture.draft.id, fixture.auth)
    expect(current.effectiveSnapshot.lines[1]).toMatchObject({ lineId: 'line-b', productCandidate: null, requiresReview: true, warnings: ['PRODUCT_UNRESOLVED'] })
  })

  it('D: corregir el segundo producto conserva el primero unresolved', async () => {
    const fixture = await createPartialDraft()
    await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, line: { lineId: 'line-b', productId: fixture.productB.id, unidades: 6 } }).expect(200)
    const current = await getEffective(fixture.draft.id, fixture.auth)
    expect(current.effectiveSnapshot.lines[0]).toMatchObject({ lineId: 'line-a', productCandidate: null, requiresReview: true, warnings: ['PRODUCT_UNRESOLVED'] })
  })

  it('E: corregir un unresolved no modifica la línea ya resuelta', async () => {
    const fixture = await createPartialDraft()
    const before = (await getEffective(fixture.draft.id, fixture.auth)).effectiveSnapshot.lines[2]
    await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, line: { lineId: 'line-a', productId: fixture.productA.id, unidades: 5 } }).expect(200)
    const after = (await getEffective(fixture.draft.id, fixture.auth)).effectiveSnapshot.lines[2]
    expect(after).toEqual(before)
  })

  it('F: editar cantidad conserva cliente y las demás líneas idénticas', async () => {
    const fixture = await createPartialDraft()
    const before = (await getEffective(fixture.draft.id, fixture.auth)).effectiveSnapshot
    await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, line: { lineId: 'line-c', cajas: 1, unidades: 2, mode: 'MIXED' } }).expect(200)
    const after = (await getEffective(fixture.draft.id, fixture.auth)).effectiveSnapshot
    expect(after.customerCandidate).toEqual(before.customerCandidate)
    expect(after.customerCandidateText).toBe(before.customerCandidateText)
    expect(after.customerAlternatives).toEqual(before.customerAlternatives)
    expect(after.lines[0]).toEqual(before.lines[0])
    expect(after.lines[1]).toEqual(before.lines[1])
    expect(after.lines[2].quantity).toMatchObject({ totalUnits: 12, normalizedBoxes: 1, normalizedLooseUnits: 2 })
  })

  it('G: dos PUT consecutivos usan la versión y el snapshot efectivo posterior', async () => {
    const fixture = await createPartialDraft()
    const customerEdit = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, clienteId: fixture.customer.id }).expect(200)
    const lineEdit = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: customerEdit.body.version, line: { lineId: 'line-a', productId: fixture.productA.id, unidades: 5 } }).expect(200)
    const current = await getEffective(fixture.draft.id, fixture.auth)
    expect(lineEdit.body.version).toBe(customerEdit.body.version + 1)
    expect(current.effectiveSnapshot.customerCandidate.customerId).toBe(fixture.customer.id)
    expect(current.effectiveSnapshot.lines[0].productCandidate.productId).toBe(fixture.productA.id)
    expect(current.effectiveSnapshot.lines[1].productCandidate).toBeNull()
  })

  it('H: rememberAlias se limita a la línea corregida', async () => {
    const fixture = await createPartialDraft()
    await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: 1, line: { lineId: 'line-a', productId: fixture.productA.id, unidades: 5, rememberAlias: true } }).expect(200)
    expect(await prisma.productAlias.count({ where: { productId: fixture.productA.id } })).toBe(1)
    expect(await prisma.productAlias.count({ where: { productId: fixture.productB.id } })).toBe(0)
    expect(await prisma.clientAlias.count()).toBe(0)
    const current = await getEffective(fixture.draft.id, fixture.auth)
    expect(current.effectiveSnapshot.lines[1].productCandidate).toBeNull()
  })

  it('permite descartar una línea sin coincidencia, confirma solo las válidas y consume solo su stock', async () => {
    const fixture = await createDiscardableDraft()
    const initial = await getEffective(fixture.draft.id, fixture.auth)
    expect(initial.draft.estado).toBe('DRAFT')
    expect(initial.effectiveSnapshot.requiresReview).toBe(true)

    const discarded = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: initial.draft.version, line: { lineId: 'line-unresolved-1', action: 'DISCARD' } }).expect(200)
    const ready = await getEffective(fixture.draft.id, fixture.auth)
    expect(discarded.body.estado).toBe('READY')
    expect(ready.effectiveSnapshot.requiresReview).toBe(false)
    expect(ready.effectiveSnapshot.lines.find((line: { lineId: string }) => line.lineId === 'line-unresolved-1')).toMatchObject({ lineState: 'DISCARDED', warnings: [] })
    expect(ready.availability).toEqual([expect.objectContaining({ productId: fixture.product.id, requestedUnits: 12 })])

    const confirmed = await request(app).post(`/api/ale-bet/automation/drafts/${fixture.draft.id}/confirm`).set('Authorization', fixture.auth)
      .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: discarded.body.version }).expect(200)
    expect(confirmed.body.pedido.items).toEqual([expect.objectContaining({ productoId: fixture.product.id, cantidad: 12 })])
    expect(await prisma.movimientoStock.count({ where: { pedidoId: confirmed.body.pedido.id, productoId: fixture.product.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)
    expect((await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.valid.id, ubicacionId: (await prisma.ubicacionStock.findFirstOrThrow({ where: { codigo: 'DEPOSITO' } })).id } } })).cantidad).toBe(108)
  })

  it('no deja que warnings históricos de una línea desestimada sigan bloqueando el pedido', async () => {
    const fixture = await createDiscardableDraft(1, true)
    const initial = await getEffective(fixture.draft.id, fixture.auth)
    expect(initial.effectiveSnapshot.warnings).toEqual(['PRODUCT_UNRESOLVED', 'QUANTITY_AMBIGUOUS'])

    const discarded = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: initial.draft.version, line: { lineId: 'line-unresolved-1', action: 'DISCARD' } }).expect(200)
    const ready = await getEffective(fixture.draft.id, fixture.auth)

    expect(discarded.body.estado).toBe('READY')
    expect(ready.effectiveSnapshot.requiresReview).toBe(false)
    // The original parser evidence remains available, but only active lines
    // contribute to operational blockers.
    expect(ready.effectiveSnapshot.warnings).toEqual(['PRODUCT_UNRESOLVED', 'QUANTITY_AMBIGUOUS'])
    await request(app).post(`/api/ale-bet/automation/drafts/${fixture.draft.id}/confirm`).set('Authorization', fixture.auth)
      .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: discarded.body.version }).expect(200)
  })

  it('mantiene bloqueado hasta decidir cada línea y deshacer restaura el bloqueo sin alterar las válidas', async () => {
    const fixture = await createDiscardableDraft(2)
    const before = await getEffective(fixture.draft.id, fixture.auth)
    const first = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: before.draft.version, line: { lineId: 'line-unresolved-1', action: 'DISCARD' } }).expect(200)
    expect(first.body.estado).toBe('DRAFT')
    const second = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: first.body.version, line: { lineId: 'line-unresolved-2', action: 'DISCARD' } }).expect(200)
    expect(second.body.estado).toBe('READY')
    const restored = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: second.body.version, line: { lineId: 'line-unresolved-2', action: 'RESTORE' } }).expect(200)
    const after = await getEffective(fixture.draft.id, fixture.auth)
    expect(restored.body.estado).toBe('DRAFT')
    expect(after.effectiveSnapshot.requiresReview).toBe(true)
    expect(after.effectiveSnapshot.lines.find((line: { lineId: string }) => line.lineId === 'line-unresolved-2')).toMatchObject({ warnings: ['PRODUCT_UNRESOLVED', 'QUANTITY_AMBIGUOUS'], requiresReview: true })
    expect(after.effectiveSnapshot.lines.find((line: { lineId: string }) => line.lineId === 'line-valid-a')).toEqual(before.effectiveSnapshot.lines.find((line: { lineId: string }) => line.lineId === 'line-valid-a'))
  })

  it('no deja confirmar un borrador cuando todas las líneas fueron descartadas', async () => {
    const fixture = await createDiscardableDraft()
    const first = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: fixture.draft.version, line: { lineId: 'line-unresolved-1', action: 'DISCARD' } }).expect(200)
    const second = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: first.body.version, line: { lineId: 'line-valid-a', action: 'DISCARD' } }).expect(200)
    const final = await request(app).put(`/api/ale-bet/automation/drafts/${fixture.draft.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: second.body.version, line: { lineId: 'line-valid-b', action: 'DISCARD' } }).expect(200)
    expect(final.body.estado).toBe('DRAFT')
    await request(app).post(`/api/ale-bet/automation/drafts/${fixture.draft.id}/confirm`).set('Authorization', fixture.auth)
      .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: final.body.version }).expect(409)
    expect(await prisma.pedido.count()).toBe(0)
  })

  it('rechaza guardar un alias con presentación incompatible y acepta la presentación correcta', async () => {
    const fixture = await seedB12Catalog()
    const created = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', fixture.auth)
      .send({ originalText: `Cliente: ${fixture.customer.nombre}\n240 b12b15 250ml` }).expect(201)
    const current = await getEffective(created.body.id, fixture.auth)
    const line = current.effectiveSnapshot.lines[0]
    const rejected = await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: current.draft.version, line: { lineId: line.lineId, productId: fixture.product100.id, unidades: 240, rememberAlias: true } }).expect(409)
    expect(rejected.body.error).toBe(`La presentación 250 ML no coincide con el producto seleccionado: ${fixture.product100.nombre}.`)
    expect(await prisma.productAlias.count({ where: { aliasNormalized: 'B12B15 250 ML' } })).toBe(0)
    const accepted = await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', fixture.auth)
      .send({ expectedVersion: current.draft.version, line: { lineId: line.lineId, productId: fixture.product250.id, unidades: 240, rememberAlias: true } }).expect(200)
    expect(accepted.body.version).toBe(current.draft.version + 1)
    expect(await prisma.productAlias.findUniqueOrThrow({ where: { aliasNormalized: 'B12B15 250 ML' } })).toMatchObject({ alias: 'b12b15 250ml', productId: fixture.product250.id })
  })

  it('ignora un alias histórico inconsistente al interpretar y conserva la presentación correcta', async () => {
    const fixture = await seedB12Catalog()
    await prisma.productAlias.create({ data: { alias: 'b12b15 250ml', aliasNormalized: 'B12B15 250 ML', productId: fixture.product100.id } })
    const created = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', fixture.auth)
      .send({ originalText: '240 b12b15 250ml' }).expect(201)
    expect(created.body.proposedSnapshot.lines[0].productCandidate.productId).toBe(fixture.product250.id)
    expect(created.body.proposedSnapshot.lines[0].productCandidate.productId).not.toBe(fixture.product100.id)
  })

  it('lista y elimina equivalencias sin eliminar los productos ni clientes asociados', async () => {
    const fixture = await seedB12Catalog()
    const productAlias = await prisma.productAlias.create({ data: { alias: 'b12 b15 100ml', aliasNormalized: 'B12 B15 100 ML', productId: fixture.product100.id } })
    const clientAlias = await prisma.clientAlias.create({ data: { alias: 'cliente b12', aliasNormalized: 'CLIENTE B12', clientId: fixture.customer.id } })
    const listed = await request(app).get('/api/ale-bet/automation/aliases').set('Authorization', fixture.auth).expect(200)
    expect(listed.body.productAliases).toContainEqual(expect.objectContaining({ id: productAlias.id, producto: { id: fixture.product100.id, nombre: fixture.product100.nombre } }))
    expect(listed.body.clientAliases).toContainEqual(expect.objectContaining({ id: clientAlias.id, cliente: { id: fixture.customer.id, nombre: fixture.customer.nombre } }))
    await request(app).delete(`/api/ale-bet/automation/product-aliases/${productAlias.id}`).set('Authorization', fixture.auth).expect(204)
    await request(app).delete(`/api/ale-bet/automation/client-aliases/${clientAlias.id}`).set('Authorization', fixture.auth).expect(204)
    await expect(prisma.producto.findUniqueOrThrow({ where: { id: fixture.product100.id } })).resolves.toMatchObject({ id: fixture.product100.id })
    await expect(prisma.cliente.findUniqueOrThrow({ where: { id: fixture.customer.id } })).resolves.toMatchObject({ id: fixture.customer.id })
  })

  it('confirms Automation as one stock-effective operation and remitos stay documentary', async () => {
    const fixture = await seed()
    const auth = `Bearer ${adminToken()}`
    const created = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth)
      .send({ originalText: '8 Olivitasan 500\nagregá 4 más de Olivitasan 500' }).expect(201)
    expect(created.body.originalText).toContain('agregá 4')
    let edited = await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', auth)
      .send({ expectedVersion: 1, clienteId: fixture.customer.id }).expect(200)
    const sourceLines = created.body.proposedSnapshot.lines as Array<{ lineId: string }>
    for (const [index, units] of [8, 4].entries()) {
      edited = await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', auth)
        .send({ expectedVersion: edited.body.version, line: { lineId: sourceLines[index]!.lineId, productId: fixture.product.id, unidades: units } }).expect(200)
    }
    const key = crypto.randomUUID()
    const confirmed = await request(app).post(`/api/ale-bet/automation/drafts/${created.body.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', key)
      .send({ expectedVersion: edited.body.version }).expect(200)
    const replay = await request(app).post(`/api/ale-bet/automation/drafts/${created.body.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', key)
      .send({ expectedVersion: edited.body.version }).expect(200)
    expect(replay.headers['idempotency-replayed']).toBe('true')
    expect(replay.body.pedido.id).toBe(confirmed.body.pedido.id)
    await request(app).post(`/api/ale-bet/automation/drafts/${created.body.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', key)
      .send({ expectedVersion: edited.body.version + 1 }).expect(409)
    const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: confirmed.body.pedido.id }, include: { items: true, reservas: true } })
    expect(pedido).toMatchObject({ estado: 'APROBADO', origen: 'AUTOMATION', vendedorId: null })
    expect(pedido.items).toHaveLength(1)
    expect(pedido.items[0]?.cantidad).toBe(12)
    expect(pedido.reservas).toHaveLength(1)
    expect(pedido.reservas[0]).toMatchObject({ estado: 'CONSUMIDA', cantidad: 12, loteId: fixture.valid.id })
    const balance = await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.valid.id, ubicacionId: pedido.reservas[0]!.ubicacionId } } })
    expect(balance.cantidad).toBe(108)
    expect(await prisma.reservaStock.count({ where: { pedidoId: pedido.id, estado: 'ACTIVA' } })).toBe(0)
    expect(await prisma.movimientoStock.findMany({ where: { pedidoId: pedido.id } })).toEqual([expect.objectContaining({ tipo: 'SALIDA_PEDIDO', cantidad: -12, loteId: fixture.valid.id })])
    expect(await prisma.pedidoAuditoria.count({ where: { pedidoId: pedido.id } })).toBe(2)
    expect(await prisma.stockProjectionOutbox.findMany({ where: { causeId: pedido.id } })).toEqual([expect.objectContaining({ productId: fixture.product.id, estado: 'PENDING' })])
    expect(await prisma.orderInterpretationDraft.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({ estado: 'CONFIRMED', pedidoId: pedido.id, confirmedBy: 'automation-admin' })
    expect((await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.valid.id, ubicacionId: pedido.reservas[0]!.ubicacionId } } })).cantidad).toBe(108)
    expect(await prisma.movimientoStock.count({ where: { pedidoId: pedido.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)

    // Armador never receives or operates Automation orders; a manual APROBADO
    // order still enters the historical queue and can be taken.
    expect((await request(app).get('/api/ale-bet/pedidos').set('Authorization', `Bearer ${token('armador')}`).expect(200)).body).not.toContainEqual(expect.objectContaining({ id: pedido.id }))
    await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token('armador')}`)
      .send({ expectedVersion: pedido.version }).expect(409)
    const manual = await prisma.pedido.create({ data: { numero: `MANUAL-${crypto.randomUUID()}`, clienteId: fixture.customer.id, vendedorId: 'seller-1', estado: 'APROBADO', items: { create: { productoId: fixture.product.id, cantidad: 1 } } } })
    await request(app).put(`/api/ale-bet/pedidos/${manual.id}/tomar`).set('Authorization', `Bearer ${token('armador')}`)
      .send({ expectedVersion: manual.version }).expect(200)

    // Facturación can list, view and manage the document, but none of those
    // operations may create another physical stock movement.
    const billing = `Bearer ${token('facturacion')}`
    const pendingTray = await request(app).get('/api/ale-bet/pedidos?bandeja=FACTURACION').set('Authorization', auth).expect(200)
    expect(pendingTray.body).toContainEqual(expect.objectContaining({ id: pedido.id, origen: 'AUTOMATION' }))
    expect(pendingTray.body).not.toContainEqual(expect.objectContaining({ id: manual.id }))
    expect((await request(app).get('/api/ale-bet/pedidos').set('Authorization', billing).expect(200)).body).toContainEqual(expect.objectContaining({ id: pedido.id, origen: 'AUTOMATION' }))
    const billingDetail = await request(app).get(`/api/ale-bet/pedidos/${pedido.id}`).set('Authorization', billing).expect(200)
    expect(billingDetail.body).toMatchObject({ cliente: { cuit: '30-12345678-9', direccion: 'Ruta 2 km 50' }, items: [expect.objectContaining({ cantidad: 12 })] })
    const issued = await request(app).post(`/api/ale-bet/pedidos/${pedido.id}/remitos`).set('Authorization', billing)
      .send({ expectedVersion: pedido.version, transporteOcasional: { nombre: 'Flete Automation', direccion: 'Ruta 2 km 50' } }).expect(201)
    expect((await request(app).get('/api/ale-bet/pedidos').set('Authorization', billing).expect(200)).body).not.toContainEqual(expect.objectContaining({ id: pedido.id }))
    expect((await request(app).get('/api/ale-bet/pedidos').set('Authorization', auth).expect(200)).body).toContainEqual(expect.objectContaining({ id: pedido.id }))
    expect((await request(app).get('/api/ale-bet/historial').set('Authorization', auth).expect(200)).body).toContainEqual(expect.objectContaining({ id: pedido.id }))
    expect((await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.valid.id, ubicacionId: pedido.reservas[0]!.ubicacionId } } })).cantidad).toBe(108)
    await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/remitos/${issued.body.id}/anular`).set('Authorization', billing)
      .send({ motivo: 'Documento emitido por error' }).expect(200)
    expect((await request(app).get('/api/ale-bet/pedidos').set('Authorization', billing).expect(200)).body).toContainEqual(expect.objectContaining({ id: pedido.id, origen: 'AUTOMATION' }))
    const afterVoid = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    await request(app).post(`/api/ale-bet/pedidos/${pedido.id}/remitos`).set('Authorization', billing)
      .send({ expectedVersion: afterVoid.version, transporteOcasional: { nombre: 'Flete Automation', direccion: 'Ruta 2 km 50' } }).expect(201)
    expect((await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.valid.id, ubicacionId: pedido.reservas[0]!.ubicacionId } } })).cantidad).toBe(108)
    expect(await prisma.movimientoStock.count({ where: { pedidoId: pedido.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)
    await request(app).put(`/api/ale-bet/automation/drafts/${created.body.id}`).set('Authorization', auth)
      .send({ expectedVersion: edited.body.version, clienteId: fixture.customer.id }).expect(409)
  })

  it('keeps CETRI physical and available stock coherent across Automation, Productos and Stock', async () => {
    const fixture = await seedCetri(108)
    const auth = `Bearer ${adminToken()}`

    for (const expectedPhysical of [96, 84, 72]) {
      await confirmAutomationUnits({ auth, customerId: fixture.customer.id, productId: fixture.product.id, productName: fixture.product.nombre, units: 12 })
      const saldo = await prisma.saldoStock.findUniqueOrThrow({ where: { productoId_loteId_ubicacionId: { productoId: fixture.product.id, loteId: fixture.lote.id, ubicacionId: fixture.deposito.id } } })
      expect(saldo.cantidad).toBe(expectedPhysical)
      expect(await prisma.reservaStock.count({ where: { pedido: { origen: 'AUTOMATION' }, estado: 'ACTIVA' } })).toBe(0)

      const productos = await request(app).get('/api/ale-bet/productos').set('Authorization', auth).expect(200)
      expect(productos.body.find((product: { id: string }) => product.id === fixture.product.id)).toMatchObject({ fisico: expectedPhysical, disponible: expectedPhysical })
      const stock = await request(app).get('/api/ale-bet/stock').set('Authorization', auth).expect(200)
      expect(stock.body.productos.find((product: { id: string }) => product.id === fixture.product.id)).toMatchObject({ stock: expectedPhysical, stockDisponiblePedido: expectedPhysical })

      const preview = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth)
        .send({ originalText: `1 ${fixture.product.nombre}` }).expect(201)
      const previewCustomer = await request(app).put(`/api/ale-bet/automation/drafts/${preview.body.id}`).set('Authorization', auth)
        .send({ expectedVersion: preview.body.version, clienteId: fixture.customer.id }).expect(200)
      await request(app).put(`/api/ale-bet/automation/drafts/${preview.body.id}`).set('Authorization', auth)
        .send({ expectedVersion: previewCustomer.body.version, line: { lineId: preview.body.proposedSnapshot.lines[0].lineId, productId: fixture.product.id, unidades: 1 } }).expect(200)
      const draft = await request(app).get(`/api/ale-bet/automation/drafts/${preview.body.id}`).set('Authorization', auth).expect(200)
      expect(draft.body.availability).toContainEqual(expect.objectContaining({ productId: fixture.product.id, availableUnits: expectedPhysical }))
    }
  })

  it('rejects operational edits and cancellation of confirmed Automation, including Admin', async () => {
    const fixture = await seedCetri(108)
    const auth = `Bearer ${adminToken()}`
    const confirmed = await confirmAutomationUnits({ auth, customerId: fixture.customer.id, productId: fixture.product.id, productName: fixture.product.nombre, units: 12 })
    const pedido = confirmed.body.pedido
    for (const authorization of [auth, `Bearer ${token('facturacion')}`]) {
      const edit = await request(app).patch(`/api/ale-bet/pedidos/${pedido.id}`).set('Authorization', authorization)
        .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: pedido.version, clienteId: fixture.customer.id, items: [{ productoId: fixture.product.id, cantidad: 24 }] })
      expect([403, 409]).toContain(edit.status)
      const cancel = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/cancelar`).set('Authorization', authorization)
        .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: pedido.version })
      expect([403, 409]).toContain(cancel.status)
    }
    expect(await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })).toMatchObject({ origen: 'AUTOMATION', estado: 'APROBADO', version: pedido.version, items: [{ cantidad: 12 }] })
    expect((await prisma.saldoStock.findFirstOrThrow({ where: { loteId: fixture.lote.id } })).cantidad).toBe(96)
    expect(await prisma.reservaStock.count({ where: { pedidoId: pedido.id, estado: 'ACTIVA' } })).toBe(0)
    expect(await prisma.movimientoStock.count({ where: { pedidoId: pedido.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)
  })

  it('resolves bare and explicit B12 presentations through the persisted draft endpoint with historic bad aliases', async () => {
    const fixture = await seedB12Catalog()
    await prisma.productAlias.create({ data: { alias: 'b12b25 250ml', aliasNormalized: 'B12B25 250 ML', productId: fixture.product100.id } })
    for (const [text, quantity, productId] of [
      ['24 b12b15 250', 24, fixture.product250.id],
      ['504 b12b15 100ml', 504, fixture.product100.id],
      ['240 b12b15 250ml', 240, fixture.product250.id],
    ] as const) {
      const draft = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', fixture.auth)
        .send({ originalText: text }).expect(201)
      const detail = await getEffective(draft.body.id, fixture.auth)
      expect(detail.effectiveSnapshot.lines[0]).toMatchObject({ productCandidate: { productId }, quantity: { totalUnits: quantity }, warnings: [] })
      expect(detail.effectiveSnapshot.lines[0].alternatives).toHaveLength(1)
      expect(await prisma.pedido.count()).toBe(0)
    }
  })

  it('previews and consumes ACONDICIONADO with the same availability as confirmation', async () => {
    const fixture = await seedCetri(0)
    const location = await prisma.ubicacionStock.create({ data: { codigo: 'ACONDICIONADO', nombre: 'Acondicionado' } })
    await prisma.saldoStock.create({ data: { productoId: fixture.product.id, loteId: fixture.lote.id, ubicacionId: location.id, cantidad: 108 } })
    const auth = `Bearer ${adminToken()}`
    const draft = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth)
      .send({ originalText: `Cliente: ${fixture.customer.nombre}\n12 ${fixture.product.nombre}` }).expect(201)
    const detail = await getEffective(draft.body.id, auth)
    expect(detail.availability).toContainEqual(expect.objectContaining({ availableUnits: 108, status: 'DISPONIBLE_CON_TRANSFERENCIA' }))
    const confirmed = await request(app).post(`/api/ale-bet/automation/drafts/${draft.body.id}/confirm`).set('Authorization', auth)
      .set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: draft.body.version }).expect(200)
    expect((await getEffective(draft.body.id, auth)).availability[0].availableUnits).toBe(96)
    expect((await prisma.saldoStock.aggregate({ where: { productoId: fixture.product.id }, _sum: { cantidad: true } }))._sum.cantidad).toBe(96)
    expect(await prisma.reservaStock.count({ where: { pedidoId: confirmed.body.pedido.id, estado: 'ACTIVA' } })).toBe(0)
  })

  it('reconciles only proven legacy Automation once and preserves real MANUAL orders', async () => {
    const { reconcileLegacyAutomationOrder } = await import('../../routes/ale-bet/automation/reconcile-legacy')
    const fixture = await seedCetri(108)
    const auth = `Bearer ${adminToken()}`
    const draft = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth)
      .send({ originalText: `Cliente: ${fixture.customer.nombre}\n12 ${fixture.product.nombre}` }).expect(201)
    const legacy = await prisma.pedido.create({ data: { numero: crypto.randomUUID(), clienteId: fixture.customer.id, estado: 'PREPARADO', items: { create: { productoId: fixture.product.id, cantidad: 12 } } }, include: { items: true } })
    await prisma.reservaStock.create({ data: { pedidoId: legacy.id, itemPedidoId: legacy.items[0].id, loteId: fixture.lote.id, ubicacionId: fixture.deposito.id, cantidad: 12 } })
    await expect(prisma.$transaction((tx) => reconcileLegacyAutomationOrder(tx, legacy.id, 'automation-admin'))).rejects.toThrow('Procedencia')
    await prisma.orderInterpretationDraft.update({ where: { id: draft.body.id }, data: { pedidoId: legacy.id, estado: 'CONFIRMED', confirmedBy: 'automation-admin' } })
    await prisma.pedidoAuditoria.createMany({ data: ['BORRADOR_CREADO_AUTOMATION', 'PEDIDO_APROBADO_AUTOMATION'].map((accion) => ({ pedidoId: legacy.id, actorId: 'automation-admin', accion })) })
    expect(await prisma.$transaction((tx) => reconcileLegacyAutomationOrder(tx, legacy.id, 'automation-admin'))).toMatchObject({ repaired: true })
    expect(await prisma.$transaction((tx) => reconcileLegacyAutomationOrder(tx, legacy.id, 'automation-admin'))).toMatchObject({ repaired: false })
    expect((await prisma.saldoStock.findFirstOrThrow({ where: { loteId: fixture.lote.id } })).cantidad).toBe(96)
    expect(await prisma.reservaStock.count({ where: { pedidoId: legacy.id, estado: 'CONSUMIDA' } })).toBe(1)
    expect(await prisma.movimientoStock.count({ where: { pedidoId: legacy.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)
    expect(await prisma.pedido.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({ origen: 'AUTOMATION', estado: 'APROBADO' })
  })

  it('serializes concurrent drafts against the last availability', async () => {
    const fixture = await seed(20)
    const auth = `Bearer ${adminToken()}`
    const ids: Array<{ id: string; version: number }> = []
    for (const units of [20, 20]) {
      const draft = await request(app).post('/api/ale-bet/automation/drafts').set('Authorization', auth).send({ originalText: `${units} Olivitasan 500` })
      const withCustomer = await request(app).put(`/api/ale-bet/automation/drafts/${draft.body.id}`).set('Authorization', auth).send({ expectedVersion: 1, clienteId: fixture.customer.id })
      const edited = await request(app).put(`/api/ale-bet/automation/drafts/${draft.body.id}`).set('Authorization', auth).send({ expectedVersion: withCustomer.body.version, line: { lineId: draft.body.proposedSnapshot.lines[0].lineId, productId: fixture.product.id, unidades: units } })
      ids.push({ id: draft.body.id, version: edited.body.version })
    }
    const responses = await Promise.all(ids.map((draft) => request(app).post(`/api/ale-bet/automation/drafts/${draft.id}/confirm`).set('Authorization', auth).set('Idempotency-Key', crypto.randomUUID()).send({ expectedVersion: draft.version })))
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(await prisma.reservaStock.count({ where: { estado: 'ACTIVA', loteId: fixture.valid.id } })).toBe(0)
    expect((await prisma.saldoStock.findFirstOrThrow({ where: { loteId: fixture.valid.id } })).cantidad).toBe(0)
    expect(await prisma.movimientoStock.count({ where: { loteId: fixture.valid.id, tipo: 'SALIDA_PEDIDO' } })).toBe(1)
  })
})
