import { useEffect, useState } from 'react'
import { Section, StatusChip } from '@/components/ui'
import { apiRequest, type MovimientoStock, type Producto, type StockOverview } from '@/lib/api'

export function StockPage() {
  const [data, setData] = useState<StockOverview | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [error, setError] = useState<string | null>(null)

  async function loadData(): Promise<void> {
    try {
      const [overview, movimientosData] = await Promise.all([
        apiRequest<StockOverview>('/api/stock'),
        apiRequest<MovimientoStock[]>('/api/stock/movimientos'),
      ])
      setData(overview)
      setMovimientos(movimientosData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar stock')
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>
  }

  return (
    <div className="space-y-6">
      <Section title="Stock" description="Visión consolidada de lotes activos y alertas.">
        <div className="space-y-3">
          {(data?.productos ?? []).map((producto: Producto) => (
            <div
              key={producto.id}
              className="rounded-2xl border border-white/6 bg-[var(--surface-lowest)] p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{producto.nombre}</p>
                  <p className="text-sm text-[var(--on-surface-variant)]">
                    SKU {producto.sku} · mínimo {producto.stockMinimo} u
                  </p>
                </div>
                <StatusChip
                  label={`${producto.stock} u`}
                  tone={producto.stockBajo ? 'amber' : 'green'}
                />
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(producto.lotes ?? []).map((lote) => (
                  <div key={lote.id} className="rounded-xl border border-white/6 px-3 py-3 text-sm">
                    <p>{lote.numero}</p>
                    <p className="text-[var(--on-surface-variant)]">
                      {lote.cajas} cajas · {lote.sueltos} sueltos
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Movimientos recientes" description="Entradas manuales y salidas por pedido.">
        <div className="space-y-3">
          {movimientos.slice(0, 20).map((movimiento) => (
            <div
              key={movimiento.id}
              className="flex flex-col gap-2 rounded-2xl border border-white/6 bg-[var(--surface-lowest)] px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{movimiento.tipo}</p>
                <p className="text-sm text-[var(--on-surface-variant)]">
                  Ref. {movimiento.referencia ?? 'manual'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip
                  label={`${movimiento.cantidad > 0 ? '+' : ''}${movimiento.cantidad} u`}
                  tone={movimiento.cantidad > 0 ? 'green' : 'red'}
                />
                <span className="text-sm text-[var(--on-surface-variant)]">
                  {new Date(movimiento.createdAt).toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
