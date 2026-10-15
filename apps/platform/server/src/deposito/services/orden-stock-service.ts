import { Prisma, type OrdenProduccion } from '@platform/db'
import { resolveCanonicalProductName } from '../lib/producto-catalogo'
import { resolveUniqueFrascoCandidate } from '../routes/shared/frasco-inventory-resolution'

type OrdenStockData = Pick<OrdenProduccion, 'id' | 'productoId' | 'categoria' | 'productoNombre' | 'mercado' | 'cantidad'> & {
  loteIdPreferido?: string
}

export class OrdenStockError extends Error {
  constructor(readonly code: 'STOCK_INSUFICIENTE' | 'PRODUCTO_SIN_INVENTARIO' | 'MERCADO_REQUERIDO' | 'LOTE_NO_DISPONIBLE', message: string) {
    super(message)
    this.name = 'OrdenStockError'
  }
}

export type OrdenStockOutcome = {
  cantidadDescontada: number
}

function sameProductName(left: string, right: string): boolean {
  return resolveCanonicalProductName(left) === resolveCanonicalProductName(right)
}

export async function descontarStockOrden(tx: Prisma.TransactionClient, orden: OrdenStockData, actorId: string): Promise<OrdenStockOutcome> {
  const { categoria, productoNombre, productoId, cantidad, mercado, loteIdPreferido } = orden

  if (categoria === 'droga') {
    const where = productoId
      ? Prisma.sql`producto_id = ${productoId}`
      : Prisma.sql`nombre = ${productoNombre}`
    const lots = await tx.$queryRaw<Array<{ id: string; cantidad: number; lote: string | null }>>(Prisma.sql`
      SELECT id, cantidad, lote
      FROM deposito.inventario_drogas
      WHERE ${where} AND cantidad > 0
      ORDER BY CASE WHEN lote = 'APERTURA-SIN-LOTE' THEN 1 ELSE 0 END, CASE WHEN vencimiento IS NULL THEN 1 ELSE 0 END, vencimiento ASC, id ASC
      FOR UPDATE
    `)
    const loteElegido = loteIdPreferido ? lots.find((lot) => lot.id === loteIdPreferido) : undefined
    if (loteIdPreferido && !loteElegido) {
      throw new OrdenStockError('LOTE_NO_DISPONIBLE', 'El lote seleccionado ya no tiene saldo disponible para esta droga')
    }
    const lotsInOrder = loteElegido
      ? [loteElegido, ...lots.filter((lot) => lot.id !== loteElegido.id)]
      : lots
    const available = lotsInOrder.reduce((sum, lot) => sum + lot.cantidad, 0)
    const cantidadADescontar = Math.min(available, cantidad)

    let remaining = cantidadADescontar
    for (const lot of lotsInOrder) {
      if (remaining <= 0) break
      const taken = Math.min(lot.cantidad, remaining)
      const cantidadFinalDelLote = lot.cantidad - taken
      if (cantidadFinalDelLote > 0) {
        await tx.inventarioDroga.update({ where: { id: lot.id }, data: { cantidad: cantidadFinalDelLote } })
      } else {
        await tx.inventarioDroga.delete({ where: { id: lot.id } })
      }
      await tx.movimiento.create({ data: {
        tipo: 'egreso_orden', categoria, productoNombre, lote: lot.lote, cantidad: -taken,
        referenciaId: orden.id, referenciaTipo: 'orden', createdBy: actorId,
      } })
      remaining -= taken
    }
    return { cantidadDescontada: cantidadADescontar }
  }

  if (categoria === 'estuche' || categoria === 'etiqueta') {
    if (!mercado) throw new OrdenStockError('MERCADO_REQUERIDO', `El mercado es obligatorio para ${categoria}s`)
    const target = categoria === 'estuche'
      ? productoId
        ? await tx.inventarioEstuche.findFirst({ where: { productoId, mercado }, select: { id: true, cantidad: true } })
        : (await tx.inventarioEstuche.findMany({ where: { mercado }, select: { id: true, articulo: true, cantidad: true } })).find((row) => sameProductName(row.articulo, productoNombre)) ?? null
      : productoId
        ? await tx.inventarioEtiqueta.findFirst({ where: { productoId, mercado }, select: { id: true, cantidad: true } })
        : (await tx.inventarioEtiqueta.findMany({ where: { mercado }, select: { id: true, articulo: true, cantidad: true } })).find((row) => sameProductName(row.articulo, productoNombre)) ?? null
    // Un artículo recién creado puede no tener aún una fila de inventario. En
    // lugar de rechazar la orden, se conserva pendiente hasta poder entregarlo.
    if (!target) return { cantidadDescontada: 0 }
    const cantidadADescontar = Math.min(target.cantidad, cantidad)
    if (cantidadADescontar <= 0) return { cantidadDescontada: 0 }
    const updated = categoria === 'estuche'
      ? await tx.inventarioEstuche.updateMany({ where: { id: target.id, cantidad: { gte: cantidadADescontar } }, data: { cantidad: { decrement: cantidadADescontar } } })
      : await tx.inventarioEtiqueta.updateMany({ where: { id: target.id, cantidad: { gte: cantidadADescontar } }, data: { cantidad: { decrement: cantidadADescontar } } })
    if (updated.count !== 1) throw new OrdenStockError('STOCK_INSUFICIENTE', `El stock de "${productoNombre}" cambió; reintentá la entrega`)
    await tx.movimiento.create({ data: {
      tipo: 'egreso_orden', categoria, productoNombre, cantidad: -cantidadADescontar,
      referenciaId: orden.id, referenciaTipo: 'orden', createdBy: actorId,
    } })
    return { cantidadDescontada: cantidadADescontar }
  } else if (categoria === 'frasco') {
    const rows = productoId
      ? await tx.$queryRaw<Array<{ id: string; total: number; unidadesPorCaja: number }>>(Prisma.sql`
          SELECT id, total, unidades_por_caja AS "unidadesPorCaja"
          FROM deposito.inventario_frascos WHERE producto_id = ${productoId} FOR UPDATE
        `)
      : []
    const legacyCandidates = productoId ? [] : await tx.inventarioFrasco.findMany({ select: { id: true, articulo: true, unidadesPorCaja: true, total: true } })
    const legacyCandidate = productoId ? null : resolveUniqueFrascoCandidate(productoNombre, legacyCandidates)
    const lockedLegacy = legacyCandidate
      ? await tx.$queryRaw<Array<{ id: string; total: number; unidadesPorCaja: number }>>(Prisma.sql`
          SELECT id, total, unidades_por_caja AS "unidadesPorCaja"
          FROM deposito.inventario_frascos WHERE id = ${legacyCandidate.id} FOR UPDATE
        `)
      : []
    const frasco = rows[0] ?? lockedLegacy[0] ?? null
    if (!frasco) return { cantidadDescontada: 0 }
    const cantidadADescontar = Math.min(frasco.total, cantidad)
    if (cantidadADescontar <= 0) return { cantidadDescontada: 0 }
    const totalRestante = frasco.total - cantidadADescontar
    const updated = await tx.inventarioFrasco.updateMany({
      where: { id: frasco.id, total: { gte: cantidadADescontar } },
      data: { total: totalRestante, cantidadCajas: Math.floor(totalRestante / frasco.unidadesPorCaja) },
    })
    if (updated.count !== 1) throw new OrdenStockError('STOCK_INSUFICIENTE', `El stock de "${productoNombre}" cambió; reintentá la entrega`)
    await tx.movimiento.create({ data: {
      tipo: 'egreso_orden', categoria, productoNombre, cantidad: -cantidadADescontar,
      referenciaId: orden.id, referenciaTipo: 'orden', createdBy: actorId,
    } })
    return { cantidadDescontada: cantidadADescontar }
  }

  return { cantidadDescontada: 0 }
}
