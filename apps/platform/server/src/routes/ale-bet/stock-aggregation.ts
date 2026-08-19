export type StockSaldosInput = {
  saldos: Array<{
    cantidad: number
    ubicacion: { codigo: string }
  }>
}

export function aggregateLotStock<T extends StockSaldosInput>(lote: T) {
  const saldos = lote.saldos ?? []
  const stockDeposito = saldos
    .filter((saldo) => saldo.ubicacion.codigo === 'DEPOSITO')
    .reduce((total, saldo) => total + saldo.cantidad, 0)
  const stockAcondicionado = saldos
    .filter((saldo) => saldo.ubicacion.codigo === 'ACONDICIONADO')
    .reduce((total, saldo) => total + saldo.cantidad, 0)
  const stockTotal = stockDeposito + stockAcondicionado
  return { stockTotal, stockDeposito, stockAcondicionado }
}

export function aggregateProductStock<T extends StockSaldosInput>(producto: { lotes: T[] }) {
  const lotes = producto.lotes.map((lote) => ({ ...lote, ...aggregateLotStock(lote) }))
  const stockTotal = lotes.reduce((total, lote) => total + lote.stockTotal, 0)
  const stockDeposito = lotes.reduce((total, lote) => total + lote.stockDeposito, 0)
  const stockAcondicionado = lotes.reduce((total, lote) => total + lote.stockAcondicionado, 0)
  return { lotes, stockTotal, stockDeposito, stockAcondicionado }
}

export type ProductoConStockYReservas = {
  stockMinimo: number
  lotes: Array<
    StockSaldosInput & {
      reservas?: Array<{ cantidad: number; estado?: string }>
    }
  >
}

export function aggregateProductAvailability<T extends ProductoConStockYReservas>(producto: T) {
  const aggregated = aggregateProductStock(producto)
  const reservado = producto.lotes.reduce((total, lote) => {
    const active = (lote.reservas ?? []).filter(
      (reserva) => reserva.estado === undefined || reserva.estado === 'ACTIVA',
    )
    return total + active.reduce((sum, reserva) => sum + reserva.cantidad, 0)
  }, 0)
  return {
    ...aggregated,
    reservado,
    disponible: aggregated.stockTotal - reservado,
    stockBajo: aggregated.stockTotal < producto.stockMinimo,
  }
}
