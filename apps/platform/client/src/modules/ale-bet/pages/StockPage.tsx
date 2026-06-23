import { useEffect, useState } from 'react'
import { aleBetApi, type StockOverview } from '../lib/api'

export default function StockPage() {
  const [data, setData] = useState<StockOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        setData(await aleBetApi.stock.get())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar stock')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) return <p className="text-sm text-[var(--color-text-2)]">Cargando stock...</p>
  if (error || !data) return <p className="text-sm text-[var(--color-danger)]">{error ?? 'Error'}</p>

  const filtered = data.productos.filter(
    (p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Stock</h1>
        <p className="text-[13px] text-[var(--color-text-2)]">Visión consolidada de inventario</p>
      </div>

      <input
        type="text"
        placeholder="Buscar producto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
      />

      <div className="app-panel overflow-hidden rounded-[12px]">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--color-text-2)]">No hay productos.</p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium text-right">Stock</th>
                <th className="px-5 py-3 font-medium text-right">Mínimo</th>
                <th className="px-5 py-3 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-5 py-4 font-semibold text-[var(--color-text)]">{p.nombre}</td>
                  <td className="px-5 py-4 text-[var(--color-text-3)]">{p.sku}</td>
                  <td className="px-5 py-4 text-right font-medium" style={{ color: p.stockBajo ? 'var(--color-danger)' : 'var(--color-text)' }}>
                    {p.stock}
                  </td>
                  <td className="px-5 py-4 text-right text-[var(--color-text-3)]">{p.stockMinimo}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${p.stockBajo ? 'bg-[rgba(239,68,68,0.08)] text-[#d6a8a8]' : 'bg-[rgba(26,107,53,0.16)] text-[#7ff6a1]'}`}>
                      {p.stockBajo ? 'Stock bajo' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Últimos movimientos */}
      <section>
        <h2 className="mb-4 text-[18px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Últimos movimientos</h2>
        <div className="app-panel overflow-hidden rounded-[12px]">
          {data.movimientos.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-[var(--color-text-2)]">Sin movimientos.</p>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
                  <th className="px-5 py-3 font-medium">Producto</th>
                  <th className="px-5 py-3 font-medium text-right">Cantidad</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-5 py-4 text-[var(--color-text-3)]">{m.productoId}</td>
                    <td className={`px-5 py-4 text-right font-medium ${m.cantidad > 0 ? 'text-[#7ff6a1]' : 'text-[var(--color-danger)]'}`}>
                      {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                    </td>
                    <td className="px-5 py-4 text-[var(--color-text-3)]">{m.tipo.replace('_', ' ')}</td>
                    <td className="px-5 py-4 text-[var(--color-text-3)]">
                      {new Date(m.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
