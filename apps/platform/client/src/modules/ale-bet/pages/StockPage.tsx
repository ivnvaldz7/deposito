import { useState, Fragment } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useStockOverview } from '../queries'
import { type Producto, type Lote } from '../lib/api'
import { matchesFunctionalProductSearch } from '../lib/logistics-display'

function LotesInline({ producto }: { producto: Producto }) {
  const lotes = producto.lotes || []

  if (lotes.length === 0) {
    return <div className="py-4 text-center font-body text-[12px] text-on-surface-variant">Sin lotes.</div>
  }

  return (
    <div className="p-4 bg-surface-container-highest/10 md:p-5">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lotes.map((l) => (
          <div key={l.id} className="rounded-xl border border-white/10 bg-surface-container-high p-4">
            <div className="mb-3">
              <span className="font-semibold text-[14px] text-primary">{l.numero}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-surface-container/50 p-2 text-center">
              <div>
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Depósito</p>
                <p className="mt-0.5 text-[15px] font-semibold text-on-surface">{l.stockDeposito}</p>
              </div>
              <div>
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Acondicionado</p>
                <p className="mt-0.5 text-[15px] font-semibold text-on-surface">{l.stockAcondicionado}</p>
              </div>
              <div>
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p>
                <p className="mt-0.5 text-[15px] font-semibold text-on-surface">{l.stockTotal}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StockPage() {
  const { data, isLoading, error } = useStockOverview()
  const [search, setSearch] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  function toggleRow(id: string) {
    setExpandedRow((prev) => (prev === id ? null : id))
  }

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando stock...</p>
  if (error || !data) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar stock'}</p>

  const filtered = data.productos.filter((p) => matchesFunctionalProductSearch(p, search))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Stock</h1>
        <p className="font-body text-[13px] text-on-surface-variant">Visión consolidada de inventario</p>
      </div>

      <input
        type="text"
        placeholder="Buscar producto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field max-w-sm"
      />

      <div className="bg-surface-container-high rounded-xl overflow-hidden" data-testid="stock-table">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No hay productos.</p>
        ) : (
          <table className="w-full text-left font-body text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                <th className="px-5 py-3 font-semibold w-1/3">Nombre</th>
                <th className="px-5 py-3 font-semibold text-right">Total</th>
                <th className="px-5 py-3 font-semibold text-right">Depósito</th>
                <th className="px-5 py-3 font-semibold text-right">Acondicionado</th>
                <th className="px-5 py-3 font-semibold text-right w-24">Lotes</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {filtered.map((p) => {
                const isExpanded = expandedRow === p.id
                return (
                  <Fragment key={p.id}>
                    <tr
                      onClick={() => toggleRow(p.id)}
                      className={`border-b border-white/10 last:border-0 cursor-pointer transition hover:bg-surface-variant/30 ${isExpanded ? 'bg-surface-variant/20 border-b-0' : ''}`}
                    >
                      <td className="px-5 py-4 font-semibold text-on-surface">{p.nombre}</td>
                      <td className="px-5 py-4 text-right font-medium text-on-surface">{p.stockTotal}</td>
                      <td className="px-5 py-4 text-right text-on-surface-variant">{p.stockDeposito}</td>
                      <td className="px-5 py-4 text-right text-on-surface-variant">{p.stockAcondicionado}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end text-on-surface-variant">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-white/10 last:border-0">
                        <td colSpan={5} className="p-0">
                          <LotesInline producto={p} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
