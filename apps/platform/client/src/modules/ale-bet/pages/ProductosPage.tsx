import { useEffect, useState, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { type Producto } from '../lib/api'
import { useProductos, useCreateProducto, useUpdateProducto } from '../queries'
import { toast } from '@/lib/toast'
import { matchesFunctionalProductSearch, formatOptionalDate } from '../lib/logistics-display'
import { GestionarStockModal } from '../components/GestionarStockModal'
import { HistorialLotesModal } from '../components/HistorialLotesModal'
import { ChevronDown, ChevronUp, Package, Pencil } from 'lucide-react'
import { canGestionarStock } from '../lib/estados'
import { can } from '@/lib/permissions'

type ProductForm = {
  nombre: string
  sku: string
  stockMinimo: string
  unidadesPorCaja: string
}

const EMPTY_PRODUCT_FORM: ProductForm = { nombre: '', sku: '', stockMinimo: '', unidadesPorCaja: '' }

function parseNonNegativeInteger(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

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

function ProductoMobileCard({
  producto,
  expanded,
  puedeGestionar,
  puedeGestionarStock,
  onToggle,
  onGestionarStock,
  onEdit,
}: {
  producto: Producto
  expanded: boolean
  puedeGestionar: boolean
  puedeGestionarStock: boolean
  onToggle: () => void
  onGestionarStock: (event: React.MouseEvent<HTMLButtonElement>) => void
  onEdit: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const lotesCount = producto.lotes?.filter((lote) => lote.activo).length ?? 0
  const hasActions = puedeGestionarStock || puedeGestionar

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-surface-container-high">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 px-4 pb-3 pt-4 text-left btn-press"
      >
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-bold text-on-surface">{producto.nombre}</span>
          <span className="mt-1 block font-body text-[12px] text-on-surface-variant">{lotesCount} {lotesCount === 1 ? 'lote activo' : 'lotes activos'}</span>
        </span>
        {expanded ? <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-on-surface-variant" /> : <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-on-surface-variant" />}
      </button>

      <div className="grid grid-cols-3 border-y border-white/10 bg-surface-container-low/30 px-2 py-3 text-center">
        <div>
          <p className="font-body text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Depósito</p>
          <p className="mt-1 text-[17px] font-semibold text-on-surface">{producto.stockDeposito}</p>
        </div>
        <div className="border-x border-white/10">
          <p className="font-body text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Acond.</p>
          <p className="mt-1 text-[17px] font-semibold text-on-surface">{producto.stockAcondicionado}</p>
        </div>
        <div>
          <p className="font-body text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Total</p>
          <p className="mt-1 text-[17px] font-bold text-primary">{producto.stockTotal}</p>
        </div>
      </div>

      {hasActions && (
        <div className="flex gap-2 p-3">
          {puedeGestionarStock && (
            <button
              type="button"
              onClick={onGestionarStock}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary text-[13px] font-semibold text-primary btn-press"
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              Stock y lotes
            </button>
          )}
          {puedeGestionar && (
            <button
              type="button"
              onClick={onEdit}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-[13px] font-semibold text-on-surface btn-press"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar
            </button>
          )}
        </div>
      )}
      {expanded && <LotesInline producto={producto} />}
    </article>
  )
}

export default function ProductosPage() {
  const user = useAuthStore((state) => state.user)
  const puedeGestionar = can(user, 'ale-bet', 'productos.manage')
  const puedeGestionarStock = can(user, 'ale-bet', 'stock.lots.create') || can(user, 'ale-bet', 'stock.lots.adjust')

  const { data: productos = [], isLoading, error } = useProductos()
  const createMutation = useCreateProducto()
  const updateMutation = useUpdateProducto()

  const location = useLocation()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [stockProducto, setStockProducto] = useState<Producto | null>(null)
  const [showHistorialModal, setShowHistorialModal] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 767px)')
    if (!query) return
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  function toggleRow(id: string) {
    setExpandedRow(prev => prev === id ? null : id)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_PRODUCT_FORM)
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(p: Producto, e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(p)
    setForm({ nombre: p.nombre, sku: p.sku, stockMinimo: p.stockMinimo == null ? '' : String(p.stockMinimo), unidadesPorCaja: String(p.unidadesPorCaja) })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave() {
    const stockMinimo = form.stockMinimo.trim() === '' ? null : parseNonNegativeInteger(form.stockMinimo)
    if (stockMinimo === null && form.stockMinimo.trim() !== '') {
      setFormError('El stock mínimo debe ser un entero no negativo.')
      return
    }
    const unidadesPorCaja = parseNonNegativeInteger(form.unidadesPorCaja)
    if (!editing && (unidadesPorCaja === null || unidadesPorCaja < 1)) {
      setFormError('Las unidades por caja deben ser un entero positivo.')
      return
    }

    setFormError(null)
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, nombre: form.nombre, stockMinimo })
      } else {
        await createMutation.mutateAsync({ nombre: form.nombre, sku: form.sku, stockMinimo: stockMinimo ?? undefined, unidadesPorCaja: unidadesPorCaja! })
      }
      setShowModal(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  function openGestionarStock(p: Producto, e: React.MouseEvent) {
    e.stopPropagation()
    setStockProducto(p)
  }

  if (isLoading) return <p className="font-body text-sm text-on-surface-variant">Cargando productos...</p>
  if (error) return <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar productos'}</p>

  const filtered = productos.filter((p) => matchesFunctionalProductSearch(p, search))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-tight text-on-surface sm:text-[28px]">Productos</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Catálogo y administración de stock</p>
        </div>
        {puedeGestionar && (
          <button onClick={openCreate} className="min-h-11 shrink-0 rounded-xl border border-primary px-3 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 btn-press">
            + Nuevo producto
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11 w-full max-w-md rounded-xl border border-white/10 bg-surface-container-high px-4 font-body text-[16px] text-on-surface focus:border-primary focus:outline-none sm:text-[13px]"
        />
        {puedeGestionarStock && (
          <button
            onClick={() => setShowHistorialModal(true)}
            className="min-h-11 w-full rounded-xl border border-white/10 px-4 font-body text-[13px] text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface sm:w-auto"
          >
            Historial de lotes
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          No hay productos que coincidan.
        </p>
      ) : isMobile ? (
        <div className="space-y-3" data-testid="productos-mobile">
          {filtered.map((producto) => (
            <ProductoMobileCard
              key={producto.id}
              producto={producto}
              expanded={expandedRow === producto.id}
              puedeGestionar={puedeGestionar}
              puedeGestionarStock={puedeGestionarStock}
              onToggle={() => toggleRow(producto.id)}
              onGestionarStock={(event) => openGestionarStock(producto, event)}
              onEdit={(event) => openEdit(producto, event)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface-container-high" data-testid="productos-table">
          <table className="w-full font-body text-[13px]">
            <thead>
              <tr className="border-b border-white/10 text-[12px] font-medium uppercase tracking-wide text-on-surface-variant">
                <th className="px-5 py-4 text-left font-semibold">Producto</th>
                <th className="px-5 py-4 text-center font-semibold">Lotes</th>
                <th className="px-5 py-4 text-center font-semibold">Depósito</th>
                <th className="px-5 py-4 text-center font-semibold">Acondicionado</th>
                <th className="px-5 py-4 text-center font-semibold">Total</th>
                {(puedeGestionarStock || puedeGestionar) && (
                  <th className="px-5 py-4 text-center font-semibold">Acciones</th>
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
                      <td className="px-5 py-4 text-left">
                        <p className="text-[16px] font-semibold text-on-surface">{p.nombre}</p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <p className="text-[15px] font-medium text-on-surface-variant">
                          {lotesCount} {lotesCount === 1 ? 'lote' : 'lotes'}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <p className="text-[16px] font-medium text-on-surface-variant">{p.stockDeposito}</p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-4">
                          <p className="text-[16px] font-medium text-on-surface-variant">{p.stockAcondicionado}</p>
                          {!(puedeGestionarStock || puedeGestionar) && (
                            <div className="text-on-surface-variant transition-colors group-hover:text-on-surface">
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <p className="text-[16px] font-semibold text-on-surface">{p.stockTotal}</p>
                      </td>
                      {(puedeGestionarStock || puedeGestionar) && (
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                              {puedeGestionarStock && (
                                <button
                                  type="button"
                                  onClick={(e) => openGestionarStock(p, e)}
                                  aria-label="Gestionar stock"
                                  title="Gestionar stock, lotes y vencimientos"
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-primary text-primary transition hover:bg-primary/20"
                                >
                                  <Package className="h-4 w-4" aria-hidden="true" />
                                </button>
                              )}
                              {puedeGestionar && (
                                <button
                                  type="button"
                                  onClick={(e) => openEdit(p, e)}
                                  aria-label="Editar"
                                  title="Editar producto"
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-on-surface-variant transition hover:bg-surface-variant/50 hover:text-on-surface"
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                              )}
                            <div className="ml-1 text-on-surface-variant transition-colors group-hover:text-on-surface">
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-white/10 last:border-0">
                        <td colSpan={(puedeGestionarStock || puedeGestionar) ? 6 : 5} className="p-0">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-5" onClick={() => setShowModal(false)}>
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-surface-container-low p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:max-h-[85dvh] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[18px] font-semibold text-on-surface">
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <div className="space-y-4">
              <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="input-field" />

              <div>
                <label className="font-body text-[11px] text-outline">Stock mínimo</label>
                <input type="number" min={0} value={form.stockMinimo} onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })}
                  className="input-field mt-1" />
              </div>
              {editing && puedeGestionarStock && (
                <div className="rounded-lg border border-white/10 bg-surface-container-high p-3">
                  <p className="font-body text-[12px] font-semibold text-on-surface">Lotes y vencimientos</p>
                  <p className="mt-1 font-body text-[11px] text-on-surface-variant">Desde aquí podés editar vencimientos, ingresar o ajustar stock por lote.</p>
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setStockProducto(editing) }}
                    className="mt-3 rounded-full border border-primary px-3 py-1.5 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20"
                  >
                    Gestionar lotes y vencimientos
                  </button>
                </div>
              )}
              {!editing && (
                <div>
                  <label className="font-body text-[11px] text-outline">Unidades por caja</label>
                  <input type="number" min={1} value={form.unidadesPorCaja} onChange={(e) => setForm({ ...form, unidadesPorCaja: e.target.value })}
                    className="input-field mt-1" required />
                </div>
              )}
              {formError && <p className="font-body text-xs text-error">{formError}</p>}
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
                <button onClick={() => setShowModal(false)} className="min-h-11 rounded-xl border border-white/10 px-4 font-body text-[13px] text-outline transition hover:text-on-surface">Cancelar</button>
                <button onClick={handleSave} className="min-h-11 rounded-xl border border-primary px-4 font-body text-[13px] font-semibold text-primary transition hover:bg-primary/20">
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
