import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/modal'
import { Section, StatusChip } from '@/components/ui'
import { apiRequest, type Lote, type Producto } from '@/lib/api'

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
}

const emptyProducto: ProductFormState = {
  nombre: '',
  sku: '',
  stockMinimo: 100,
}

const emptyLote: LoteFormState = {
  numero: '',
  cajas: 0,
  sueltos: 0,
  fechaProduccion: new Date().toISOString().slice(0, 10),
}

export function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null)
  const [lotes, setLotes] = useState<Lote[]>([])
  const [showProductModal, setShowProductModal] = useState(false)
  const [showLoteModal, setShowLoteModal] = useState(false)
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProducto)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [loteForm, setLoteForm] = useState<LoteFormState>(emptyLote)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProductos(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const response = await apiRequest<Producto[]>('/api/productos')
      setProductos(response)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProductos()
  }, [])

  async function openLotes(producto: Producto): Promise<void> {
    setSelectedProducto(producto)
    const response = await apiRequest<Lote[]>(`/api/productos/${producto.id}/lotes`)
    setLotes(response)
  }

  async function handleSaveProducto(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (editingProductId) {
      await apiRequest<Producto>(`/api/productos/${editingProductId}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: productForm.nombre,
          stockMinimo: productForm.stockMinimo,
          activo: true,
        }),
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
    await loadProductos()
  }

  async function handleDeleteProducto(id: string): Promise<void> {
    await apiRequest<void>(`/api/productos/${id}`, { method: 'DELETE' })
    await loadProductos()
  }

  async function handleSaveLote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!selectedProducto) {
      return
    }

    await apiRequest<Lote>(`/api/productos/${selectedProducto.id}/lotes`, {
      method: 'POST',
      body: JSON.stringify({
        ...loteForm,
        numero: loteForm.numero || undefined,
        fechaProduccion: new Date(loteForm.fechaProduccion).toISOString(),
      }),
    })

    setShowLoteModal(false)
    setLoteForm(emptyLote)
    await openLotes(selectedProducto)
    await loadProductos()
  }

  if (loading) {
    return <p className="text-sm text-[var(--on-surface-variant)]">Cargando productos...</p>
  }

  return (
    <div className="space-y-6">
      <Section
        title="Productos"
        description="Catálogo y control de stock mínimo."
        action={
          <button
            type="button"
            onClick={() => {
              setEditingProductId(null)
              setProductForm(emptyProducto)
              setShowProductModal(true)
            }}
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#07120b]"
          >
            Nuevo producto
          </button>
        }
      >
        {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}
        <div className="grid gap-4">
          {productos.map((producto) => (
            <div
              key={producto.id}
              className="rounded-2xl border border-white/6 bg-[var(--surface-lowest)] p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-[Montserrat] text-lg font-semibold">{producto.nombre}</p>
                  <p className="text-sm text-[var(--on-surface-variant)]">
                    SKU {producto.sku} · mínimo {producto.stockMinimo} u
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    label={`${producto.stock} u`}
                    tone={producto.stockBajo ? 'amber' : 'green'}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProductId(producto.id)
                      setProductForm({
                        nombre: producto.nombre,
                        sku: producto.sku,
                        stockMinimo: producto.stockMinimo,
                      })
                      setShowProductModal(true)
                    }}
                    className="rounded-xl border border-white/8 px-3 py-2 text-sm"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void openLotes(producto)}
                    className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
                  >
                    Gestionar lotes
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteProducto(producto.id)}
                    className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Modal
        title={editingProductId ? 'Editar producto' : 'Nuevo producto'}
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
      >
        <form className="space-y-4" onSubmit={(event) => void handleSaveProducto(event)}>
          <input
            value={productForm.nombre}
            onChange={(event) => setProductForm({ ...productForm, nombre: event.target.value })}
            placeholder="Nombre"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
            required
          />
          <input
            value={productForm.sku}
            onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })}
            placeholder="SKU"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
            required
            disabled={editingProductId !== null}
          />
          <input
            type="number"
            min={0}
            value={productForm.stockMinimo}
            onChange={(event) =>
              setProductForm({ ...productForm, stockMinimo: Number(event.target.value) })
            }
            placeholder="Stock mínimo"
            className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
          />
          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#07120b]"
          >
            Guardar
          </button>
        </form>
      </Modal>

      <Modal
        title={selectedProducto ? `Lotes de ${selectedProducto.nombre}` : 'Lotes'}
        open={selectedProducto !== null}
        onClose={() => {
          setSelectedProducto(null)
          setLotes([])
          setShowLoteModal(false)
        }}
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowLoteModal(true)}
              className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200"
            >
              Nuevo lote
            </button>
          </div>
          <div className="space-y-3">
            {lotes.map((lote) => (
              <div
                key={lote.id}
                className="rounded-2xl border border-white/6 bg-[var(--surface-lowest)] p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{lote.numero}</p>
                    <p className="text-sm text-[var(--on-surface-variant)]">
                      {lote.cajas} cajas · {lote.sueltos} sueltos · {lote.unidades} unidades
                    </p>
                  </div>
                  <p className="text-sm text-[var(--on-surface-variant)]">
                    Vence {new Date(lote.fechaVencimiento).toLocaleDateString('es-AR')}
                  </p>
                </div>
              </div>
            ))}
            {lotes.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">Sin lotes cargados.</p>
            ) : null}
          </div>

          <Modal title="Nuevo lote" open={showLoteModal} onClose={() => setShowLoteModal(false)}>
            <form className="space-y-4" onSubmit={(event) => void handleSaveLote(event)}>
              <input
                value={loteForm.numero}
                onChange={(event) => setLoteForm({ ...loteForm, numero: event.target.value })}
                placeholder="Número de lote (opcional)"
                className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  type="number"
                  min={0}
                  value={loteForm.cajas}
                  onChange={(event) =>
                    setLoteForm({ ...loteForm, cajas: Number(event.target.value) })
                  }
                  placeholder="Cajas"
                  className="rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
                  required
                />
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={loteForm.sueltos}
                  onChange={(event) =>
                    setLoteForm({ ...loteForm, sueltos: Number(event.target.value) })
                  }
                  placeholder="Sueltos"
                  className="rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
                  required
                />
              </div>
              <input
                type="date"
                value={loteForm.fechaProduccion}
                onChange={(event) =>
                  setLoteForm({ ...loteForm, fechaProduccion: event.target.value })
                }
                className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
                required
              />
              <button
                type="submit"
                className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#07120b]"
              >
                Guardar lote
              </button>
            </form>
          </Modal>
        </div>
      </Modal>
    </div>
  )
}
