import { useState, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, ChevronUp, Check, AlertTriangle, X } from 'lucide-react'
import { type Producto, type Lote } from '../lib/api'
import { calcularUnidades, maxSueltos } from '../lib/constants'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/Badge'
import { useProductos, useCreateProducto, useUpdateProducto, useDeleteProducto, useLotes, useUpdateLote } from '../queries'
import { StockIndicator } from '../components/StockIndicator'
import { toast } from '@/lib/toast'

function stockBadge(p: Producto) {
  if (p.disponible <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-error/30 bg-error/10 px-2.5 py-1 text-[12px] font-semibold text-error">
        <X className="h-3 w-3" /> Sin stock
      </span>
    )
  }
  if (p.stockBajo) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D5B4B5] bg-[#F5ECEC] px-2.5 py-1 text-[12px] font-semibold text-[#A06869]">
        <AlertTriangle className="h-3 w-3" /> Stock bajo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[12px] font-semibold text-success">
      <Check className="h-3 w-3" /> Disponible
    </span>
  )
}

function LotesInline({ producto }: { producto: Producto }) {
  const { data: lotes = [], isLoading } = useLotes(producto.id)

  if (isLoading) {
    return <div className="py-6 text-center font-body text-[12px] text-on-surface-variant">Cargando lotes...</div>
  }

  const activos = lotes.filter(l => l.activo)
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
              <span className="font-body text-[11px] text-on-surface-variant">Vto: {new Date(l.fechaVencimiento).toLocaleDateString('es-AR')}</span>
            </div>
            <div className="mt-3 flex justify-between rounded-lg bg-surface-container/50 p-2 text-center">
              <div>
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Cajas</p>
                <p className="mt-0.5 text-[15px] font-semibold text-on-surface">{l.cajas}</p>
              </div>
              <div>
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Sueltos</p>
                <p className="mt-0.5 text-[15px] font-semibold text-on-surface">{l.sueltos}</p>
              </div>
              <div>
                <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p>
                <p className="mt-0.5 text-[15px] font-semibold text-on-surface">{l.unidades}</p>
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
  const rol = user?.apps?.['ale-bet']?.rol ?? ''
  const esAdmin = rol === 'admin'

  const { data: productos = [], isLoading, error } = useProductos()
  const createMutation = useCreateProducto()
  const updateMutation = useUpdateProducto()
  const deleteMutation = useDeleteProducto()
  const updateLoteMutation = useUpdateLote()

  const location = useLocation()
  const [search, setSearch] = useState('')
  const [soloCritico, setSoloCritico] = useState((location.state as any)?.stockCritico ?? false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState({ nombre: '', sku: '', stockMinimo: 100, unidadesPorCaja: 0 })
  const [lotesProducto, setLotesProducto] = useState<Producto | null>(null)
  const { data: lotes = [] } = useLotes(lotesProducto?.id ?? '')
  const [editingLoteId, setEditingLoteId] = useState<string | null>(null)
  const [editLoteForm, setEditLoteForm] = useState({ cajas: 0, sueltos: 0 })
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

  function openLotes(p: Producto, e: React.MouseEvent) {
    e.stopPropagation()
    setLotesProducto(p)
    setEditingLoteId(null)
  }

  function startEditLote(l: Lote, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingLoteId(l.id)
    setEditLoteForm({ cajas: l.cajas, sueltos: l.sueltos })
  }

  async function handleSaveLote(l: Lote) {
    if (!lotesProducto) return
    try {
      await updateLoteMutation.mutateAsync({
        productoId: lotesProducto.id,
        loteId: l.id,
        cajas: editLoteForm.cajas,
        sueltos: editLoteForm.sueltos,
      })
      setEditingLoteId(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar lote')
    }
  }

  function cancelEditLote() {
    setEditingLoteId(null)
  }

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando productos...</p>
  if (error) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar productos'}</p>

  const filtered = productos.filter((p) => {
    if (soloCritico && !p.stockBajo) return false
    return p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Productos</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Catálogo y stock de productos</p>
        </div>
        {esAdmin && (
          <button onClick={openCreate} className="shrink-0 rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
            + Nuevo producto
          </button>
        )}
      </div>

      <div className="flex gap-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar producto o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-container-high px-4 py-2 font-body text-[13px] text-on-surface focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setSoloCritico(!soloCritico)}
              className={`shrink-0 rounded-lg border px-4 py-2 font-body text-[13px] font-medium transition-colors ${
                soloCritico
                  ? 'border-error/40 bg-error/20 text-error'
                  : 'border-white/10 bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Stock crítico
            </button>
          </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-surface-container-high rounded-xl px-5 py-4">
          <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p>
          <p className="mt-1 text-[24px] font-semibold text-on-surface">{productos.length}</p>
        </div>
        <div className="bg-surface-container-high rounded-xl px-5 py-4">
          <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Stock bajo</p>
          <p className="mt-1 text-[24px] font-semibold text-error">
            {productos.filter((p) => p.stockBajo).length}
          </p>
        </div>
        <div className="bg-surface-container-high rounded-xl px-5 py-4">
          <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Stock total</p>
          <p className="mt-1 text-[24px] font-semibold text-on-surface">
            {productos.reduce((s, p) => s + p.stock, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          No hay productos.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden" data-testid="productos-mobile">
            {filtered.map((p) => {
              const isExpanded = expandedRow === p.id
              const lotesCount = p.lotes?.filter(l => l.activo).length ?? 0
              return (
                <article
                  key={p.id}
                  className="rounded-xl border border-white/10 bg-surface-container-high overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer select-none transition hover:bg-surface-variant/30"
                    onClick={() => toggleRow(p.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold text-on-surface">{p.nombre}</p>
                        <p className="mt-1 font-body text-[13px] font-medium text-on-surface-variant">SKU: {p.sku}</p>
                        <p className="mt-0.5 font-body text-[12px] font-medium text-on-surface-variant">
                           {lotesCount} {lotesCount === 1 ? 'Lote activo' : 'Lotes activos'}
                        </p>
                      </div>
                      <div className="shrink-0 text-on-surface-variant">
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-baseline gap-2">
                        <span className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">Disponible</span>
                        <span className="text-[20px] font-semibold text-on-surface">{p.disponible}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 font-body text-[13px] text-on-surface-variant">
                        <span>Físico {p.fisico}</span>
                        <span className="text-white/20">·</span>
                        <span>Reservado {p.reservado}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      {stockBadge(p)}
                    </div>

                    {esAdmin && isExpanded && (
                      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => openEdit(p, e)}
                          className="min-h-11 rounded-full border border-primary px-4 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(p.id, e)}
                          className="min-h-11 rounded-full border border-error/40 px-4 font-body text-[12px] font-semibold text-error transition hover:bg-error/10"
                        >
                          Eliminar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => openLotes(p, e)}
                          className="ml-auto min-h-11 rounded-full border border-white/10 px-4 font-body text-[12px] font-semibold text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
                        >
                          Config
                        </button>
                      </div>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="border-t border-white/10">
                      <LotesInline producto={p} />
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-xl bg-surface-container-high md:block" data-testid="productos-table">
            <table className="w-full text-left font-body text-[13px]">
              <thead>
                <tr className="border-b border-white/10 text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                  <th className="px-5 py-4 font-semibold w-1/2">Producto</th>
                  <th className="px-5 py-4 font-semibold w-1/4">Stock</th>
                  <th className="px-5 py-4 font-semibold w-1/4 text-right">Estado</th>
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
                          <div className="mt-1 flex items-center gap-3">
                            <p className="font-body text-[13px] font-medium text-on-surface-variant">SKU: {p.sku}</p>
                            <span className="text-white/20">·</span>
                            <p className="font-body text-[12px] font-medium text-on-surface-variant">
                              {lotesCount} {lotesCount === 1 ? 'Lote activo' : 'Lotes activos'}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-baseline gap-2">
                            <span className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">Disponible</span>
                            <span className="text-[20px] font-semibold text-on-surface">{p.disponible}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 font-body text-[13px] text-on-surface-variant">
                            <span>Físico {p.fisico}</span>
                            <span className="text-white/20">·</span>
                            <span>Reservado {p.reservado}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-4">
                            {stockBadge(p)}
                            <div className="text-on-surface-variant transition-colors group-hover:text-on-surface">
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-white/10 last:border-0">
                          <td colSpan={3} className="p-0">
                            <LotesInline producto={p} />
                            {esAdmin && (
                              <div className="flex items-center gap-2 bg-surface-container-highest/5 px-5 py-4 border-t border-white/5">
                                <span className="font-body text-[12px] font-medium uppercase tracking-wide text-on-surface-variant mr-2">Acciones admin:</span>
                                <button onClick={(e) => openEdit(p, e)} className="rounded-full border border-primary px-3 py-1.5 font-body text-[11px] font-semibold text-primary transition hover:bg-primary/20">
                                  Editar
                                </button>
                                <button onClick={(e) => handleDelete(p.id, e)} className="rounded-full border border-error/40 px-3 py-1.5 font-body text-[11px] font-semibold text-error transition hover:bg-error/10">
                                  Eliminar
                                </button>
                                <button onClick={(e) => openLotes(p, e)} className="rounded-full border border-white/10 px-3 py-1.5 font-body text-[11px] font-semibold text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface">
                                  Configurar Lotes
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
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
              <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
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

      {/* Lotes modal */}
      {lotesProducto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLotesProducto(null)}>
          <div className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[20px] font-semibold tracking-tight text-on-surface">{lotesProducto.nombre}</h2>
            <p className="mt-1 font-body text-[13px] font-medium text-on-surface-variant">
              Stock total: <span className="font-semibold text-on-surface">{lotesProducto.stock} unidades</span>
            </p>

            {lotes.length === 0 ? (
              <p className="mt-6 py-8 text-center font-body text-[13px] text-on-surface-variant">Sin lotes registrados.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {lotes.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-xl border border-white/10 bg-surface-container-high p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[16px] font-semibold text-primary">{l.numero}</span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium text-[11px] ${l.activo ? 'border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]' : 'bg-surface-highest text-on-surface-variant'}`}>
                          {l.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingLoteId === l.id ? (
                          <>
                            <button onClick={() => handleSaveLote(l)} className="rounded-full border border-primary px-3 py-1 font-body text-[11px] font-semibold text-primary transition hover:bg-primary/20">Guardar</button>
                            <button onClick={cancelEditLote} className="rounded-full border border-white/10 px-3 py-1 font-body text-[11px] text-outline transition hover:text-on-surface">Cancelar</button>
                          </>
                        ) : (
                          <button onClick={(e) => startEditLote(l, e)} className="font-body text-[11px] text-outline transition hover:text-primary">Editar</button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-4">
                      {editingLoteId === l.id ? (
                        <>
                          <div>
                            <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Cajas</p>
                            <input type="number" min={0} value={editLoteForm.cajas}
                              onChange={(e) => setEditLoteForm({ ...editLoteForm, cajas: Number(e.target.value) })}
                              className="input-field mt-1 text-right text-[16px]" onClick={(e) => e.stopPropagation()} />
                          </div>
                          <div>
                            <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Sueltos</p>
                            <input type="number" min={0} max={maxSueltos(l.unidadesPorCaja)} value={editLoteForm.sueltos}
                              onChange={(e) => setEditLoteForm({ ...editLoteForm, sueltos: Number(e.target.value) })}
                              className="input-field mt-1 text-right text-[16px]" onClick={(e) => e.stopPropagation()} />
                          </div>
                          <div>
                            <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Unidades</p>
                            <p className="mt-1 text-[18px] font-semibold text-on-surface">
                              {calcularUnidades(editLoteForm.cajas, editLoteForm.sueltos, l.unidadesPorCaja)}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Cajas</p>
                            <p className="mt-1 text-[18px] font-semibold text-on-surface">
                              {l.cajas}
                              <span className="ml-1 font-body text-[12px] font-normal text-on-surface-variant">× {l.unidadesPorCaja}u</span>
                            </p>
                          </div>
                          <div>
                            <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Sueltos</p>
                            <p className="mt-1 text-[18px] font-semibold text-on-surface">{l.sueltos}</p>
                          </div>
                          <div>
                            <p className="font-body text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Total</p>
                            <p className="mt-1 text-[18px] font-semibold text-on-surface">{l.unidades} <span className="font-body text-[12px] font-normal text-on-surface-variant">uds</span></p>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-4">
                      <p className="font-body text-[11px] text-outline">
                        Vto: <span className="font-medium text-on-surface-variant">{new Date(l.fechaVencimiento).toLocaleDateString('es-AR')}</span>
                      </p>
                      <p className="font-body text-[11px] text-outline">
                        Prod: <span className="font-medium text-on-surface-variant">{new Date(l.fechaProduccion).toLocaleDateString('es-AR')}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}


          </div>
        </div>
      )}
    </div>
  )
}
