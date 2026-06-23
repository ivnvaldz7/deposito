import { useEffect, useState } from 'react'
import { aleBetApi, type Producto, type Lote } from '../lib/api'
import { UNIDADES_POR_CAJA, MAX_SUELTOS } from '../lib/constants'

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState({ nombre: '', sku: '', stockMinimo: 100 })
  const [lotesModal, setLotesModal] = useState<{ producto: Producto; lotes: Lote[] } | null>(null)
  const [loteForm, setLoteForm] = useState({ cajas: 0, sueltos: 0, fechaProduccion: new Date().toISOString().split('T')[0] })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setProductos(await aleBetApi.productos.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

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
        await aleBetApi.productos.update(editing.id, form)
      } else {
        await aleBetApi.productos.create(form)
      }
      setShowModal(false)
      void load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar producto?')) return
    try {
      await aleBetApi.productos.delete(id)
      void load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  async function openLotes(p: Producto) {
    try {
      const lotes = await aleBetApi.productos.lotes.list(p.id)
      setLotesModal({ producto: p, lotes })
      setLoteForm({ cajas: 0, sueltos: 0, fechaProduccion: new Date().toISOString().split('T')[0] })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cargar lotes')
    }
  }

  async function handleAddLote() {
    if (!lotesModal) return
    try {
      await aleBetApi.productos.lotes.create(lotesModal.producto.id, {
        cajas: loteForm.cajas,
        sueltos: loteForm.sueltos,
        fechaProduccion: new Date(loteForm.fechaProduccion).toISOString(),
      })
      setLoteForm({ cajas: 0, sueltos: 0, fechaProduccion: new Date().toISOString().split('T')[0] })
      // Refresh lotes
      const lotes = await aleBetApi.productos.lotes.list(lotesModal.producto.id)
      setLotesModal({ ...lotesModal, lotes })
      void load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear lote')
    }
  }

  if (loading) return <p className="text-sm text-[var(--color-text-2)]">Cargando productos...</p>
  if (error) return <p className="text-sm text-[var(--color-danger)]">{error}</p>

  const filtered = productos.filter(
    (p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Productos</h1>
          <p className="text-[13px] text-[var(--color-text-2)]">Gestión de productos y lotes</p>
        </div>
        <button onClick={openCreate} className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]">
          + Nuevo producto
        </button>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Buscar productos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="app-panel rounded-[12px] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">Total</p>
          <p className="mt-1 text-[24px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>{productos.length}</p>
        </div>
        <div className="app-panel rounded-[12px] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">Stock bajo</p>
          <p className="mt-1 text-[24px] font-bold text-[var(--color-danger)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            {productos.filter((p) => p.stockBajo).length}
          </p>
        </div>
        <div className="app-panel rounded-[12px] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">Stock total</p>
          <p className="mt-1 text-[24px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            {productos.reduce((s, p) => s + p.stock, 0).toLocaleString()}
          </p>
        </div>
      </div>

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
                <th className="px-5 py-3 font-medium text-center">Lotes</th>
                <th className="px-5 py-3 font-medium text-center">Acción</th>
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
                  <td className="px-5 py-4 text-center">
                    <button onClick={() => openLotes(p)} className="text-[11px] text-[var(--color-accent)] transition hover:underline">
                      Ver lotes
                    </button>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(p)} className="text-[11px] text-[var(--color-text-3)] transition hover:text-[var(--color-text)]">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="text-[11px] text-[var(--color-danger)] transition hover:opacity-80">
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
          <div className="w-full max-w-md rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[18px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <div className="space-y-4">
              <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]" />
              <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]" />
              <div>
                <label className="text-[11px] text-[var(--color-text-3)]">Stock mínimo</label>
                <input type="number" min={0} value={form.stockMinimo} onChange={(e) => setForm({ ...form, stockMinimo: Number(e.target.value) })}
                  className="mt-1 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-[12px] text-[var(--color-text-3)] transition hover:text-[var(--color-text)]">Cancelar</button>
                <button onClick={handleSave} className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]">
                  {editing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lotes modal */}
      {lotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLotesModal(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-[18px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Lotes: {lotesModal.producto.nombre}
            </h2>
            <p className="mb-4 text-[12px] text-[var(--color-text-3)]">Stock total: {lotesModal.producto.stock} unidades</p>

            {lotesModal.lotes.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-[var(--color-text-2)]">Sin lotes registrados.</p>
            ) : (
              <table className="mb-6 w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
                    <th className="pb-2 font-medium">Número</th>
                    <th className="pb-2 font-medium text-right">Cajas</th>
                    <th className="pb-2 font-medium text-right">Sueltos</th>
                    <th className="pb-2 font-medium text-right">Unidades</th>
                    <th className="pb-2 font-medium">Vencimiento</th>
                    <th className="pb-2 font-medium text-center">Activo</th>
                  </tr>
                </thead>
                <tbody>
                  {lotesModal.lotes.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-3 font-medium text-[var(--color-text)]">{l.numero}</td>
                      <td className="py-3 text-right text-[var(--color-text)]">{l.cajas}</td>
                      <td className="py-3 text-right text-[var(--color-text)]">{l.sueltos}</td>
                      <td className="py-3 text-right font-medium text-[var(--color-text)]">{l.unidades}</td>
                      <td className="py-3 text-[var(--color-text-3)]">
                        {new Date(l.fechaVencimiento).toLocaleDateString('es-AR')}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${l.activo ? 'bg-[rgba(26,107,53,0.16)] text-[#7ff6a1]' : 'bg-[rgba(116,121,111,0.14)] text-[#bccbb8]'}`}>
                          {l.activo ? 'Sí' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="border-t border-[var(--color-border)] pt-4">
              <h3 className="mb-3 text-[14px] font-bold text-[var(--color-text)]">Agregar lote</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-[var(--color-text-3)]">Cajas</label>
                  <input type="number" min={0} value={loteForm.cajas} onChange={(e) => setLoteForm({ ...loteForm, cajas: Number(e.target.value) })}
                    className="mt-1 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]" />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--color-text-3)]">Sueltos (máx {MAX_SUELTOS})</label>
                  <input type="number" min={0} max={MAX_SUELTOS} value={loteForm.sueltos} onChange={(e) => setLoteForm({ ...loteForm, sueltos: Number(e.target.value) })}
                    className="mt-1 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]" />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--color-text-3)]">Fecha producción</label>
                  <input type="date" value={loteForm.fechaProduccion} onChange={(e) => setLoteForm({ ...loteForm, fechaProduccion: e.target.value })}
                    className="mt-1 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]" />
                </div>
              </div>
              <button onClick={handleAddLote} className="mt-3 rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]">
                Agregar lote
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={() => setLotesModal(null)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-[12px] text-[var(--color-text-3)] transition hover:text-[var(--color-text)]">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
