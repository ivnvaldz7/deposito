import { useState } from 'react'
import { type Producto, type Lote } from '../lib/api'
import { UNIDADES_POR_CAJA, MAX_SUELTOS } from '../lib/constants'
import { useProductos, useCreateProducto, useUpdateProducto, useDeleteProducto, useLotes, useUpdateLote } from '../queries'
import { toast } from '@/lib/toast'

export default function ProductosPage() {
  const { data: productos = [], isLoading, error } = useProductos()
  const createMutation = useCreateProducto()
  const updateMutation = useUpdateProducto()
  const deleteMutation = useDeleteProducto()
  const updateLoteMutation = useUpdateLote()

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState({ nombre: '', sku: '', stockMinimo: 100 })
  const [lotesProducto, setLotesProducto] = useState<Producto | null>(null)
  const { data: lotes = [] } = useLotes(lotesProducto?.id ?? '')
  const [editingLoteId, setEditingLoteId] = useState<string | null>(null)
  const [editLoteForm, setEditLoteForm] = useState({ cajas: 0, sueltos: 0 })

  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', sku: '', stockMinimo: 100 })
    setShowModal(true)
  }

  function openEdit(p: Producto, e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(p)
    setForm({ nombre: p.nombre, sku: p.sku, stockMinimo: p.stockMinimo })
    setShowModal(true)
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...form })
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

  function openLotes(p: Producto) {
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

  const filtered = productos.filter(
    (p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold tracking-[-0.03em] text-on-surface">Productos</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Gestión de productos y lotes</p>
        </div>
        <button onClick={openCreate} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
          + Nuevo producto
        </button>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Buscar productos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field max-w-sm"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-surface-container-high rounded-xl px-5 py-4">
          <p className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">Total</p>
          <p className="mt-1 font-heading text-[24px] font-bold text-on-surface">{productos.length}</p>
        </div>
        <div className="bg-surface-container-high rounded-xl px-5 py-4">
          <p className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">Stock bajo</p>
          <p className="mt-1 font-heading text-[24px] font-bold text-error">
            {productos.filter((p) => p.stockBajo).length}
          </p>
        </div>
        <div className="bg-surface-container-high rounded-xl px-5 py-4">
          <p className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">Stock total</p>
          <p className="mt-1 font-heading text-[24px] font-bold text-on-surface">
            {productos.reduce((s, p) => s + p.stock, 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-surface-container-high rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No hay productos.</p>
        ) : (
          <table className="w-full text-left font-body text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">Lotes</th>
                <th className="px-5 py-3 font-medium text-right">Stock</th>
                <th className="px-5 py-3 font-medium text-right">Mínimo</th>
                <th className="px-5 py-3 font-medium text-center">Estado</th>
                <th className="px-5 py-3 font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openLotes(p)}
                  className="border-b border-white/10 last:border-0 cursor-pointer transition hover:bg-surface-variant/30"
                >
                  <td className="px-5 py-4 font-semibold text-on-surface">{p.nombre}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {p.lotes && p.lotes.length > 0 ? (
                        p.lotes.slice(0, 3).map((l) => (
                          <span
                            key={l.id}
                            onClick={(e) => { e.stopPropagation(); openLotes(p) }}
                            className="inline-block rounded bg-surface-variant/60 px-2 py-1 font-mono text-[12px] font-bold text-on-surface-variant leading-tight cursor-pointer transition hover:bg-primary/30 hover:text-primary"
                          >
                            {l.numero}
                          </span>
                        ))
                      ) : (
                        <span className="font-body text-[11px] text-outline">—</span>
                      )}
                      {p.lotes && p.lotes.length > 3 && (
                        <span className="inline-block font-body text-[11px] text-outline">+{p.lotes.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className={`px-5 py-4 text-right font-medium ${p.stockBajo ? 'text-error' : 'text-on-surface'}`}>
                    {p.stock}
                  </td>
                  <td className="px-5 py-4 text-right text-outline">{p.stockMinimo}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 font-heading font-semibold text-xs ${p.stockBajo ? 'bg-error/20 text-error' : 'bg-success/20 text-success'}`}>
                      {p.stockBajo ? 'Stock bajo' : 'OK'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={(e) => openEdit(p, e)} className="font-body text-[11px] text-outline transition hover:text-on-surface">
                        Editar
                      </button>
                      <button onClick={(e) => handleDelete(p.id, e)} className="font-body text-[11px] text-error transition hover:opacity-80">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Producto modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-heading text-[18px] font-bold text-on-surface">
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
            <h2 className="font-heading text-[20px] font-bold tracking-[-0.02em] text-on-surface">{lotesProducto.nombre}</h2>
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
                        <span className="font-mono text-[16px] font-bold text-primary">{l.numero}</span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-heading font-semibold text-[10px] ${l.activo ? 'bg-success/20 text-success' : 'bg-surface-highest text-on-surface-variant'}`}>
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
                            <p className="font-body text-[10px] uppercase tracking-[0.6px] text-outline">Cajas</p>
                            <input type="number" min={0} value={editLoteForm.cajas}
                              onChange={(e) => setEditLoteForm({ ...editLoteForm, cajas: Number(e.target.value) })}
                              className="input-field mt-1 text-right" onClick={(e) => e.stopPropagation()} />
                          </div>
                          <div>
                            <p className="font-body text-[10px] uppercase tracking-[0.6px] text-outline">Sueltos</p>
                            <input type="number" min={0} max={MAX_SUELTOS} value={editLoteForm.sueltos}
                              onChange={(e) => setEditLoteForm({ ...editLoteForm, sueltos: Number(e.target.value) })}
                              className="input-field mt-1 text-right" onClick={(e) => e.stopPropagation()} />
                          </div>
                          <div>
                            <p className="font-body text-[10px] uppercase tracking-[0.6px] text-outline">Unidades</p>
                            <p className="mt-1 font-heading text-[18px] font-bold text-on-surface">
                              {editLoteForm.cajas * UNIDADES_POR_CAJA + editLoteForm.sueltos}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="font-body text-[10px] uppercase tracking-[0.6px] text-outline">Cajas</p>
                            <p className="mt-1 font-heading text-[18px] font-bold text-on-surface">
                              {l.cajas}
                              <span className="ml-1 font-body text-[11px] font-normal text-outline">× {UNIDADES_POR_CAJA}u</span>
                            </p>
                          </div>
                          <div>
                            <p className="font-body text-[10px] uppercase tracking-[0.6px] text-outline">Sueltos</p>
                            <p className="mt-1 font-heading text-[18px] font-bold text-on-surface">{l.sueltos}</p>
                          </div>
                          <div>
                            <p className="font-body text-[10px] uppercase tracking-[0.6px] text-outline">Total</p>
                            <p className="mt-1 font-heading text-[18px] font-bold text-on-surface">{l.unidades} <span className="font-body text-[11px] font-normal text-outline">uds</span></p>
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
