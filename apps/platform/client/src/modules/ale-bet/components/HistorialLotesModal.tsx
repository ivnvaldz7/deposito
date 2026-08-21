import { useState } from 'react'
import { X } from 'lucide-react'
import { type Producto } from '../lib/api'
import { useLotesHistorial } from '../queries/use-productos'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'

interface HistorialLotesModalProps {
  productos: Producto[]
  onClose: () => void
}

export function HistorialLotesModal({ productos, onClose }: HistorialLotesModalProps) {
  const user = useAuthStore((s) => s.user)
  const [selectedProductoId, setSelectedProductoId] = useState<string>('')
  const [estadoFilter, setEstadoFilter] = useState<'TODOS' | 'ACTIVOS' | 'ARCHIVADOS'>('TODOS')
  const [searchTerm, setSearchTerm] = useState('')

  const { data: lotes, isLoading, error } = useLotesHistorial(
    selectedProductoId,
    !!selectedProductoId
  )

  const filteredLotes = (lotes || []).filter((l) => {
    if (estadoFilter === 'ACTIVOS' && !l.activo) return false
    if (estadoFilter === 'ARCHIVADOS' && l.activo) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      if (!l.numero.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="flex h-[90vh] w-[95vw] max-w-5xl flex-col rounded-xl border border-white/10 bg-surface-container-low" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <h2 className="text-[18px] font-semibold text-on-surface">Historial de lotes</h2>
          <button onClick={onClose} className="rounded-full p-2 text-on-surface-variant hover:bg-white/5 hover:text-on-surface transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-center">
          <div className="flex-1">
            <label className="mb-1 block font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
              Producto
            </label>
            <select
              value={selectedProductoId}
              onChange={(e) => setSelectedProductoId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-container-high px-3 py-2 font-body text-[13px] text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="">Seleccione un producto...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-48">
            <label className="mb-1 block font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as any)}
              className="w-full rounded-lg border border-white/10 bg-surface-container-high px-3 py-2 font-body text-[13px] text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              {can(user, 'ale-bet', 'stock.read.archived') && (
                <option value="ARCHIVADOS">Archivados</option>
              )}
            </select>
          </div>

          <div className="w-full md:w-64">
            <label className="mb-1 block font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
              Buscar lote
            </label>
            <input
              type="text"
              placeholder="Ej: LOTE-123..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-container-high px-3 py-2 font-body text-[13px] text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!selectedProductoId ? (
            <div className="flex h-full items-center justify-center text-center font-body text-[13px] text-on-surface-variant">
              Seleccione un producto para ver el historial de sus lotes.
            </div>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center text-center font-body text-[13px] text-on-surface-variant">
              Cargando historial...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-center font-body text-[13px] text-error">
              Error al cargar el historial
            </div>
          ) : filteredLotes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center font-body text-[13px] text-on-surface-variant">
              No se encontraron lotes.
            </div>
          ) : (
            <div className="space-y-6">
              {filteredLotes.map((lote) => (
                <div key={lote.id} className="rounded-xl border border-white/10 bg-surface-container-high overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-surface-container-highest/20 p-4">
                    <div>
                      <h3 className="text-[16px] font-semibold text-primary">{lote.numero}</h3>
                      <p className="font-body text-[12px] text-on-surface-variant">
                        Estado: <span className={lote.activo ? 'text-green-400' : 'text-orange-400'}>{lote.activo ? 'Activo' : 'Archivado'}</span>
                      </p>
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Producido</p>
                        <p className="text-[13px] text-on-surface">{lote.fechaProduccion ? new Date(lote.fechaProduccion).toLocaleDateString() : '-'}</p>
                      </div>
                      <div>
                        <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Vencimiento</p>
                        <p className="text-[13px] text-on-surface">{lote.fechaVencimiento ? new Date(lote.fechaVencimiento).toLocaleDateString() : '-'}</p>
                      </div>
                      <div className="flex gap-4 rounded-lg bg-surface-container/50 px-3 py-1">
                        <div className="text-center">
                          <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p>
                          <p className="text-[14px] font-bold text-on-surface">{lote.stockTotal}</p>
                        </div>
                        <div className="text-center">
                          <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Dep</p>
                          <p className="text-[14px] font-semibold text-on-surface-variant">{lote.stockDeposito}</p>
                        </div>
                        <div className="text-center">
                          <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Acond</p>
                          <p className="text-[14px] font-semibold text-on-surface-variant">{lote.stockAcondicionado}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <h4 className="mb-3 font-body text-[13px] font-semibold text-on-surface">Últimos Movimientos</h4>
                    {lote.movimientos && lote.movimientos.length > 0 ? (
                      <table className="w-full text-left font-body text-[12px]">
                        <thead>
                          <tr className="border-b border-white/5 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
                            <th className="py-2">Fecha</th>
                            <th className="py-2">Tipo</th>
                            <th className="py-2">Referencia</th>
                            <th className="py-2 text-right">Cantidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lote.movimientos.map((m) => (
                            <tr key={m.id} className="border-b border-white/5 last:border-0">
                              <td className="py-2 text-on-surface">{new Date(m.createdAt).toLocaleString()}</td>
                              <td className="py-2 text-on-surface">{m.tipo}</td>
                              <td className="py-2 text-on-surface-variant">{m.referencia || '-'}</td>
                              <td className={`py-2 text-right font-semibold ${m.cantidad > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="font-body text-[12px] text-on-surface-variant">No hay movimientos registrados.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
