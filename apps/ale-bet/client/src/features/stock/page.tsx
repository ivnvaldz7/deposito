import { useEffect, useMemo, useState } from 'react'
import { Section, StatusChip } from '@/components/ui'
import { apiRequest, type MovimientoStock, type Producto, type StockOverview } from '@/lib/api'

export function StockPage() {
  const [data, setData] = useState<StockOverview | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

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

  const filteredProductos = useMemo(() => {
    const productos = data?.productos ?? []
    const normalizedTerm = searchTerm.trim().toLowerCase()

    if (!normalizedTerm) {
      return productos
    }

    return productos.filter((producto) => {
      const nombre = producto.nombre.toLowerCase()
      const sku = producto.sku.toLowerCase()
      return nombre.includes(normalizedTerm) || sku.includes(normalizedTerm)
    })
  }, [data?.productos, searchTerm])

  if (error) {
    return <p className="text-sm text-[var(--color-danger)]">{error}</p>
  }

  return (
    <div className="space-y-6 text-[var(--color-text)]">
      <Section title="Stock" description="Visión consolidada de lotes activos y alertas.">
        <div className="relative">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-3)]" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-[12px] py-[10px] pl-[38px] text-[13px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-3)] focus:border-[var(--color-text-3)]"
          />
        </div>

        <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <div className="grid grid-cols-[minmax(0,1fr)_220px_120px] gap-4 border-b border-[var(--color-border)] px-4 py-3 text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
            <div>Producto &amp; lotes</div>
            <div>Estado de lotes</div>
            <div className="text-right">Unidades</div>
          </div>
          {filteredProductos.map((producto: Producto) => (
            <div key={producto.id} className="grid grid-cols-[minmax(0,1fr)_220px_120px] gap-4 border-b border-[var(--color-border)] px-4 py-4 transition-colors hover:bg-[rgba(255,255,255,0.02)]">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {producto.nombre}
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-text-2)]">
                  SKU {producto.sku} · mín. {producto.stockMinimo} u
                </p>
              </div>

              <div className="flex flex-wrap items-start gap-2">
                {(producto.lotes ?? []).length > 0 ? (
                  (producto.lotes ?? []).map((lote) => (
                    <div
                      key={lote.id}
                      className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-2)]"
                    >
                      <span className="h-[6px] w-[6px] rounded-full bg-[#38d26f]" />
                      <span className="font-semibold text-[var(--color-text)]">{lote.numero}</span>
                      <span>{lote.cajas} cj · {lote.sueltos} s</span>
                    </div>
                  ))
                ) : (
                  <div className="inline-flex rounded-[6px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-3)]">
                    Sin lotes
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end justify-center text-right">
                <p
                  className={`${producto.stockBajo ? 'text-[var(--color-warning)]' : 'text-[#7ff6a1]'} text-[24px] font-bold leading-none`}
                  style={{ fontFamily: 'Montserrat, sans-serif' }}
                >
                  {producto.stock}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
                  unidades
                </p>
              </div>
            </div>
          ))}
          {filteredProductos.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--color-text-2)]">No se encontraron productos para '{searchTerm}'</p>
          ) : null}
        </div>
      </Section>

      <Section title="Movimientos recientes" description="Entradas manuales y salidas por pedido.">
        <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          {movimientos.slice(0, 20).map((movimiento) => (
            <div
              key={movimiento.id}
              className="flex flex-col gap-2 border-b border-[var(--color-border)] px-4 py-[14px] transition-colors hover:bg-[rgba(255,255,255,0.02)] md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium text-[var(--color-text)]">{movimiento.tipo}</p>
                <p className="text-sm text-[var(--color-text-2)]">
                  Ref. {movimiento.referencia ?? 'manual'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip
                  label={`${movimiento.cantidad > 0 ? '+' : ''}${movimiento.cantidad} u`}
                  tone={movimiento.cantidad > 0 ? 'green' : 'red'}
                />
                <span className="text-sm text-[var(--color-text-2)]">
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
