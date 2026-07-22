import { useState } from 'react'
import { useStockOverview } from '../queries'

export default function StockPage() {
  const { data, isLoading, error } = useStockOverview()
  const [search, setSearch] = useState('')

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando stock...</p>
  if (error || !data) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar stock'}</p>

  const filtered = data.productos.filter(
    (p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-[28px] font-bold tracking-[-0.03em] text-on-surface">Stock</h1>
        <p className="font-body text-[13px] text-on-surface-variant">Visión consolidada de inventario</p>
      </div>

      <input
        type="text"
        placeholder="Buscar producto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field max-w-sm"
      />

      <div className="bg-surface-container-high rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No hay productos.</p>
        ) : (
          <table className="w-full text-left font-body text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium text-right">Stock</th>
                <th className="px-5 py-3 font-medium text-right">Mínimo</th>
                <th className="px-5 py-3 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-white/10 last:border-0">
                  <td className="px-5 py-4 font-semibold text-on-surface">{p.nombre}</td>
                  <td className="px-5 py-4 text-outline">{p.sku}</td>
                  <td className={`px-5 py-4 text-right font-medium ${p.stockBajo ? 'text-error' : 'text-on-surface'}`}>
                    {p.stock}
                  </td>
                  <td className="px-5 py-4 text-right text-outline">{p.stockMinimo}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 font-heading font-semibold text-xs ${p.stockBajo ? 'bg-error/20 text-error' : 'bg-success/20 text-success'}`}>
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
        <h2 className="mb-4 font-heading text-[18px] font-bold text-on-surface">Últimos movimientos</h2>
        <div className="bg-surface-container-high rounded-xl overflow-hidden">
          {data.movimientos.length === 0 ? (
            <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">Sin movimientos.</p>
          ) : (
            <table className="w-full text-left font-body text-[12px]">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                  <th className="px-5 py-3 font-medium">Producto</th>
                  <th className="px-5 py-3 font-medium text-right">Cantidad</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-white/10 last:border-0">
                    <td className="px-5 py-4 text-outline">{m.productoId}</td>
                    <td className={`px-5 py-4 text-right font-medium ${m.cantidad > 0 ? 'text-primary' : 'text-error'}`}>
                      {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                    </td>
                    <td className="px-5 py-4 text-outline">{m.tipo.replace('_', ' ')}</td>
                    <td className="px-5 py-4 text-outline">
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
