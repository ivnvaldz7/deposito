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
    return <p className="text-sm text-rose-300">{error}</p>
  }

  return (
    <div className="space-y-6 bg-[#0d0d0d] text-white">
      <Section title="Stock" description="Visión consolidada de lotes activos y alertas.">
        <div className="relative">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4b5563]" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full rounded-[8px] border border-[#1e1e1e] bg-[#111111] px-[12px] py-[10px] pl-[38px] text-[13px] text-white outline-none placeholder:text-[#4b5563] focus:border-[#374151]"
          />
        </div>

        <div className="overflow-hidden rounded-[8px] border border-[#1e1e1e] bg-[#0d0d0d]">
          {filteredProductos.map((producto: Producto) => (
            <div
              key={producto.id}
              className="border-b border-[#161616] px-4 py-[14px] transition-colors hover:bg-[#111111]"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-white" style={{ fontFamily: 'Montserrat, sans-serif' }}>{producto.nombre}</p>
                  <p className="text-sm text-[#6b7280]">
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
                  <div key={lote.id} className="rounded-[8px] border border-[#1e1e1e] bg-[#111111] px-3 py-3 text-sm">
                    <p className="text-white">{lote.numero}</p>
                    <p className="text-[#6b7280]">
                      {lote.cajas} cajas · {lote.sueltos} sueltos
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredProductos.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#6b7280]">No se encontraron productos para '{searchTerm}'</p>
          ) : null}
        </div>
      </Section>

      <Section title="Movimientos recientes" description="Entradas manuales y salidas por pedido.">
        <div className="overflow-hidden rounded-[8px] border border-[#1e1e1e] bg-[#0d0d0d]">
          {movimientos.slice(0, 20).map((movimiento) => (
            <div
              key={movimiento.id}
              className="flex flex-col gap-2 border-b border-[#161616] px-4 py-[14px] transition-colors hover:bg-[#111111] md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium text-white">{movimiento.tipo}</p>
                <p className="text-sm text-[#6b7280]">
                  Ref. {movimiento.referencia ?? 'manual'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip
                  label={`${movimiento.cantidad > 0 ? '+' : ''}${movimiento.cantidad} u`}
                  tone={movimiento.cantidad > 0 ? 'green' : 'red'}
                />
                <span className="text-sm text-[#6b7280]">
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
