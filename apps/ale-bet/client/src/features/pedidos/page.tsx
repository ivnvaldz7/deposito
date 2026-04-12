import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Modal } from '@/components/modal'
import { Section, StatusChip } from '@/components/ui'
import {
  apiRequest,
  type Cliente,
  type Pedido,
  type PedidoItem,
  type Producto,
} from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

interface NewPedidoItem {
  productoId: string
  cantidad: number
}

function estadoLabel(estado: Pedido['estado']): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'Nuevo'
    case 'EN_ARMADO':
      return 'En prep.'
    case 'COMPLETADO':
      return 'OK'
    case 'CANCELADO':
      return 'Cancelado'
  }
}

function estadoTone(estado: Pedido['estado']): 'amber' | 'blue' | 'green' | 'slate' {
  switch (estado) {
    case 'PENDIENTE':
      return 'amber'
    case 'EN_ARMADO':
      return 'blue'
    case 'COMPLETADO':
      return 'green'
    case 'CANCELADO':
      return 'slate'
  }
}

export function PedidosPage() {
  const user = useAuthStore((state) => state.user)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [items, setItems] = useState<NewPedidoItem[]>([{ productoId: '', cantidad: 1 }])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const canCreate = user?.rol === 'admin' || user?.rol === 'vendedor'
  const canArm = user?.rol === 'admin' || user?.rol === 'armador'
  const canCancel = user?.rol === 'admin'

  async function loadData(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const pedidosData = await apiRequest<Pedido[]>('/api/pedidos')
      setPedidos(pedidosData)

      if (canCreate) {
        const [clientesData, productosData] = await Promise.all([
          apiRequest<Cliente[]>('/api/clientes'),
          apiRequest<Producto[]>('/api/productos'),
        ])
        setClientes(clientesData)
        setProductos(productosData.filter((producto) => producto.activo))
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los pedidos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const visiblePedidos = useMemo(() => {
    if (user?.rol === 'armador') {
      return pedidos.filter(
        (pedido) => pedido.estado === 'PENDIENTE' || pedido.armadorId === user.id
      )
    }

    return pedidos
  }, [pedidos, user])

  function updateItem(index: number, field: keyof NewPedidoItem, value: string | number): void {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    )
  }

  function addItem(): void {
    setItems((current) => [...current, { productoId: '', cantidad: 1 }])
  }

  function removeItem(index: number): void {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  async function handleCreatePedido(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await apiRequest<Pedido>('/api/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          clienteId,
          items: items.filter((item) => item.productoId),
        }),
      })

      setShowModal(false)
      setClienteId('')
      setItems([{ productoId: '', cantidad: 1 }])
      await loadData()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo crear el pedido')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTomarPedido(id: string): Promise<void> {
    await apiRequest<Pedido>(`/api/pedidos/${id}/tomar`, { method: 'PUT' })
    await loadData()
  }

  async function handleCompletarItem(pedidoId: string, itemId: string): Promise<void> {
    const updated = await apiRequest<Pedido>(`/api/pedidos/${pedidoId}/items/${itemId}/completar`, {
      method: 'PUT',
    })
    await loadData()
    setSelectedPedido(updated)
  }

  async function handleCancelarPedido(id: string): Promise<void> {
    await apiRequest<Pedido>(`/api/pedidos/${id}/cancelar`, { method: 'PUT' })
    await loadData()
  }

  if (loading) {
    return <p className="text-sm text-[var(--on-surface-variant)]">Cargando pedidos...</p>
  }

  return (
    <div className="space-y-6">
      <Section
        title="Pedidos"
        description="Gestión comercial y de armado por rol."
        action={
          canCreate ? (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#07120b]"
            >
              Nuevo pedido
            </button>
          ) : undefined
        }
      >
        {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}
        <div className="space-y-3">
          {visiblePedidos.map((pedido) => (
            <div
              key={pedido.id}
              className="rounded-2xl border border-white/6 bg-[var(--surface-lowest)] p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-[Montserrat] text-lg font-semibold">{pedido.numero}</p>
                  <p className="text-sm text-[var(--on-surface-variant)]">
                    {pedido.cliente.nombre} · {pedido.items.length} items
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={estadoLabel(pedido.estado)} tone={estadoTone(pedido.estado)} />
                  <button
                    type="button"
                    onClick={() => setSelectedPedido(pedido)}
                    className="rounded-xl border border-white/8 px-3 py-2 text-sm text-[var(--on-surface)]"
                  >
                    Ver detalle
                  </button>
                  {canArm && pedido.estado === 'PENDIENTE' ? (
                    <button
                      type="button"
                      onClick={() => void handleTomarPedido(pedido.id)}
                      className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sm text-sky-200"
                    >
                      Tomar pedido
                    </button>
                  ) : null}
                  {canCancel &&
                  (pedido.estado === 'PENDIENTE' || pedido.estado === 'EN_ARMADO') ? (
                    <button
                      type="button"
                      onClick={() => void handleCancelarPedido(pedido.id)}
                      className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {visiblePedidos.length === 0 ? (
            <p className="text-sm text-[var(--on-surface-variant)]">No hay pedidos para mostrar.</p>
          ) : null}
        </div>
      </Section>

      <Modal title="Nuevo pedido" open={showModal} onClose={() => setShowModal(false)}>
        <form className="space-y-4" onSubmit={(event) => void handleCreatePedido(event)}>
          <div>
            <label className="mb-2 block text-sm text-[var(--on-surface-variant)]">Cliente</label>
            <select
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
              className="w-full rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
              required
            >
              <option value="">Seleccionar</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={`${index}-${item.productoId}`}
                className="grid gap-3 md:grid-cols-[1fr_140px_110px]"
              >
                <select
                  value={item.productoId}
                  onChange={(event) => updateItem(index, 'productoId', event.target.value)}
                  className="rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
                  required
                >
                  <option value="">Producto</option>
                  {productos.map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.nombre} · {producto.stock} u
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={item.cantidad}
                  onChange={(event) => updateItem(index, 'cantidad', Number(event.target.value))}
                  className="rounded-xl border border-white/8 bg-[var(--surface-lowest)] px-4 py-3"
                  required
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  className="rounded-xl border border-white/8 px-3 py-3 text-sm text-[var(--on-surface-variant)] disabled:opacity-40"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addItem}
              className="rounded-xl border border-white/8 px-4 py-2 text-sm"
            >
              Agregar item
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#07120b] disabled:opacity-60"
            >
              {submitting ? 'Guardando...' : 'Guardar pedido'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title={selectedPedido ? `Pedido ${selectedPedido.numero}` : 'Detalle del pedido'}
        open={selectedPedido !== null}
        onClose={() => setSelectedPedido(null)}
      >
        {selectedPedido ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/6 bg-[var(--surface-lowest)] p-4">
              <p className="font-medium">{selectedPedido.cliente.nombre}</p>
              <p className="text-sm text-[var(--on-surface-variant)]">
                Creado {new Date(selectedPedido.createdAt).toLocaleString('es-AR')}
              </p>
            </div>
            <div className="space-y-3">
              {selectedPedido.items.map((item: PedidoItem) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/6 bg-[var(--surface-lowest)] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">{item.producto.nombre}</p>
                    <p className="text-sm text-[var(--on-surface-variant)]">
                      {item.cantidad} unidades
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip
                      label={item.completado ? 'Completado' : 'Pendiente'}
                      tone={item.completado ? 'green' : 'amber'}
                    />
                    {canArm &&
                    selectedPedido.estado === 'EN_ARMADO' &&
                    !item.completado ? (
                      <button
                        type="button"
                        onClick={() => void handleCompletarItem(selectedPedido.id, item.id)}
                        className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
                      >
                        Completar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
