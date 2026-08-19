import { useState, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { type Producto } from '../lib/api'
import { useProductos, useCreateProducto, useUpdateProducto, useDeleteProducto } from '../queries'
import { toast } from '@/lib/toast'
import { matchesFunctionalProductSearch, formatOptionalDate } from '../lib/logistics-display'
import { GestionarStockModal } from '../components/GestionarStockModal'
import { HistorialLotesModal } from '../components/HistorialLotesModal'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { canGestionarStock } from '../lib/estados'

function LotesInline({ producto }: { producto: Producto }) {
  if (!producto.lotes || producto.lotes.length === 0) {
    return <div className="py-6 text-center font-body text-[12px] text-on-surface-variant">No hay lotes activos.</div>
  }

  const activos = producto.lotes.filter(l => l.activo)
  if (activos.length === 0) {
    return <div className="py-6 text-center font-body text-[12px] text-on-surface-variant">No hay lotes activos.</div>
  }

  return (
    <div className="p-4 bg-surface-container-highest/10 md:p-5">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {activos.map(l => (
          <div key={l.id} className="rounded-xl border border-white/10 bg-surface-container-high p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[14px] text-primary">LOTE {l.numero}</span>
              <span className="font-body text-[11px] text-on-surface-variant">Vto: {formatOptionalDate(l.fechaVencimiento)}</span>
            </div>
            <div className="mt-3 flex justify-between rounded-lg bg-surface-container/50 p-2 text-center">
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

export default function ProductosPage() {
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol
  const esAdmin = rol === 'admin'
  const puedeGestionarStock = canGestionarStock(rol)

  const { data: productos = [], isLoading, error } = useProductos()
  const createMutation = useCreateProducto()
  const updateMutation = useUpdateProducto()
  const deleteMutation = useDeleteProducto()

  const location = useLocation()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState({ nombre: '', sku: '', stockMinimo: 100, unidadesPorCaja: 0 })
  const [stockProducto, setStockProducto] = useState<Producto | null>(null)
  const [showHistorialModal, setShowHistorialModal] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  function toggleRow(id: string) {
    setExpandedRow(prev => prev === id ? null : id)
  }

  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', sku: '', stockMinimo: 100, unidadesPorCaja: 0 })
    setShowModal(true)
  }

  function openEdit(p: Producto, e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(p)
    setForm({ nombre: p.nombre, sku: p.sku, stockMinimo: p.stockMinimo, unidadesPorCaja: p.unidadesPorCaja })
    setShowModal(true)
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, nombre: form.nombre, stockMinimo: form.stockMinimo })
      } else {
        await createMutation.mutateAsync(form)
      }
      setShowModal(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('¿Eliminar producto?')) return
    deleteMutation.mutate(id, {
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al eliminar'),
    })
  }

  function openGestionarStock(p: Producto, e: React.MouseEvent) {
    e.stopPropagation()
    setStockProducto(p)
  }

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando productos...</p>
  if (error) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar productos'}</p>

  const filtered = productos.filter((p) => matchesFunctionalProductSearch(p, search))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Productos</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Catálogo y administración de stock</p>
        </div>
        {esAdmin && (
          <button onClick={openCreate} className="shrink-0 rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
            + Nuevo producto
          </button>
        )}
      </div>

      <div className="flex gap-4 items-center">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-lg border border-white/10 bg-surface-container-high px-4 py-2 font-body text-[13px] text-on-surface focus:border-primary focus:outline-none"
        />
        {puedeGestionarStock && (
          <button
            onClick={() => setShowHistorialModal(true)}
            className="rounded-full border border-white/10 px-4 py-2 font-body text-[13px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
          >
            Historial de lotes
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          No hay productos que coincidan.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface-container-high" data-testid="productos-table">
          <table className="w-full text-left font-body text-[13px]">
            <thead>
              <tr className="border-b border-white/10 text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                <th className="px-5 py-4 font-semibold">Producto</th>
                <th className="px-5 py-4 font-semibold">Lotes</th>
                <th className="px-5 py-4 font-semibold text-right">Total</th>
                <th className="px-5 py-4 font-semibold text-right">Depósito</th>
                <th className="px-5 py-4 font-semibold text-right">Acondicionado</th>
                {(puedeGestionarStock || esAdmin) && (
                  <th className="px-5 py-4 font-semibold text-right">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isExpanded = expandedRow === p.id
                const lotesCount = p.lotes?.filter(l => l.activo).length ?? 0
                return (
                  <Fragment key={p.id}>
                    <tr 
                      onClick={() => toggleRow(p.id)}
                      className={`border-b border-white/10 last:border-0 cursor-pointer transition hover:bg-surface-variant/30 ${isExpanded ? 'bg-surface-variant/20 border-b-0' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <p className="text-[16px] font-semibold text-on-surface">{p.nombre}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-[15px] font-medium text-on-surface-variant">
                          {lotesCount} {lotesCount === 1 ? 'lote' : 'lotes'}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <p className="text-[16px] font-semibold text-on-surface">{p.stockTotal}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <p className="text-[16px] font-medium text-on-surface-variant">{p.stockDeposito}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-4">
                          <p className="text-[16px] font-medium text-on-surface-variant">{p.stockAcondicionado}</p>
                          {!(puedeGestionarStock || esAdmin) && (
                            <div className="text-on-surface-variant transition-colors group-hover:text-on-surface">
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          )}
                        </div>
                      </td>
                      {(puedeGestionarStock || esAdmin) && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-4">
                            <div className="flex justify-end gap-2">
                              {puedeGestionarStock && (
                                <button 
                                  onClick={(e) => openGestionarStock(p, e)}
                                  className="rounded-full border border-primary px-4 py-1.5 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
                                >
                                  Gestionar stock
                                </button>
                              )}
                              {esAdmin && (
                                <>
                                  <button 
                                    onClick={(e) => openEdit(p, e)}
                                    className="rounded-full border border-white/10 px-3 py-1.5 font-body text-[12px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
                                  >
                                    Editar
                                  </button>
                                  <button 
                                    onClick={(e) => handleDelete(p.id, e)}
                                    className="rounded-full border border-error/40 px-3 py-1.5 font-body text-[12px] text-error transition hover:bg-error/10"
                                  >
                                    Eliminar
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="text-on-surface-variant transition-colors group-hover:text-on-surface">
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-white/10 last:border-0">
                        <td colSpan={(puedeGestionarStock || esAdmin) ? 6 : 5} className="p-0">
                          <LotesInline producto={p} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Producto modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[18px] font-semibold text-on-surface">
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <div className="space-y-4">
              <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="input-field" />

              <div>
                <label className="font-body text-[11px] text-outline">Stock mínimo</label>
                <input type="number" min={0} value={form.stockMinimo} onChange={(e) => setForm({ ...form, stockMinimo: Number(e.target.value) })}
                  className="input-field mt-1" />
              </div>
              {!editing && (
                <div>
                  <label className="font-body text-[11px] text-outline">Unidades por caja</label>
                  <input type="number" min={1} value={form.unidadesPorCaja || ''} onChange={(e) => setForm({ ...form, unidadesPorCaja: Number(e.target.value) })}
                    className="input-field mt-1" required />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cancelar</button>
                <button onClick={handleSave} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
                  {editing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gestionar Stock modal */}
      {stockProducto && (
        <GestionarStockModal 
          producto={stockProducto} 
          onClose={() => setStockProducto(null)} 
        />
      )}

      {/* Historial de lotes modal */}
      {showHistorialModal && (
        <HistorialLotesModal
          productos={productos}
          onClose={() => setShowHistorialModal(false)}
        />
      )}
    </div>
  )
}
