import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma, Prisma, TipoMovimiento } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { getAppAccess, hasPermission } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { requirePermission } from '../../middlewares/require-permission'
import { VENCIMIENTO_DEFAULT_AÑOS, calcularUnidades, validarSueltos } from './constants'
import { adjustManagedStock, createManagedLot, getManagedProductStock, ProductStockAdminConflict } from './product-stock-admin-service'
import { aggregateProductAvailability } from './stock-aggregation'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'
import { syncStockProjectionAfterCommit } from './stock-projection/direct-sync'

const router = Router()

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new ProductStockAdminConflict('Fecha inválida')
  return date
}

type MovimientoReferencia = {
  motivo: string | null
  fechaEfectiva: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseMovimientoReferencia(value: string | null): MovimientoReferencia {
  if (!value) return { motivo: null, fechaEfectiva: null }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) return { motivo: null, fechaEfectiva: null }
    return {
      motivo: typeof parsed.motivo === 'string' ? parsed.motivo : null,
      fechaEfectiva: typeof parsed.fechaEfectiva === 'string' ? parsed.fechaEfectiva : null,
    }
  } catch {
    return { motivo: null, fechaEfectiva: null }
  }
}

const productoSchema = z.object({
  nombre: z.string().min(2).max(120),
  sku: z.string().min(2).max(40),
  stockMinimo: z.number().int().min(0).nullable().optional(),
  unidadesPorCaja: z.number().int().positive(),
})

const updateProductoSchema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  stockMinimo: z.number().int().min(0).nullable().optional(),
  activo: z.boolean().optional(),
  unidadesPorCaja: z.number().int().positive().optional(),
})

const loteSchema = z.object({
  numero: z.string().min(2).max(60).optional(),
  cajas: z.number().int().min(0),
  sueltos: z.number().int().min(0),
  fechaProduccion: z.string().datetime(),
})

function buildLoteNumber(sku: string, sequence: number): string {
  return `${sku}${String(sequence).padStart(4, '0')}`
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002'
}

async function getProductStock(productId: string): Promise<number> {
  const aggregate = await prisma.saldoStock.aggregate({
    where: { productoId: productId },
    _sum: { cantidad: true },
  })
  return aggregate._sum.cantidad ?? 0
}

router.get('/', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.read'), async (_req, res) => {
  const productos = await prisma.producto.findMany({
    include: {
      lotes: {
        where: { activo: true },
        include: {
          saldos: { select: { cantidad: true, ubicacion: { select: { codigo: true } } } },
          reservas: { where: { estado: 'ACTIVA' }, select: { cantidad: true } } 
        },
      },
    },
    orderBy: { nombre: 'asc' },
  })

  const response = productos.map((producto) => {
    const availability = aggregateProductAvailability(producto)
    return {
      ...producto,
      lotes: availability.lotes,
      stock: availability.stockTotal,
      fisico: availability.stockTotal,
      stockTotal: availability.stockTotal,
      stockDeposito: availability.stockDeposito,
      stockAcondicionado: availability.stockAcondicionado,
      reservado: availability.reservado,
      disponible: availability.disponible,
      stockBajo: availability.stockBajo,
    }
  })

  res.json(response)
})

router.get('/search', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.read'), async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(query ? {
        OR: [
          { nombre: { contains: query, mode: 'insensitive' as const } },
          { lotes: { some: { numero: { contains: query, mode: 'insensitive' as const }, activo: true } } },
          { AND: [{ sku: { contains: query, mode: 'insensitive' as const } }, { NOT: { sku: { startsWith: 'LOG-' } } }] },
        ],
      } : {}),
    },
    include: {
      lotes: {
        where: { activo: true },
        include: {
          saldos: { select: { cantidad: true, ubicacion: { select: { codigo: true } } } },
          reservas: { where: { estado: 'ACTIVA' }, select: { cantidad: true } },
        },
      },
    },
    orderBy: { nombre: 'asc' },
    take: 50,
  })
  res.json(productos.map((producto) => {
    const availability = aggregateProductAvailability(producto)
    return {
      id: producto.id,
      nombre: producto.nombre,
      sku: producto.sku,
      unidadesPorCaja: producto.unidadesPorCaja,
      fisico: availability.stockTotal,
      reservado: availability.reservado,
      disponible: availability.disponible,
    }
  }))
})

router.post('/', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async (req, res) => {
  const parsed = productoSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const producto = await prisma.producto.create({ data: parsed.data })

  res.status(201).json({ ...producto, stock: 0, stockBajo: producto.stockMinimo !== null })
})

router.put('/:id', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async (req, res) => {
  const productoId = String(req.params.id)
  const parsed = updateProductoSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  if (parsed.data.unidadesPorCaja !== undefined) {
    const existingLots = await prisma.lote.count({ where: { productoId } })
    if (existingLots > 0) {
      res.status(409).json({ error: 'No se pueden cambiar las unidades por caja de un producto con lotes existentes' })
      return
    }
  }

  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: parsed.data,
  })

  const stock = await getProductStock(producto.id)

  res.json({ ...producto, stock, stockBajo: producto.stockMinimo !== null && stock <= producto.stockMinimo })
})

router.delete('/:id', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async (req, res) => {
  const productoId = String(req.params.id)

  const activeItems = await prisma.itemPedido.findFirst({
    where: {
      productoId,
      pedido: {
        estado: { in: ['BORRADOR', 'APROBADO', 'EN_ARMADO', 'PREPARADO'] },
      },
    },
  })

  if (activeItems) {
    res.status(409).json({ error: 'El producto tiene pedidos activos asociados' })
    return
  }

  await prisma.producto.delete({ where: { id: productoId } })

  res.status(204).send()
})

router.get('/:id/lotes', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.read'), async (req, res) => {
  const productoId = String(req.params.id)

  const [producto, lotes] = await Promise.all([
    prisma.producto.findUnique({ where: { id: productoId }, select: { unidadesPorCaja: true } }),
    prisma.lote.findMany({ where: { productoId }, orderBy: { fechaVencimiento: 'asc' } }),
  ])

  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' })
    return
  }

  res.json(
    lotes.map((lote) => ({
      ...lote,
      unidades: calcularUnidades(lote.cajas, lote.sueltos, producto.unidadesPorCaja),
      unidadesPorCaja: producto.unidadesPorCaja,
    }))
  )
})

const updateLoteSchema = z.object({
  cajas: z.number().int().min(0).optional(),
  sueltos: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
})

router.put('/:id/lotes/:loteId', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async (req, res) => {
  const productoId = String(req.params.id)
  const loteId = String(req.params.loteId)
  const user = req.user as JwtPayload
  const parsed = updateLoteSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const lockedLots = await tx.$queryRaw<Array<{ id: string; productoId: string; cajas: number; sueltos: number; unidadesPorCaja: number }>>(Prisma.sql`
        SELECT lote.id, lote."productoId", lote.cajas, lote.sueltos, producto."unidadesPorCaja"
        FROM "ale_bet"."Lote" AS lote
        JOIN "ale_bet"."Producto" AS producto ON producto.id = lote."productoId"
        WHERE lote.id = ${loteId}
        FOR UPDATE
      `)
      const lote = lockedLots[0]
      if (!lote || lote.productoId !== productoId) {
        throw new Error('LOTE_NOT_FOUND')
      }

      const oldUnidades = calcularUnidades(lote.cajas, lote.sueltos, lote.unidadesPorCaja)
      const cajas = parsed.data.cajas ?? lote.cajas
      const sueltos = parsed.data.sueltos ?? lote.sueltos
      if (!validarSueltos(sueltos, lote.unidadesPorCaja)) throw new Error('LOOSE_UNITS_INVALID')
      const newUnidades = calcularUnidades(cajas, sueltos, lote.unidadesPorCaja)
      const diff = newUnidades - oldUnidades
      const reservas = await tx.reservaStock.aggregate({
        where: { loteId, estado: 'ACTIVA' },
        _sum: { cantidad: true },
      })
      const reservado = reservas._sum.cantidad ?? 0
      if (parsed.data.activo === false && reservado > 0) {
        throw new Error(`STOCK_RESERVATION_DEACTIVATION_CONFLICT:${reservado}`)
      }
      if (newUnidades < reservado) {
        throw new Error(`STOCK_RESERVATION_CONFLICT:${newUnidades}:${reservado}`)
      }

      const result = await tx.lote.update({ where: { id: loteId }, data: parsed.data })
      if (diff !== 0) {
        await tx.movimientoStock.create({
          data: {
            productoId,
            cantidad: Math.abs(diff),
            tipo: diff > 0 ? TipoMovimiento.ENTRADA_MANUAL : TipoMovimiento.AJUSTE,
            referencia: loteId,
            usuarioId: user.sub,
          },
        })
      }
      return { ...result, unidadesPorCaja: lote.unidadesPorCaja }
    })
    res.json({ ...updated, unidades: calcularUnidades(updated.cajas, updated.sueltos, updated.unidadesPorCaja) })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'LOOSE_UNITS_INVALID') {
      res.status(400).json({ error: 'Los sueltos deben ser menores a las unidades por caja del producto' })
      return
    }
    if (message === 'LOTE_NOT_FOUND') {
      res.status(404).json({ error: 'Lote no encontrado' })
      return
    }
    if (message.startsWith('STOCK_RESERVATION_CONFLICT:')) {
      const [, fisico, reservado] = message.split(':')
      res.status(409).json({ error: `El ajuste dejaría stock físico (${fisico}) por debajo de reservas activas (${reservado})` })
      return
    }
    if (message.startsWith('STOCK_RESERVATION_DEACTIVATION_CONFLICT:')) {
      const [, reservado] = message.split(':')
      res.status(409).json({ error: `No se puede desactivar un lote con reservas activas (${reservado})` })
      return
    }
    throw error
  }
})

router.post('/:id/lotes', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.create'), async (req, res) => {
  const productoId = String(req.params.id)
  const user = req.user as JwtPayload
  const parsed = loteSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const producto = await prisma.producto.findUnique({ where: { id: productoId } })

  if (!producto) {
    res.status(404).json({ error: 'Producto no encontrado' })
    return
  }

  if (!validarSueltos(parsed.data.sueltos, producto.unidadesPorCaja)) {
    res.status(400).json({ error: 'Los sueltos deben ser menores a las unidades por caja del producto' })
    return
  }

  const fechaProduccion = new Date(parsed.data.fechaProduccion)
  const fechaVencimiento = new Date(fechaProduccion)
  fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + VENCIMIENTO_DEFAULT_AÑOS)

  const sequence = (await prisma.lote.count({ where: { productoId: producto.id } })) + 1
  const numero = parsed.data.numero ?? buildLoteNumber(producto.sku, sequence)
  const cantidad = calcularUnidades(parsed.data.cajas, parsed.data.sueltos, producto.unidadesPorCaja)

  try {
    const lote = await prisma.$transaction(async (tx) => {
      const created = await tx.lote.create({
        data: {
          numero,
          productoId: producto.id,
          cajas: parsed.data.cajas,
          sueltos: parsed.data.sueltos,
          fechaProduccion,
          fechaVencimiento,
        },
      })

      await tx.movimientoStock.create({
        data: {
          productoId: producto.id,
          cantidad,
          tipo: TipoMovimiento.ENTRADA_MANUAL,
          referencia: created.id,
          usuarioId: user.sub,
        },
      })

      return created
    })

    res.status(201).json({ ...lote, unidades: cantidad, unidadesPorCaja: producto.unidadesPorCaja })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Ya existe un lote con ese número para este producto' })
      return
    }

    throw error
  }
})

// Location-aware product administration. The legacy lot endpoints above remain
// available for existing clients; these contracts never derive stock from cajas/sueltos.
router.get('/:id/stock', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.read'), async (req, res) => {
  const user = req.user as JwtPayload
  const includeArchived = req.query.includeArchived === 'true' && hasPermission(user, 'ale-bet', 'stock.read.archived')
  const includeZero = req.query.includeZero === 'true'
  const result = await getManagedProductStock(String(req.params.id), prisma, includeArchived, includeZero)
  res.json(result)
})

router.get('/:id/lotes/historial', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.history.read'), async (req, res) => {
  const productoId = String(req.params.id)
  const lotes = await prisma.lote.findMany({
    where: { productoId },
    orderBy: [{ activo: 'desc' }, { fechaVencimiento: 'asc' }],
    include: {
      saldos: { include: { ubicacion: { select: { codigo: true } } } },
    },
  })

  const loteIds = lotes.map((lote) => lote.id)
  const movimientos = loteIds.length > 0
    ? await prisma.movimientoStock.findMany({
        where: { loteId: { in: loteIds } },
        orderBy: { createdAt: 'desc' },
        include: {
          origenUbicacion: { select: { codigo: true, nombre: true } },
          destinoUbicacion: { select: { codigo: true, nombre: true } },
        },
      })
    : []

  const movimientosByLote = new Map<string, typeof movimientos>()
  for (const mov of movimientos) {
    if (!mov.loteId) continue
    const list = movimientosByLote.get(mov.loteId) ?? []
    list.push(mov)
    movimientosByLote.set(mov.loteId, list)
  }

  res.json(lotes.map((lote) => {
    const stockDeposito = lote.saldos.filter((s) => s.ubicacion.codigo === 'DEPOSITO').reduce((sum, s) => sum + s.cantidad, 0)
    const stockAcondicionado = lote.saldos.filter((s) => s.ubicacion.codigo === 'ACONDICIONADO').reduce((sum, s) => sum + s.cantidad, 0)
    const stockTotal = lote.saldos.reduce((sum, s) => sum + s.cantidad, 0)
    const loteMovimientos = (movimientosByLote.get(lote.id) ?? []).slice(0, 10).map((movimiento) => ({
      ...movimiento,
      ...parseMovimientoReferencia(movimiento.referencia),
    }))

    return {
      id: lote.id,
      numero: lote.numero,
      fechaProduccion: lote.fechaProduccion,
      fechaVencimiento: lote.fechaVencimiento,
      activo: lote.activo,
      stockTotal,
      stockDeposito,
      stockAcondicionado,
      movimientos: loteMovimientos,
    }
  }))
})

router.post('/:id/stock/lotes', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.create'), async (req, res) => {
  const schema = z.object({
    numero: z.string().trim().min(1).max(60),
    cantidadInicial: z.number().int().positive().optional(),
    fechaProduccion: z.string().datetime().nullable().optional(),
    fechaVencimiento: z.string().datetime().nullable().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }
  const productoId = String(req.params.id)
  const user = req.user as JwtPayload
  const cantidadInicial = parsed.data.cantidadInicial

  if (cantidadInicial !== undefined && !hasPermission(user, 'ale-bet', 'stock.lots.adjust')) {
    res.status(403).json({ error: 'Permisos insuficientes' })
    return
  }

  const idempotencyKey = cantidadInicial === undefined ? null : getSingleIdempotencyKey(req.rawHeaders)
  if (cantidadInicial !== undefined && !idempotencyKey) {
    res.status(400).json({ error: 'Idempotency-Key requerido' })
    return
  }

  try {
    if (cantidadInicial === undefined || !idempotencyKey) {
      const lote = await prisma.$transaction((tx) => createManagedLot(tx, {
        productoId,
        numero: parsed.data.numero,
        fechaProduccion: parseOptionalDate(parsed.data.fechaProduccion),
        fechaVencimiento: parseOptionalDate(parsed.data.fechaVencimiento),
      }))
      res.status(201).json({ id: lote.id, numero: lote.numero, fechaProduccion: lote.fechaProduccion, fechaVencimiento: lote.fechaVencimiento, activo: lote.activo, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 })
      return
    }

    const body = { productoId, ...parsed.data }
    const scope = 'ale-bet.producto.stock-lote-apertura'
    const fingerprint = calculateFingerprint('POST', scope, productoId, body)
    const result = await prisma.$transaction(async (tx) => {
      const acquired = await acquireIdempotencyRecord(tx, user.sub, scope, idempotencyKey, fingerprint)
      if (acquired.type === 'REPLAY') return acquired.body

      const lote = await createManagedLot(tx, {
        productoId,
        numero: parsed.data.numero,
        fechaProduccion: parseOptionalDate(parsed.data.fechaProduccion),
        fechaVencimiento: parseOptionalDate(parsed.data.fechaVencimiento),
      })
      const acondicionado = await tx.ubicacionStock.findUnique({
        where: { codigo: 'ACONDICIONADO' },
        select: { id: true, activo: true },
      })
      if (!acondicionado?.activo) {
        throw new ProductStockAdminConflict('La ubicación ACONDICIONADO no existe o está inactiva')
      }

      const fechaEfectiva = new Date().toISOString().slice(0, 10)
      await adjustManagedStock(tx, {
        productoId,
        loteId: lote.id,
        ubicacionId: acondicionado.id,
        cantidadFinal: cantidadInicial,
        actorId: user.sub,
        motivo: 'Saldo de apertura',
        fechaEfectiva,
        idempotencyKey,
        tipoMovimiento: TipoMovimiento.SALDO_APERTURA,
      })
      const response = {
        id: lote.id,
        numero: lote.numero,
        fechaProduccion: lote.fechaProduccion,
        fechaVencimiento: lote.fechaVencimiento,
        activo: lote.activo,
        stockTotal: cantidadInicial,
        stockDeposito: 0,
        stockAcondicionado: cantidadInicial,
      }
      await completeIdempotencyRecord(tx, acquired.id, 201, toPersistableResponseBody(response))
      return response
    })
    await syncStockProjectionAfterCommit()
    res.status(201).json(result)
  } catch (error) {
    if (error instanceof ProductStockAdminConflict) {
      res.status(409).json({ error: error.message })
      return
    }
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Ya existe un lote con ese número para este producto' })
      return
    }
    throw error
  }
})

router.patch('/:id/stock/lotes/:loteId/ajuste', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.adjust'), async (req, res) => {
  const schema = z.object({
    ubicacionId: z.string().min(1),
    cantidadFinal: z.number().int().min(0),
    motivo: z.string().trim().max(500).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }
  const user = req.user as JwtPayload
  const key = getSingleIdempotencyKey(req.rawHeaders)
  if (!key) {
    res.status(400).json({ error: 'Idempotency-Key requerido' })
    return
  }
  const body = { productoId: String(req.params.id), loteId: String(req.params.loteId), ...parsed.data }
  const fingerprint = calculateFingerprint('PATCH', 'ale-bet.producto.stock-ajuste', body.loteId, body)
  try {
    const result = await prisma.$transaction(async (tx) => {
      const acquired = await acquireIdempotencyRecord(tx, user.sub, 'ale-bet.producto.stock-ajuste', key, fingerprint)
      if (acquired.type === 'REPLAY') return { replay: true, body: acquired.body }
      const adjustment = await adjustManagedStock(tx, {
        ...body,
        actorId: user.sub,
        idempotencyKey: key,
      })
      const response = { loteId: body.loteId, ubicacionId: body.ubicacionId, anterior: adjustment.anterior, nuevo: adjustment.nuevo, delta: adjustment.delta, movimientoId: adjustment.movimiento?.id ?? null }
      await completeIdempotencyRecord(tx, acquired.id, 200, toPersistableResponseBody(response))
      return { replay: false, body: response }
    })
    await syncStockProjectionAfterCommit()
    res.json(result.body)
  } catch (error) {
    if (error instanceof ProductStockAdminConflict) {
      res.status(409).json({ error: error.message })
      return
    }
    throw error
  }
})

router.patch('/:id/stock/lotes/:loteId/ingreso', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.adjust'), async (req, res) => {
  const schema = z.object({
    ubicacionId: z.string().min(1),
    cantidad: z.number().int().positive(),
    motivo: z.string().trim().max(500).optional(),
    fechaEfectiva: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() }); return }
  const user = req.user as JwtPayload
  const key = getSingleIdempotencyKey(req.rawHeaders)
  if (!key) { res.status(400).json({ error: 'Idempotency-Key requerido' }); return }
  const body = { productoId: String(req.params.id), loteId: String(req.params.loteId), ...parsed.data, fechaEfectiva: parsed.data.fechaEfectiva ?? new Date().toISOString().slice(0, 10) }
  const scope = 'ale-bet.producto.stock-ingreso'
  const fingerprint = calculateFingerprint('PATCH', scope, body.loteId, body)
  try {
    const result = await prisma.$transaction(async (tx) => {
      const acquired = await acquireIdempotencyRecord(tx, user.sub, scope, key, fingerprint)
      if (acquired.type === 'REPLAY') return acquired.body

      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM "ale_bet"."Lote" WHERE id = ${body.loteId} AND "productoId" = ${body.productoId} FOR UPDATE
      `)
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM "ale_bet"."SaldoStock"
        WHERE "productoId" = ${body.productoId} AND "loteId" = ${body.loteId} AND "ubicacionId" = ${body.ubicacionId}
        FOR UPDATE
      `)

      const current = await tx.saldoStock.findUnique({
        where: { productoId_loteId_ubicacionId: { productoId: body.productoId, loteId: body.loteId, ubicacionId: body.ubicacionId } },
        select: { cantidad: true },
      })
      const currentAmount = current?.cantidad ?? 0
      const cantidadFinal = currentAmount + body.cantidad

      const adjustment = await adjustManagedStock(tx, {
        productoId: body.productoId,
        loteId: body.loteId,
        ubicacionId: body.ubicacionId,
        cantidadFinal,
        actorId: user.sub,
        motivo: body.motivo ?? 'Ingreso de mercadería',
        fechaEfectiva: body.fechaEfectiva,
        idempotencyKey: key,
      })
      const response = { loteId: body.loteId, ubicacionId: body.ubicacionId, anterior: adjustment.anterior, nuevo: adjustment.nuevo, delta: adjustment.delta, movimientoId: adjustment.movimiento?.id ?? null }
      await completeIdempotencyRecord(tx, acquired.id, 200, toPersistableResponseBody(response))
      return response
    })
    await syncStockProjectionAfterCommit()
    res.json(result)
  } catch (error) {
    if (error instanceof ProductStockAdminConflict) { res.status(409).json({ error: error.message }); return }
    throw error
  }
})

router.patch('/:id/stock/lotes/:loteId/apertura', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.adjust'), async (req, res) => {
  void req
  res.status(410).json({
    error: 'La edición de apertura está cerrada para la operación normal. Usá un ajuste o ingreso de stock; el historial existente no se modifica.',
  })
})

export default router
