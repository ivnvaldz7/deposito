import { aggregateLotStock } from './stock-aggregation'
import { compareStockProjectionProducts } from './stock-projection/snapshot'
import type { StockPdfInput } from './stock-pdf'

type ProductForReport = {
  id: string
  nombre: string
  lotes: Array<{
    id: string
    numero: string
    createdAt: Date
    fechaVencimiento: Date | null
    saldos: Array<{ cantidad: number; ubicacion: { codigo: string } }>
  }>
}

function formatExpiration(value: Date | null): string {
  if (!value) return 'Sin informar'
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(value)
}

export function buildStockPdfInput(products: ProductForReport[], generatedAt = new Date()): StockPdfInput {
  const productos = products
    .map((producto) => ({
      id: producto.id,
      nombre: producto.nombre,
      lotes: producto.lotes
        .map((lote) => ({ ...lote, ...aggregateLotStock(lote) }))
        .filter((lote) => lote.stockTotal > 0)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
        .map((lote) => ({
          numero: lote.numero,
          vencimiento: formatExpiration(lote.fechaVencimiento),
          deposito: lote.stockDeposito,
          acondicionado: lote.stockAcondicionado,
          total: lote.stockTotal,
        })),
    }))
    .filter((producto) => producto.lotes.length > 0)
    .sort(compareStockProjectionProducts)

  return {
    generado: new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(generatedAt),
    productos: productos.map(({ nombre, lotes }) => ({ nombre, lotes })),
  }
}
