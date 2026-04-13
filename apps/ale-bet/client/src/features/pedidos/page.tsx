import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
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
    case 'APROBADO':
      return 'Aprobado'
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
      return 'slate'
    case 'APROBADO':
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
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [items, setItems] = useState<NewPedidoItem[]>([{ productoId: '', cantidad: 1 }])
  const [error, setError] = useState<string | null>(null)
  const [pendingCancelPedidoId, setPendingCancelPedidoId] = useState<string | null>(null)
  const [animatedPedidoId, setAnimatedPedidoId] = useState<string | null>(null)
  const [animatedTone, setAnimatedTone] = useState<'success' | 'danger' | null>(null)
  const [newPedidoId, setNewPedidoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const canCreate = user?.rol === 'admin' || user?.rol === 'vendedor'
  const canApprove = user?.rol === 'admin' || user?.rol === 'vendedor'
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

  useEffect(() => {
    const state = location.state as { openPedidoId?: string } | null
    if (!state?.openPedidoId) {
      return
    }

    const pedido = pedidos.find((entry) => entry.id === state.openPedidoId)
    if (pedido) {
      setSelectedPedido(pedido)
    }
  }, [location.state, pedidos])

  const visiblePedidos = useMemo(() => {
    if (user?.rol === 'armador') {
      return pedidos.filter(
        pedido => pedido.estado === 'APROBADO' || pedido.armadorId === user.id
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

  function triggerPedidoFlash(id: string, tone: 'success' | 'danger'): void {
    setAnimatedPedidoId(id)
    setAnimatedTone(tone)

    window.setTimeout(() => {
      setAnimatedPedidoId((current) => (current === id ? null : current))
      setAnimatedTone((current) => (current === tone ? null : current))
    }, 600)
  }

  function triggerNewPedido(id: string): void {
    setNewPedidoId(id)

    window.setTimeout(() => {
      setNewPedidoId((current) => (current === id ? null : current))
    }, 300)
  }

  async function handleCreatePedido(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const created = await apiRequest<Pedido>('/api/pedidos', {
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
      triggerNewPedido(created.id)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo crear el pedido')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTomarPedido(id: string): Promise<void> {
    await apiRequest<Pedido>(`/api/pedidos/${id}/tomar`, { method: 'PUT' })
    await loadData()
    triggerPedidoFlash(id, 'success')
  }

  async function handleAprobarPedido(id: string): Promise<void> {
    await apiRequest<Pedido>(`/api/pedidos/${id}/aprobar`, { method: 'PUT' })
    await loadData()
    triggerPedidoFlash(id, 'success')
  }

  async function handleCompletarItem(pedidoId: string, itemId: string): Promise<void> {
    const updated = await apiRequest<Pedido>(`/api/pedidos/${pedidoId}/items/${itemId}/completar`, {
      method: 'PUT',
    })
    await loadData()
    setSelectedPedido(updated)
    triggerPedidoFlash(pedidoId, 'success')
  }

  async function handleCancelarPedido(id: string): Promise<void> {
    await apiRequest<Pedido>(`/api/pedidos/${id}/cancelar`, { method: 'PUT' })
    setPendingCancelPedidoId(null)
    await loadData()
    triggerPedidoFlash(id, 'danger')
  }

  if (loading) {
    return <p className="text-sm text-[var(--on-surface-variant)]">Cargando pedidos...</p>
  }

  return (
    <div className="space-y-6 bg-[#0d0d0d] text-white">
      <Section
        title="Pedidos"
        description="Gestión comercial y de armado por rol."
        action={
          canCreate ? (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded-[8px] bg-[#22c55e] px-4 py-[9px] text-[13px] font-semibold text-[#0d0d0d]"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            >
              Nuevo pedido
            </button>
          ) : undefined
        }
      >
        {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}
        <div className="overflow-hidden rounded-[8px] border border-[#1e1e1e] bg-[#0d0d0d]">
          {visiblePedidos.map((pedido) => (
            <div
              key={pedido.id}
              className={`border-b border-[#161616] px-4 py-[14px] transition-colors hover:bg-[#111111] ${
                newPedidoId === pedido.id
                  ? 'alebet-enter-new'
                  : animatedPedidoId === pedido.id
                    ? animatedTone === 'danger'
                      ? 'alebet-flash-danger'
                      : 'alebet-flash-success'
                    : ''
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-[Montserrat] text-lg font-semibold text-white">{pedido.numero}</p>
                  <p className="text-sm text-[#6b7280]">
                    {pedido.cliente.nombre} · {pedido.items.length} items
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={estadoLabel(pedido.estado)} tone={estadoTone(pedido.estado)} />
                  <button
                    type="button"
                    onClick={() => setSelectedPedido(pedido)}
                    className="rounded-[8px] border border-[#1e1e1e] px-3 py-2 text-sm text-white transition hover:border-[#2a2a2a] hover:bg-[#111111]"
                  >
                    Ver detalle
                  </button>
                  {canApprove && pedido.estado === 'PENDIENTE' ? (
                    <button
                      type="button"
                      onClick={() => void handleAprobarPedido(pedido.id)}
                      className="rounded-[8px] border border-[#854f0b] bg-[#1c1a0a] px-3 py-2 text-sm text-[#f59e0b]"
                    >
                      Aprobar
                    </button>
                  ) : null}
                  {canArm && pedido.estado === 'APROBADO' ? (
                    <button
                      type="button"
                      onClick={() => void handleTomarPedido(pedido.id)}
                      className="rounded-[8px] border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sm text-sky-200"
                    >
                      Tomar
                    </button>
                  ) : null}
                  {canCancel && pedido.estado !== 'COMPLETADO' ? (
                    <button
                      type="button"
                      onClick={() => setPendingCancelPedidoId((current) => current === pedido.id ? null : pedido.id)}
                      className="rounded-[8px] border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
              {pendingCancelPedidoId === pedido.id ? (
                <div className="mt-3 rounded-[6px] border border-[#2a2a2a] bg-[#111111] px-3 py-3">
                  <p className="text-[12px] text-[#e5e7eb]">¿Cancelar pedido {pedido.numero}?</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingCancelPedidoId(null)}
                      className="rounded-[6px] border border-[#1e1e1e] px-3 py-2 text-[12px] text-[#6b7280] transition hover:border-[#374151] hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCancelarPedido(pedido.id)}
                      className="rounded-[6px] bg-[#ef4444] px-3 py-2 text-[12px] font-semibold text-white"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {visiblePedidos.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#6b7280]">No hay pedidos para mostrar.</p>
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
              className="rounded-[8px] bg-[#22c55e] px-4 py-[9px] text-[13px] font-semibold text-[#0d0d0d] disabled:opacity-60"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
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
