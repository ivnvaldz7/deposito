import { Router } from 'express'
import { z } from 'zod'
import { platformDb as prisma, Prisma, TipoMovimiento } from '@platform/db'
import type { JwtPayload } from '@platform/core'
import { getAppAccess } from '@platform/core'
import { requireApp } from '../../middlewares/require-app'
import { VENCIMIENTO_DEFAULT_AÑOS, calcularUnidades, validarSueltos } from './constants'
import { adjustManagedStock, createManagedLot, getManagedProductStock, ProductStockAdminConflict } from './product-stock-admin-service'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'

const router = Router()

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new ProductStockAdminConflict('Fecha inválida')
  return date
}

const productoSchema = z.object({
  nombre: z.string().min(2).max(120),
  sku: z.string().min(2).max(40),
  stockMinimo: z.number().int().min(0).optional(),
  unidadesPorCaja: z.number().int().positive(),
})

const updateProductoSchema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  stockMinimo: z.number().int().min(0).optional(),
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

async function getProductStock(productId: string, unidadesPorCaja: number): Promise<number> {
  const lotes = await prisma.lote.findMany({
    where: { productoId: productId, activo: true },
    select: { cajas: true, sueltos: true },
  })

  return lotes.reduce((total, lote) => total + calcularUnidades(lote.cajas, lote.sueltos, unidadesPorCaja), 0)
}

router.get('/', requireApp('ale-bet'), async (_req, res) => {
  const productos = await prisma.producto.findMany({
    include: {
      lotes: {
        where: { activo: true },
        include: { 
          saldos: { select: { cantidad: true } },
          reservas: { where: { estado: 'ACTIVA' }, select: { cantidad: true } } 
        },
      },
    },
    orderBy: { nombre: 'asc' },
  })

  const response = productos.map((producto) => {
    const stock = producto.lotes.reduce(
      (total, lote) => total + lote.saldos.reduce((sum, saldo) => sum + saldo.cantidad, 0),
      0
    )

    const reserved = producto.lotes.reduce((total, lote) => total + (lote.reservas ?? []).reduce((sum, reserva) => sum + reserva.cantidad, 0), 0)
    return {
      ...producto,
      stock,
      fisico: stock,
      reservado: reserved,
      disponible: stock - reserved,
      stockBajo: stock < producto.stockMinimo,
    }
  })

  res.json(response)
})

router.get('/search', requireApp('ale-bet'), async (req, res) => {
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
    include: { lotes: { where: { activo: true }, include: { reservas: { where: { estado: 'ACTIVA' } } } } },
    orderBy: { nombre: 'asc' },
    take: 50,
  })
  res.json(productos.map((producto) => {
    const fisico = producto.lotes.reduce((sum, lote) => sum + calcularUnidades(lote.cajas, lote.sueltos, producto.unidadesPorCaja), 0)
    const reservado = producto.lotes.reduce((sum, lote) => sum + lote.reservas.reduce((inner, reserva) => inner + reserva.cantidad, 0), 0)
    return { id: producto.id, nombre: producto.nombre, sku: producto.sku, unidadesPorCaja: producto.unidadesPorCaja, fisico, reservado, disponible: fisico - reservado }
  }))
})

router.post('/', requireApp('ale-bet', ['admin']), async (req, res) => {
  const parsed = productoSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }

  const producto = await prisma.producto.create({ data: parsed.data })

  res.status(201).json({ ...producto, stock: 0, stockBajo: true })
})

router.put('/:id', requireApp('ale-bet', ['admin']), async (req, res) => {
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

  const stock = await getProductStock(producto.id, producto.unidadesPorCaja)

  res.json({ ...producto, stock, stockBajo: stock < producto.stockMinimo })
})

router.delete('/:id', requireApp('ale-bet', ['admin']), async (req, res) => {
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

router.get('/:id/lotes', requireApp('ale-bet', ['admin', 'encargado']), async (req, res) => {
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

router.put('/:id/lotes/:loteId', requireApp('ale-bet', ['admin', 'encargado']), async (req, res) => {
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

router.post('/:id/lotes', requireApp('ale-bet', ['admin', 'encargado']), async (req, res) => {
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
router.get('/:id/stock', requireApp('ale-bet'), async (req, res) => {
  const user = req.user as JwtPayload
  const appAccess = getAppAccess(user, 'ale-bet')
  const includeArchived = req.query.includeArchived === 'true' && ['admin', 'encargado'].includes(appAccess?.rol ?? '')
  const result = await getManagedProductStock(String(req.params.id), prisma, includeArchived)
  res.json(result)
})

router.get('/:id/lotes/historial', requireApp('ale-bet', ['admin', 'encargado']), async (req, res) => {
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
    const loteMovimientos = (movimientosByLote.get(lote.id) ?? []).slice(0, 10)

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

router.post('/:id/stock/lotes', requireApp('ale-bet', ['admin', 'encargado']), async (req, res) => {
  const schema = z.object({
    numero: z.string().trim().min(1).max(60),
    fechaProduccion: z.string().datetime().nullable().optional(),
    fechaVencimiento: z.string().datetime().nullable().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return
  }
  try {
    const lote = await prisma.$transaction((tx) => createManagedLot(tx, {
      productoId: String(req.params.id),
      numero: parsed.data.numero,
      fechaProduccion: parseOptionalDate(parsed.data.fechaProduccion),
      fechaVencimiento: parseOptionalDate(parsed.data.fechaVencimiento),
    }))
    res.status(201).json({ id: lote.id, numero: lote.numero, fechaProduccion: lote.fechaProduccion, fechaVencimiento: lote.fechaVencimiento, activo: lote.activo, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 })
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

router.patch('/:id/stock/lotes/:loteId/ajuste', requireApp('ale-bet', ['admin', 'encargado']), async (req, res) => {
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
    res.json(result.body)
  } catch (error) {
    if (error instanceof ProductStockAdminConflict) {
      res.status(409).json({ error: error.message })
      return
    }
    throw error
  }
})

export default router
