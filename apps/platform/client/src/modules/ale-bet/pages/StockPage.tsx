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

      <div className="bg-surface-container-high rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No hay productos.</p>
        ) : (
          <table className="w-full text-left font-body text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                <th className="px-5 py-3 font-semibold">Producto</th>
                <th className="px-5 py-3 font-semibold">SKU</th>
                <th className="px-5 py-3 font-semibold text-right">Físico</th>
                <th className="px-5 py-3 font-semibold text-right">Reservado</th>
                <th className="px-5 py-3 font-semibold text-right">Disponible</th>
                <th className="px-5 py-3 font-semibold text-right">Mínimo</th>
                <th className="px-5 py-3 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-white/10 hover:bg-surface-variant/30">
                  <td className="px-5 py-4 font-semibold text-on-surface">{p.nombre}</td>
                  <td className="px-5 py-4 text-on-surface-variant font-medium">{p.sku}</td>
                  <td className="px-5 py-4 text-right">{p.fisico}</td>
                  <td className="px-5 py-4 text-right text-on-surface-variant">{p.reservado}</td>
                  <td className="px-5 py-4 text-right font-semibold text-[15px]">{p.disponible}</td>
                  <td className="px-5 py-4 text-right text-on-surface-variant font-medium">{p.stockMinimo}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 font-medium text-[11px] ${p.stockBajo ? 'bg-error/20 text-error' : 'border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]'}`}>
                      {p.stockBajo ? 'BAJO' : 'OK'}
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
        <h2 className="mb-4 text-[18px] font-semibold text-on-surface">Últimos movimientos</h2>
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
              <tbody className="text-[13px]">
                {data.movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-white/10 hover:bg-surface-variant/30">
                    <td className="px-5 py-4 whitespace-nowrap text-on-surface-variant">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-on-surface-variant font-medium">{m.productoId}</td>
                    <td className={`px-5 py-4 text-right font-semibold ${m.cantidad > 0 ? 'text-success' : 'text-error'}`}>
                      {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                    </td>
                    <td className="px-5 py-4 text-on-surface-variant">{m.tipo.replace('_', ' ')}</td>
                    <td className="px-5 py-4 text-on-surface-variant">
                      {m.usuarioId}
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
