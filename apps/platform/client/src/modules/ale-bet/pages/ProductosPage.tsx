import { useState } from 'react'
import { type Producto } from '../lib/api'
import { UNIDADES_POR_CAJA, MAX_SUELTOS } from '../lib/constants'
import { useProductos, useCreateProducto, useUpdateProducto, useDeleteProducto, useLotes, useCreateLote } from '../queries'

export default function ProductosPage() {
  const { data: productos = [], isLoading, error } = useProductos()
  const createMutation = useCreateProducto()
  const updateMutation = useUpdateProducto()
  const deleteMutation = useDeleteProducto()
  const createLoteMutation = useCreateLote()

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState({ nombre: '', sku: '', stockMinimo: 100 })
  const [lotesProducto, setLotesProducto] = useState<Producto | null>(null)
  const { data: lotes = [] } = useLotes(lotesProducto?.id ?? '')
  const [loteForm, setLoteForm] = useState({ cajas: 0, sueltos: 0, fechaProduccion: new Date().toISOString().split('T')[0] })

  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', sku: '', stockMinimo: 100 })
    setShowModal(true)
  }

  function openEdit(p: Producto) {
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
      alert(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar producto?')) return
    deleteMutation.mutate(id, {
      onError: (e) => alert(e instanceof Error ? e.message : 'Error al eliminar'),
    })
  }

  function openLotes(p: Producto) {
    setLotesProducto(p)
    setLoteForm({ cajas: 0, sueltos: 0, fechaProduccion: new Date().toISOString().split('T')[0] })
  }

  async function handleAddLote() {
    if (!lotesProducto) return
    try {
      await createLoteMutation.mutateAsync({
        productoId: lotesProducto.id,
        cajas: loteForm.cajas,
        sueltos: loteForm.sueltos,
        fechaProduccion: new Date(loteForm.fechaProduccion).toISOString(),
      })
      setLoteForm({ cajas: 0, sueltos: 0, fechaProduccion: new Date().toISOString().split('T')[0] })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear lote')
    }
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
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium text-right">Stock</th>
                <th className="px-5 py-3 font-medium text-right">Mínimo</th>
                <th className="px-5 py-3 font-medium text-center">Estado</th>
                <th className="px-5 py-3 font-medium text-center">Lotes</th>
                <th className="px-5 py-3 font-medium text-center">Acción</th>
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
                  <td className="px-5 py-4 text-center">
                    <button onClick={() => openLotes(p)} className="font-body text-[11px] text-primary transition hover:underline">
                      Ver lotes
                    </button>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(p)} className="font-body text-[11px] text-outline transition hover:text-on-surface">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="font-body text-[11px] text-error transition hover:opacity-80">
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
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 font-heading text-[18px] font-bold text-on-surface">
              Lotes: {lotesProducto.nombre}
            </h2>
            <p className="mb-4 font-body text-[12px] text-outline">Stock total: {lotesProducto.stock} unidades</p>

            {lotes.length === 0 ? (
              <p className="py-4 text-center font-body text-[13px] text-on-surface-variant">Sin lotes registrados.</p>
            ) : (
              <table className="mb-6 w-full text-left font-body text-[12px]">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                    <th className="pb-2 font-medium">Número</th>
                    <th className="pb-2 font-medium text-right">Cajas</th>
                    <th className="pb-2 font-medium text-right">Sueltos</th>
                    <th className="pb-2 font-medium text-right">Unidades</th>
                    <th className="pb-2 font-medium">Vencimiento</th>
                    <th className="pb-2 font-medium text-center">Activo</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id} className="border-b border-white/10 last:border-0">
                      <td className="py-3 font-medium text-on-surface">{l.numero}</td>
                      <td className="py-3 text-right text-on-surface">{l.cajas}</td>
                      <td className="py-3 text-right text-on-surface">{l.sueltos}</td>
                      <td className="py-3 text-right font-medium text-on-surface">{l.unidades}</td>
                      <td className="py-3 text-outline">
                        {new Date(l.fechaVencimiento).toLocaleDateString('es-AR')}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-heading font-semibold text-xs ${l.activo ? 'bg-success/20 text-success' : 'bg-surface-highest text-on-surface-variant'}`}>
                          {l.activo ? 'Sí' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="border-t border-white/10 pt-4">
              <h3 className="mb-3 font-heading text-[14px] font-bold text-on-surface">Agregar lote</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-body text-[11px] text-outline">Cajas</label>
                  <input type="number" min={0} value={loteForm.cajas} onChange={(e) => setLoteForm({ ...loteForm, cajas: Number(e.target.value) })}
                    className="input-field mt-1" />
                </div>
                <div>
                  <label className="font-body text-[11px] text-outline">Sueltos (máx {MAX_SUELTOS})</label>
                  <input type="number" min={0} max={MAX_SUELTOS} value={loteForm.sueltos} onChange={(e) => setLoteForm({ ...loteForm, sueltos: Number(e.target.value) })}
                    className="input-field mt-1" />
                </div>
                <div>
                  <label className="font-body text-[11px] text-outline">Fecha producción</label>
                  <input type="date" value={loteForm.fechaProduccion} onChange={(e) => setLoteForm({ ...loteForm, fechaProduccion: e.target.value })}
                    className="input-field mt-1" />
                </div>
              </div>
              <button onClick={handleAddLote} className="mt-3 rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
                Agregar lote
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={() => setLotesProducto(null)} className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
