import { platformDb, Prisma, TipoMovimiento } from '@platform/db'

export class ProductStockAdminConflict extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductStockAdminConflict'
  }
}

type Tx = Prisma.TransactionClient

export async function createManagedLot(
  tx: Tx,
  input: { productoId: string; numero: string; fechaProduccion?: Date | null; fechaVencimiento?: Date | null },
) {
  const product = await tx.producto.findUnique({ where: { id: input.productoId }, select: { id: true } })
  if (!product) throw new ProductStockAdminConflict('Producto no encontrado')

  return tx.lote.create({
    data: {
      producto: { connect: { id: input.productoId } },
      numero: input.numero,
      cajas: 0,
      sueltos: 0,
      fechaProduccion: input.fechaProduccion ?? null,
      fechaVencimiento: input.fechaVencimiento ?? null,
    },
  })
}

export async function adjustManagedStock(
  tx: Tx,
  input: {
    productoId: string
    loteId: string
    ubicacionId: string
    cantidadFinal: number
    actorId: string
    motivo?: string
    idempotencyKey: string
  },
) {
  if (!Number.isInteger(input.cantidadFinal) || input.cantidadFinal < 0) {
    throw new ProductStockAdminConflict('La cantidad final no puede ser negativa')
  }

  const lot = await tx.lote.findFirst({
    where: { id: input.loteId, productoId: input.productoId },
    select: { id: true, productoId: true },
  })
  if (!lot) throw new ProductStockAdminConflict('Lote no encontrado para el producto')

  const location = await tx.ubicacionStock.findUnique({
    where: { id: input.ubicacionId },
    select: { id: true, activo: true },
  })
  if (!location || !location.activo) throw new ProductStockAdminConflict('Ubicación no encontrada o inactiva')

  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "ale_bet"."Lote" WHERE id = ${input.loteId} AND "productoId" = ${input.productoId} FOR UPDATE
  `)
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "ale_bet"."SaldoStock"
    WHERE "productoId" = ${input.productoId} AND "loteId" = ${input.loteId} AND "ubicacionId" = ${input.ubicacionId}
    FOR UPDATE
  `)

  const current = await tx.saldoStock.findUnique({
    where: { productoId_loteId_ubicacionId: { productoId: input.productoId, loteId: input.loteId, ubicacionId: input.ubicacionId } },
    select: { id: true, cantidad: true },
  })
  const anterior = current?.cantidad ?? 0
  const delta = input.cantidadFinal - anterior

  const reserved = await tx.reservaStock.aggregate({
    where: { loteId: input.loteId, ubicacionId: input.ubicacionId, estado: 'ACTIVA' },
    _sum: { cantidad: true },
  })
  const reservado = reserved._sum.cantidad ?? 0
  if (input.cantidadFinal < reservado) {
    throw new ProductStockAdminConflict('La cantidad final no puede quedar por debajo del stock reservado')
  }

  const saldo = await tx.saldoStock.upsert({
    where: { productoId_loteId_ubicacionId: { productoId: input.productoId, loteId: input.loteId, ubicacionId: input.ubicacionId } },
    create: { productoId: input.productoId, loteId: input.loteId, ubicacionId: input.ubicacionId, cantidad: input.cantidadFinal },
    update: { cantidad: input.cantidadFinal },
  })

  await evaluateLotLifecycle(tx, { loteId: input.loteId, productoId: input.productoId })

  if (delta === 0) return { saldo, movimiento: null, anterior, nuevo: input.cantidadFinal, delta }

  const referencia = JSON.stringify({
    operacion: 'AJUSTE_PRODUCTO',
    anterior,
    nuevo: input.cantidadFinal,
    motivo: input.motivo ?? null,
  })
  const movimiento = await tx.movimientoStock.create({
    data: {
      productoId: input.productoId,
      loteId: input.loteId,
      cantidad: delta,
      tipo: TipoMovimiento.AJUSTE,
      referencia,
      usuarioId: input.actorId,
      origenUbicacionId: input.ubicacionId,
      idempotencyKey: input.idempotencyKey,
    },
  })
  return { saldo, movimiento, anterior, nuevo: input.cantidadFinal, delta }
}

export async function evaluateLotLifecycle(
  tx: Tx,
  input: { loteId: string; productoId: string },
) {
  const { loteId, productoId } = input
  const saldos = await tx.saldoStock.findMany({
    where: { loteId, productoId },
    select: { cantidad: true },
  })
  const stockTotal = saldos.reduce((sum, saldo) => sum + saldo.cantidad, 0)

  const activeReservations = await tx.reservaStock.count({
    where: { loteId, estado: 'ACTIVA' },
  })

  const lote = await tx.lote.findUnique({
    where: { id: loteId },
    select: { activo: true },
  })

  let action: 'ARCHIVED' | 'REACTIVATED' | 'UNCHANGED' = 'UNCHANGED'

  if (stockTotal === 0) {
    if (activeReservations === 0 && lote?.activo !== false) {
      await tx.lote.update({ where: { id: loteId }, data: { activo: false } })
      action = 'ARCHIVED'
    }
  } else if (stockTotal > 0) {
    if (lote?.activo === false) {
      await tx.lote.update({ where: { id: loteId }, data: { activo: true } })
      action = 'REACTIVATED'
    }
  }

  return { loteId, action, stockTotal, activeReservations }
}

export async function getManagedProductStock(productoId: string, db: typeof platformDb, includeArchived?: boolean) {
  const [producto, ubicaciones] = await Promise.all([
    db.producto.findUnique({
      where: { id: productoId },
      select: {
        id: true,
        nombre: true,
        lotes: {
          where: includeArchived ? undefined : { activo: true },
          orderBy: [{ fechaVencimiento: 'asc' }, { fechaProduccion: 'asc' }, { id: 'asc' }],
          select: { id: true, numero: true, fechaProduccion: true, fechaVencimiento: true, activo: true, saldos: { select: { cantidad: true, ubicacion: { select: { id: true, codigo: true } } } } },
        },
      },
    }),
    db.ubicacionStock.findMany({ where: { activo: true }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, nombre: true } }),
  ])
  if (!producto) throw new ProductStockAdminConflict('Producto no encontrado')

  const lotes = producto.lotes.map((lote) => {
    const stockDeposito = lote.saldos.filter((saldo) => saldo.ubicacion.codigo === 'DEPOSITO').reduce((sum, saldo) => sum + saldo.cantidad, 0)
    const stockAcondicionado = lote.saldos.filter((saldo) => saldo.ubicacion.codigo === 'ACONDICIONADO').reduce((sum, saldo) => sum + saldo.cantidad, 0)
    const stockTotal = lote.saldos.reduce((sum, saldo) => sum + saldo.cantidad, 0)
    return { id: lote.id, numero: lote.numero, fechaProduccion: lote.fechaProduccion, fechaVencimiento: lote.fechaVencimiento, activo: lote.activo, stockTotal, stockDeposito, stockAcondicionado }
  })
  return { producto: { id: producto.id, nombre: producto.nombre }, lotes, ubicaciones }
}
