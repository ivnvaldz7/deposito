import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { apiRequest, type Lote, type Pedido, type Producto } from '@/lib/api'

interface ProductFormState {
  nombre: string
  sku: string
  stockMinimo: number
}

interface LoteFormState {
  numero: string
  cajas: number
  sueltos: number
  fechaProduccion: string
  fechaVencimiento: string
}

const ITEMS_PER_PAGE = 10
const MAX_SUELTOS = 14
const DEFAULT_MIN_STOCK = 100

const emptyProducto: ProductFormState = { nombre: '', sku: '', stockMinimo: DEFAULT_MIN_STOCK }

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addYears(dateString: string, years: number): string {
  const date = new Date(`${dateString}T00:00:00`)
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

const emptyLote = (): LoteFormState => {
  const fechaProduccion = todayIso()
  return {
    numero: '',
    cajas: 0,
    sueltos: 0,
    fechaProduccion,
    fechaVencimiento: addYears(fechaProduccion, 2),
  }
}

function isSameDay(dateString: string, now = new Date()): boolean {
  const date = new Date(dateString)
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function formatShortDate(dateString: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateString))
}

function formatMonthYear(dateString: string): string {
  return new Intl.DateTimeFormat('es-AR', { month: '2-digit', year: 'numeric' }).format(new Date(dateString))
}

function getExpirationTone(dateString: string): string {
  const today = new Date()
  const expiration = new Date(dateString)
  const monthDiff = (expiration.getFullYear() - today.getFullYear()) * 12 + (expiration.getMonth() - today.getMonth()) + (expiration.getDate() - today.getDate()) / 30
  if (monthDiff < 1) return 'border border-[#7f1d1d] bg-[#1f0b0b] text-[#ef4444]'
  if (monthDiff <= 6) return 'border border-[#78350f] bg-[#1c1204] text-[#f59e0b]'
  return 'border border-[#14532d] bg-[#052e16] text-[#22c55e]'
}

function getLoteDotColor(unidades: number): string {
  if (unidades === 0) return '#374151'
  if (unidades < 30) return '#f59e0b'
  return '#22c55e'
}

function buildLoteNumber(sku: string, lotes: Lote[]): string {
  return `${sku}${String(lotes.length + 1).padStart(4, '0')}`
}

function lotesActivos(lotes: Lote[]): Lote[] {
  return lotes.filter((lote) => lote.activo)
}

function formatDateInputValue(dateString: string): string {
  return new Date(dateString).toISOString().slice(0, 10)
}

function parseNonNegativeNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.trunc(parsed)
}

function metricCard(label: string, value: number, accentClass?: string) {
  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-[14px] shadow-[0_14px_36px_rgba(0,0,0,0.14)]">
      <p className="text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">{label}</p>
      <p className={`mt-2 text-[22px] font-bold text-[var(--color-text)] ${accentClass ?? ''}`} style={{ fontFamily: 'Montserrat, sans-serif' }}>
        {value}
      </p>
    </div>
  )
}

export function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [dropdownProductId, setDropdownProductId] = useState<string | null>(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null)
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loadingLotes, setLoadingLotes] = useState(false)
  const [showAddLoteForm, setShowAddLoteForm] = useState(false)
  const [manualLoteNumber, setManualLoteNumber] = useState(false)
  const [manualExpiry, setManualExpiry] = useState(false)
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProducto)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingLote, setEditingLote] = useState<Lote | null>(null)
  const [pendingDeleteLoteId, setPendingDeleteLoteId] = useState<string | null>(null)
  const [loteForm, setLoteForm] = useState<LoteFormState>(emptyLote)
  const [loteFormError, setLoteFormError] = useState<string | null>(null)
  const [submittingProduct, setSubmittingProduct] = useState(false)
  const [submittingLote, setSubmittingLote] = useState(false)

  async function loadData(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [productosData, pedidosData] = await Promise.all([
        apiRequest<Producto[]>('/api/productos'),
        apiRequest<Pedido[]>('/api/pedidos'),
      ])
      setProductos(productosData)
      setPedidos(pedidosData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los productos')
    } finally {
      setLoading(false)
    }
  }

  async function loadLotes(producto: Producto): Promise<void> {
    setLoadingLotes(true)
    setError(null)
    try {
      const response = await apiRequest<Lote[]>(`/api/productos/${producto.id}/lotes`)
      setSelectedProducto(producto)
      setLotes(response)
      setShowAddLoteForm(false)
      setEditingLote(null)
      setPendingDeleteLoteId(null)
      setManualLoteNumber(false)
      setManualExpiry(false)
      setLoteForm(emptyLote())
      setLoteFormError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los lotes')
    } finally {
      setLoadingLotes(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  useEffect(() => {
    if (!manualExpiry) {
      setLoteForm((current) => ({ ...current, fechaVencimiento: addYears(current.fechaProduccion, 2) }))
    }
  }, [manualExpiry])

  const filteredProductos = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase()
    if (!normalizedTerm) return productos
    return productos.filter((producto) => {
      const nombre = producto.nombre.toLowerCase()
      const sku = producto.sku.toLowerCase()
      return nombre.includes(normalizedTerm) || sku.includes(normalizedTerm)
    })
  }, [productos, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredProductos.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedProductos = filteredProductos.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)
  const showingFrom = filteredProductos.length === 0 ? 0 : (safePage - 1) * ITEMS_PER_PAGE + 1
  const showingTo = Math.min(safePage * ITEMS_PER_PAGE, filteredProductos.length)

  const metrics = useMemo(() => {
    const now = new Date()
    return {
      totalProductos: productos.length,
      stockCritico: productos.filter((producto) => producto.stock === 0 || producto.stockBajo).length,
      enArmadoHoy: pedidos.filter((pedido) => pedido.estado === 'EN_ARMADO' && isSameDay(pedido.updatedAt, now)).length,
      pedidosHoy: pedidos.filter((pedido) => isSameDay(pedido.createdAt, now)).length,
    }
  }, [pedidos, productos])

  const autoLoteNumber = selectedProducto ? buildLoteNumber(selectedProducto.sku, lotes) : ''
  const activeLotes = useMemo(() => lotesActivos(lotes), [lotes])
  const totalLoteUnits = activeLotes.reduce((total, lote) => total + lote.unidades, 0)
  const editingLoteUnits = editingLote?.unidades ?? 0
  const incomingUnits = loteForm.cajas * (MAX_SUELTOS + 1) + loteForm.sueltos
  const projectedStock = (selectedProducto?.stock ?? 0) - editingLoteUnits + incomingUnits

  async function handleSaveProducto(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSubmittingProduct(true)
    setError(null)
    try {
      if (editingProductId) {
        await apiRequest<Producto>(`/api/productos/${editingProductId}`, {
          method: 'PUT',
          body: JSON.stringify({ nombre: productForm.nombre, stockMinimo: productForm.stockMinimo, activo: true }),
        })
      } else {
        await apiRequest<Producto>('/api/productos', {
          method: 'POST',
          body: JSON.stringify(productForm),
        })
      }
      setShowProductModal(false)
      setEditingProductId(null)
      setProductForm(emptyProducto)
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el producto')
    } finally {
      setSubmittingProduct(false)
    }
  }

  async function handleDeleteProducto(producto: Producto): Promise<void> {
    if (!window.confirm(`Eliminar ${producto.nombre}?`)) return
    setError(null)
    try {
      await apiRequest<void>(`/api/productos/${producto.id}`, { method: 'DELETE' })
      setDropdownProductId(null)
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el producto')
    }
  }

  async function handleSaveLote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selectedProducto) return
    if (loteForm.sueltos > MAX_SUELTOS) {
      setLoteFormError(`Máximo ${MAX_SUELTOS} sueltos por lote`)
      return
    }

    setSubmittingLote(true)
    setError(null)
    setLoteFormError(null)
    try {
      const endpoint = editingLote
        ? `/api/productos/${selectedProducto.id}/lotes/${editingLote.id}`
        : `/api/productos/${selectedProducto.id}/lotes`

      await apiRequest<Lote>(endpoint, {
        method: editingLote ? 'PUT' : 'POST',
        body: JSON.stringify({
          numero: !editingLote && manualLoteNumber ? loteForm.numero : undefined,
          cajas: loteForm.cajas,
          sueltos: loteForm.sueltos,
          fechaProduccion: new Date(`${loteForm.fechaProduccion}T00:00:00`).toISOString(),
          fechaVencimiento: new Date(`${loteForm.fechaVencimiento}T00:00:00`).toISOString(),
        }),
      })
      await Promise.all([loadData(), loadLotes({ ...selectedProducto, stock: projectedStock })])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el lote')
    } finally {
      setSubmittingLote(false)
    }
  }

  function openCreateProductModal(): void {
    setEditingProductId(null)
    setProductForm(emptyProducto)
    setShowProductModal(true)
  }

  function openEditProductModal(producto: Producto): void {
    setEditingProductId(producto.id)
    setProductForm({ nombre: producto.nombre, sku: producto.sku, stockMinimo: producto.stockMinimo })
    setShowProductModal(true)
    setDropdownProductId(null)
  }

  function closeProductModal(): void {
    setShowProductModal(false)
    setEditingProductId(null)
    setProductForm(emptyProducto)
  }

  function closeLotesModal(): void {
    setSelectedProducto(null)
    setLotes([])
    setShowAddLoteForm(false)
    setEditingLote(null)
    setPendingDeleteLoteId(null)
    setManualLoteNumber(false)
    setManualExpiry(false)
    setLoteForm(emptyLote())
    setLoteFormError(null)
  }

  function openCreateLoteForm(): void {
    setEditingLote(null)
    setPendingDeleteLoteId(null)
    setShowAddLoteForm((current) => {
      const nextValue = !current
      if (nextValue) {
        setManualLoteNumber(false)
        setManualExpiry(false)
        setLoteForm(emptyLote())
        setLoteFormError(null)
      }
      return nextValue
    })
  }

  function openEditLoteForm(lote: Lote): void {
    setEditingLote(lote)
    setPendingDeleteLoteId(null)
    setShowAddLoteForm(true)
    setManualLoteNumber(true)
    setManualExpiry(true)
    setLoteForm({
      numero: lote.numero,
      cajas: lote.cajas,
      sueltos: lote.sueltos,
      fechaProduccion: formatDateInputValue(lote.fechaProduccion),
      fechaVencimiento: formatDateInputValue(lote.fechaVencimiento),
    })
    setLoteFormError(null)
  }

  function resetLoteForm(): void {
    setShowAddLoteForm(false)
    setEditingLote(null)
    setManualLoteNumber(false)
    setManualExpiry(false)
    setPendingDeleteLoteId(null)
    setLoteForm(emptyLote())
    setLoteFormError(null)
  }

  async function handleDeleteLote(lote: Lote): Promise<void> {
    if (!selectedProducto) return
    setError(null)
    try {
      await apiRequest<void>(`/api/productos/${selectedProducto.id}/lotes/${lote.id}`, {
        method: 'DELETE',
      })
      if (editingLote?.id === lote.id) {
        resetLoteForm()
      }
      await Promise.all([loadData(), loadLotes(selectedProducto)])
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el lote')
    }
  }

  if (loading) return <p className="text-sm text-[var(--color-text-2)]">Cargando productos...</p>

  return (
    <div className="space-y-6 font-[Inter] text-[var(--color-text)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Productos</h1>
          <p className="mt-1 text-[12px] text-[var(--color-text-2)]">Catálogo y control de stock mínimo</p>
        </div>
        <button
          type="button"
          onClick={openCreateProductModal}
          className="rounded-[8px] bg-[var(--color-accent)] px-4 py-[9px] text-[13px] font-semibold text-[#e8f5eb] transition hover:bg-[var(--color-accent-h)]"
          style={{ fontFamily: 'Montserrat, sans-serif' }}
        >
          + Nuevo producto
        </button>
      </div>

      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCard('Total productos', metrics.totalProductos)}
        {metricCard('Stock crítico', metrics.stockCritico, 'text-[var(--color-danger)]')}
        {metricCard('En armado hoy', metrics.enArmadoHoy)}
        {metricCard('Pedidos hoy', metrics.pedidosHoy)}
      </div>

      <div className="relative">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-3)]" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar por nombre o SKU..."
          className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[10px] pl-[38px] text-[13px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-3)] focus:border-[var(--color-text-3)]"
        />
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
        <div className="grid grid-cols-[minmax(0,1fr)_180px_80px_40px] gap-4 border-b border-[var(--color-border)] px-4 py-3 text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
          <div>Producto &amp; lotes</div>
          <div>Estado de lotes</div>
          <div className="text-right">Unidades</div>
          <div />
        </div>

        {paginatedProductos.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--color-text-2)]">No se encontraron productos para '{searchTerm}'</div>
        ) : (
          paginatedProductos.map((producto) => {
            const productLotes = producto.lotes ?? []
            const stockColor = producto.stock === 0 || producto.stock < producto.stockMinimo ? 'text-[var(--color-danger)]' : 'text-[#7ff6a1]'

            return (
              <div key={producto.id} className="grid grid-cols-[minmax(0,1fr)_180px_80px_40px] gap-4 border-t border-[var(--color-border)] px-4 py-[14px] transition-colors hover:bg-[rgba(255,255,255,0.02)]">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>{producto.nombre}</p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-2)]">SKU {producto.sku} · mín. {producto.stockMinimo} u</p>
                </div>

                <div className="flex flex-wrap items-start gap-2">
                  {productLotes.length > 0 ? (
                    productLotes.map((lote) => {
                      const loteBadgeLabel = lote.numero

                      return (
                      <span key={lote.id} className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-2 py-[3px] text-[11px] text-[var(--color-text-2)]">
                        <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: getLoteDotColor(lote.unidades) }} />
                        <span className="font-semibold text-[var(--color-text)]">{loteBadgeLabel}</span>
                        <span>{lote.cajas} cj · {lote.sueltos} s</span>
                      </span>
                      )
                    })
                  ) : (
                    <span className="inline-flex items-center rounded-[4px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-2 py-[3px] text-[11px] text-[var(--color-text-3)]">— Agotado</span>
                  )}
                </div>

                <div className="text-right">
                  <p className={`text-[24px] font-bold leading-none ${stockColor}`} style={{ fontFamily: 'Montserrat, sans-serif' }}>{producto.stock}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">unidades</p>
                  {producto.stock === 0 ? <p className="mt-1 text-[9px] font-bold text-[var(--color-danger)]">SIN STOCK</p> : null}
                  {producto.stock > 0 && producto.stock < producto.stockMinimo ? <p className="mt-1 text-[9px] font-bold text-[var(--color-danger)]">POR DEBAJO</p> : null}
                </div>

                <div className="relative flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDropdownProductId((current) => (current === producto.id ? null : producto.id))}
                    className="rounded-[6px] border border-[var(--color-border)] px-2 py-1 text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]"
                    aria-label={`Acciones para ${producto.nombre}`}
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {dropdownProductId === producto.id ? (
                    <div className="absolute right-0 top-10 z-50 min-w-[160px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
                      <button type="button" onClick={() => void loadLotes(producto)} className="block w-full rounded-[4px] px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition hover:bg-[rgba(255,255,255,0.02)]">Gestionar lotes</button>
                      <button type="button" onClick={() => openEditProductModal(producto)} className="block w-full rounded-[4px] px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition hover:bg-[rgba(255,255,255,0.02)]">Editar producto</button>
                      <div className="my-[4px] h-px bg-[var(--color-border)]" />
                      <button type="button" onClick={() => void handleDeleteProducto(producto)} className="block w-full rounded-[4px] px-3 py-2 text-left text-[13px] text-[var(--color-danger)] transition hover:bg-[rgba(239,68,68,0.08)]">Eliminar</button>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-[11px] text-[var(--color-text-2)]">Mostrando {showingFrom}–{showingTo} de {filteredProductos.length} productos</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => {
            const active = page === safePage
            return (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`rounded-[6px] border px-[10px] py-[5px] text-[12px] ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[#e8f5eb]' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-2)]'}`}
                style={active ? { fontFamily: 'Montserrat, sans-serif', fontWeight: 700 } : undefined}
              >
                {page}
              </button>
            )
          })}
        </div>
      </div>

      {showProductModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.75)] px-4 py-6">
          <div className="w-full max-w-[520px] rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-[16px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                {editingProductId ? 'Editar producto' : 'Nuevo producto'}
              </h2>
              <button type="button" onClick={closeProductModal} className="rounded-[6px] border border-[var(--color-border)] px-[10px] py-1 text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]" aria-label="Cerrar modal">
                <X size={14} />
              </button>
            </div>

            <form className="space-y-4 px-5 py-5" onSubmit={(event) => void handleSaveProducto(event)}>
              <div>
                <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Nombre del producto</label>
                <input value={productForm.nombre} onChange={(event) => setProductForm({ ...productForm, nombre: event.target.value })} className="w-full rounded-[6px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-text-3)]" required />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">SKU</label>
                <input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} className="w-full rounded-[6px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-text-3)] disabled:opacity-60" required disabled={editingProductId !== null} />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Stock mínimo</label>
                <input type="number" min={0} value={productForm.stockMinimo} onChange={(event) => setProductForm({ ...productForm, stockMinimo: Number(event.target.value) })} className="w-full rounded-[6px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-text-3)]" required />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeProductModal} className="rounded-[6px] border border-[var(--color-border)] px-4 py-[9px] text-[13px] text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]">Cancelar</button>
                <button type="submit" disabled={submittingProduct} className="rounded-[6px] bg-[var(--color-accent)] px-4 py-[9px] text-[13px] font-semibold text-[#e8f5eb] disabled:opacity-60" style={{ fontFamily: 'Montserrat, sans-serif' }}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedProducto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)] px-4 py-6">
          <div className="w-full max-w-[560px] rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  Lotes de {selectedProducto.nombre}
                </h2>
                <p className="mt-1 text-[11px] text-[var(--color-text-2)]">{activeLotes.length} lotes activos · {totalLoteUnits} u en total</p>
              </div>
              <button type="button" onClick={closeLotesModal} className="rounded-[6px] border border-[var(--color-border)] px-[10px] py-1 text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]" aria-label="Cerrar modal">
                <X size={14} />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-5">
              {loadingLotes ? <p className="text-sm text-[var(--color-text-2)]">Cargando lotes...</p> : null}
              {!loadingLotes && activeLotes.length === 0 ? <p className="text-sm text-[var(--color-text-2)]">Sin lotes activos para este producto.</p> : null}

              {activeLotes.map((lote) => (
                <div key={lote.id} className="grid grid-cols-[minmax(0,1fr)_120px_90px_72px] items-center gap-4 rounded-[8px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-4 py-[14px]">
                  <div>
                    <p className="text-[15px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>{lote.numero}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-2)]">Prod. {formatShortDate(lote.fechaProduccion)}</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-[28px] font-bold leading-none ${lote.unidades >= 100 ? 'text-[#7ff6a1]' : 'text-[var(--color-warning)]'}`} style={{ fontFamily: 'Montserrat, sans-serif' }}>{lote.unidades}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-2)]">{lote.cajas} cj · {lote.sueltos} s</p>
                  </div>
                  <div className="flex justify-center">
                    <span className={`rounded-[4px] px-2 py-1 text-[10px] font-semibold ${getExpirationTone(lote.fechaVencimiento)}`}>Vence {formatMonthYear(lote.fechaVencimiento)}</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => openEditLoteForm(lote)} className="rounded-[5px] border border-[var(--color-border)] px-[7px] py-1 text-[12px] text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]"><Pencil size={12} /></button>
                    <button type="button" onClick={() => setPendingDeleteLoteId((current) => current === lote.id ? null : lote.id)} className="rounded-[5px] border border-[var(--color-border)] px-[7px] py-1 text-[12px] text-[var(--color-text-2)] transition hover:border-[rgba(239,68,68,0.3)] hover:text-[var(--color-danger)]"><Trash2 size={12} /></button>
                  </div>
                  {pendingDeleteLoteId === lote.id ? (
                    <div className="col-span-full rounded-[6px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-3 py-3">
                      <p className="text-[12px] text-[var(--color-text)]">¿Eliminar lote {lote.numero}?</p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button type="button" onClick={() => setPendingDeleteLoteId(null)} className="rounded-[6px] border border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]">Cancelar</button>
                        <button type="button" onClick={() => void handleDeleteLote(lote)} className="rounded-[6px] bg-[var(--color-danger)] px-3 py-2 text-[12px] font-semibold text-white">Confirmar</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}

              <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                <button
                  type="button"
                  onClick={openCreateLoteForm}
                  className="w-full rounded-[8px] border border-dashed border-[var(--color-accent)] bg-transparent px-4 py-[11px] text-[13px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]"
                  style={{ fontFamily: 'Montserrat, sans-serif' }}
                >
                  + Agregar nuevo lote
                </button>

                {showAddLoteForm ? (
                  <form className="space-y-4 rounded-[8px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] p-4" onSubmit={(event) => void handleSaveLote(event)} noValidate>
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-[11px] text-[var(--color-text-2)]">Número de lote</label>
                      <div className="inline-flex rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-[11px]">
                        <button type="button" onClick={() => !editingLote && setManualLoteNumber(false)} className={`rounded-[4px] px-3 py-1 ${!manualLoteNumber ? 'bg-[var(--color-accent)] text-[#e8f5eb]' : 'text-[var(--color-text-2)]'}`} disabled={editingLote !== null}>Automático</button>
                        <button type="button" onClick={() => setManualLoteNumber(true)} className={`rounded-[4px] px-3 py-1 ${manualLoteNumber ? 'bg-[var(--color-accent)] text-[#e8f5eb]' : 'text-[var(--color-text-2)]'}`}>Manual</button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={manualLoteNumber ? loteForm.numero : ''}
                      onChange={(event) => setLoteForm({ ...loteForm, numero: event.target.value })}
                      disabled={!manualLoteNumber || editingLote !== null}
                      placeholder={autoLoteNumber}
                      className="w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-3)] focus:border-[var(--color-text-3)] disabled:cursor-not-allowed disabled:opacity-70"
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Cajas</label>
                        <input type="number" min={0} value={loteForm.cajas} onChange={(event) => setLoteForm({ ...loteForm, cajas: parseNonNegativeNumber(event.target.value) })} className="w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-text-3)]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Sueltos</label>
                        <input type="number" min={0} value={loteForm.sueltos} onChange={(event) => { setLoteForm({ ...loteForm, sueltos: parseNonNegativeNumber(event.target.value) }); setLoteFormError(null) }} className="w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-text-3)]" />
                        {loteFormError ? <p className="mt-1 text-[11px] text-[var(--color-danger)]">{loteFormError}</p> : null}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Fecha de producción</label>
                        <input
                          type="date"
                          value={loteForm.fechaProduccion}
                          onChange={(event) => {
                            const fechaProduccion = event.target.value
                            setLoteForm((current) => ({
                              ...current,
                              fechaProduccion,
                              fechaVencimiento: manualExpiry ? current.fechaVencimiento : addYears(fechaProduccion, 2),
                            }))
                          }}
                          className="w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-text-3)]"
                          required
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <label className="block text-[11px] text-[var(--color-text-2)]">Fecha de vencimiento</label>
                          <button type="button" onClick={() => setManualExpiry((current) => !current)} className="text-[11px] text-[var(--color-text-2)] underline underline-offset-2">
                            {manualExpiry ? 'Usar automática' : 'Editar manualmente'}
                          </button>
                        </div>
                        <input type="date" value={loteForm.fechaVencimiento} onChange={(event) => { setManualExpiry(true); setLoteForm({ ...loteForm, fechaVencimiento: event.target.value }) }} className="w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[9px] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-text-3)]" required />
                      </div>
                    </div>

                    <p className="text-[12px] text-[var(--color-text-2)]">{editingLote ? `Unidades actualizadas: ${incomingUnits} · Stock resultante: ${projectedStock}` : `Unidades a ingresar: ${incomingUnits} · Stock resultante: ${projectedStock}`}</p>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={resetLoteForm}
                        className="rounded-[6px] border border-[var(--color-border)] px-4 py-[9px] text-[13px] text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]"
                      >
                        Cancelar
                      </button>
                      <button type="submit" disabled={submittingLote} className="rounded-[6px] bg-[var(--color-accent)] px-4 py-[9px] text-[13px] font-semibold text-[#e8f5eb] disabled:opacity-60" style={{ fontFamily: 'Montserrat, sans-serif' }}>{editingLote ? 'Guardar cambios' : 'Guardar lote'}</button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
