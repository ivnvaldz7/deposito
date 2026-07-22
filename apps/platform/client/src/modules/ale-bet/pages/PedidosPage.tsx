import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
<<<<<<< Updated upstream
import { aleBetApi, type Pedido, type Cliente, type Producto } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/Badge'
=======
import { type Pedido } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { usePedidos, useCreatePedido, useAprobarPedido, useTomarPedido, useCompletarItemPedido, useCancelarPedido } from '../queries'
import { useClientes } from '../queries'
import { useProductos } from '../queries'
>>>>>>> Stashed changes

const ESTADO_PRIORITY: Record<Pedido['estado'], number> = {
  APROBADO: 0,
  EN_ARMADO: 1,
  PENDIENTE: 2,
  COMPLETADO: 3,
  CANCELADO: 4,
}

function getEstadoVariant(estado: Pedido['estado']): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (estado) {
    case 'PENDIENTE': return 'default'
    case 'APROBADO': return 'warning'
    case 'EN_ARMADO': return 'info'
    case 'COMPLETADO': return 'success'
    case 'CANCELADO': return 'error'
  }
}

export default function PedidosPage() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''

  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<{ clienteId: string; items: Array<{ productoId: string; cantidad: number }> }>({
    clienteId: '',
    items: [{ productoId: '', cantidad: 1 }],
  })

  const isAdmin = rol === 'admin'
  const isVendedor = rol === 'vendedor'
  const isArmador = rol === 'armador'

  const filters = useMemo(() => {
    const f: { estado?: string; vendedorId?: string } = {}
    if (estadoFilter) f.estado = estadoFilter
    if (isVendedor && user?.id) f.vendedorId = user.id
    return f
  }, [estadoFilter, isVendedor, user?.id])

  const { data: pedidos = [], isLoading, error } = usePedidos(filters)
  const { data: clientes = [] } = useClientes()
  const { data: productos = [] } = useProductos()
  const createMutation = useCreatePedido()
  const aprobarMutation = useAprobarPedido()
  const tomarMutation = useTomarPedido()
  const completarItemMutation = useCompletarItemPedido()
  const cancelarMutation = useCancelarPedido()

  const sortedPedidos = useMemo(() => {
    return [...pedidos].sort((a, b) => {
      const pa = ESTADO_PRIORITY[a.estado]
      const pb = ESTADO_PRIORITY[b.estado]
      if (pa !== pb) return pa - pb
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [pedidos])

  const activeClientes = useMemo(() => clientes.filter((c) => c.activo), [clientes])
  const activeProductos = useMemo(() => productos.filter((p) => p.activo), [productos])

  useEffect(() => {
    const id = (location.state as { openPedidoId?: string } | null)?.openPedidoId
    if (id) setExpandedId(id)
  }, [location.state])

  function openCreateModal() {
    setCreateForm({ clienteId: '', items: [{ productoId: '', cantidad: 1 }] })
    setShowCreate(true)
  }

  function addItemRow() {
    setCreateForm((f) => ({ ...f, items: [...f.items, { productoId: '', cantidad: 1 }] }))
  }

  function removeItemRow(idx: number) {
    setCreateForm((f) => {
      const items = f.items.filter((_, i) => i !== idx)
      return { ...f, items }
    })
  }

  function updateItem(idx: number, field: 'productoId' | 'cantidad', value: string | number) {
    setCreateForm((f) => {
      const items = f.items.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
      return { ...f, items }
    })
  }

  async function handleCreate() {
    if (!createForm.clienteId || createForm.items.some((i) => !i.productoId || i.cantidad < 1)) {
      alert('Completá todos los campos')
      return
    }
    try {
      await createMutation.mutateAsync(createForm)
      setShowCreate(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear pedido')
    }
  }

  function handleAprobar(id: string) {
    aprobarMutation.mutate(id, {
      onError: (e) => alert(e instanceof Error ? e.message : 'Error al aprobar'),
    })
  }

  function handleTomar(id: string) {
    tomarMutation.mutate(id, {
      onError: (e) => alert(e instanceof Error ? e.message : 'Error al tomar pedido'),
    })
  }

  function handleCompletarItem(pedidoId: string, itemId: string) {
    completarItemMutation.mutate({ pedidoId, itemId }, {
      onError: (e) => alert(e instanceof Error ? e.message : 'Error al completar item'),
    })
  }

  function handleCancelar(id: string) {
    if (!confirm('¿Cancelar este pedido?')) return
    cancelarMutation.mutate(id, {
      onError: (e) => alert(e instanceof Error ? e.message : 'Error al cancelar'),
    })
  }

  function canAprobar(p: Pedido) {
    if (p.estado !== 'PENDIENTE') return false
    if (isAdmin) return true
    if (isVendedor) return p.vendedorId === user?.id
    return false
  }

  function canTomar(p: Pedido) {
    if (p.estado !== 'APROBADO') return false
    return isAdmin || isArmador
  }

  function canCompletarItems(p: Pedido) {
    if (p.estado !== 'EN_ARMADO') return false
    return isAdmin || isArmador
  }

  function canCancelar(p: Pedido) {
    if (p.estado === 'COMPLETADO' || p.estado === 'CANCELADO') return false
    if (isAdmin) return true
    if (isVendedor) return p.estado === 'PENDIENTE' && p.vendedorId === user?.id
    return false
  }

  function canCreate() {
    return isAdmin || isVendedor
  }

<<<<<<< Updated upstream
  if (loading) return <p className="font-body text-sm text-on-surface-variant">Cargando pedidos...</p>
  if (error) return <p className="font-body text-sm text-error">{error}</p>
=======
  if (isLoading) return <p className="text-sm text-[var(--color-text-2)]">Cargando pedidos...</p>
  if (error) return <p className="text-sm text-[var(--color-danger)]">{error instanceof Error ? error.message : 'Error al cargar pedidos'}</p>
>>>>>>> Stashed changes

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[28px] font-bold tracking-[-0.03em] text-on-surface">Pedidos</h1>
          <p className="font-body text-[13px] text-on-surface-variant">Gestión de pedidos y armado</p>
        </div>
        {canCreate() && (
          <button onClick={openCreateModal} className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20">
            + Nuevo pedido
          </button>
        )}
      </div>

      <div className="flex gap-4">
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="input-field max-w-xs"
        >
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="APROBADO">Aprobado</option>
          <option value="EN_ARMADO">En armado</option>
          <option value="COMPLETADO">Completado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
      </div>

<<<<<<< Updated upstream
      <div className="bg-surface-container-high rounded-xl overflow-hidden">
        {pedidos.length === 0 ? (
          <p className="px-5 py-8 text-center font-body text-[13px] text-on-surface-variant">No hay pedidos.</p>
        ) : (
          <table className="w-full text-left font-body text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                <th className="px-5 py-3 font-medium">N°</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Vendedor</th>
                <th className="px-5 py-3 font-medium text-center">Items</th>
                <th className="px-5 py-3 font-medium text-center">Fecha</th>
                <th className="px-5 py-3 font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
=======
      <div className="app-panel overflow-hidden rounded-[12px]">
          {sortedPedidos.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-[var(--color-text-2)]">No hay pedidos.</p>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
                  <th className="px-5 py-3 font-medium">N°</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Vendedor</th>
                  <th className="px-5 py-3 font-medium text-center">Items</th>
                  <th className="px-5 py-3 font-medium text-center">Fecha</th>
                  <th className="px-5 py-3 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedPedidos.map((p) => {
>>>>>>> Stashed changes
                const isExpanded = expandedId === p.id
                const variant = getEstadoVariant(p.estado)
                return (
                  <tr key={p.id} className="border-b border-white/10 last:border-0">
                    <td className="px-5 py-4 font-semibold text-on-surface">{p.numero}</td>
                    <td className="px-5 py-4 text-on-surface">{p.cliente.nombre}</td>
                    <td className="px-5 py-4"><Badge variant={getEstadoVariant(p.estado)} className="w-[88px] justify-center">{p.estado.replace('_', ' ')}</Badge></td>
                    <td className="px-5 py-4 text-outline">{p.vendedorNombre ?? '—'}</td>
                    <td className="px-5 py-4 text-center text-outline">{p.items.length}</td>
                    <td className="px-5 py-4 text-center text-outline">
                      {new Date(p.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : p.id)}
                          className="font-body text-[11px] text-outline transition hover:text-on-surface"
                        >
                          {isExpanded ? 'Cerrar' : 'Ver'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pedido detail rows */}
      {sortedPedidos.filter((p) => expandedId === p.id).map((p) => (
        <div
          key={`detail-${p.id}`}
          className="bg-surface-container-high rounded-xl -mt-4"
          style={{ borderLeft: `3px solid ${
            p.estado === 'PENDIENTE' ? 'var(--color-on-surface-variant)' :
            p.estado === 'APROBADO' ? 'var(--color-warning)' :
            p.estado === 'EN_ARMADO' ? 'var(--color-primary)' :
            p.estado === 'COMPLETADO' ? 'var(--color-success)' :
            'var(--color-error)'
          }` }}
        >
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading text-[14px] font-bold text-on-surface">
                  {p.numero} — {p.cliente.nombre}
                </p>
                <p className="mt-1 font-body text-[11px] text-outline">
                  Vendedor: {p.vendedorNombre ?? '—'}{p.armadorNombre ? ` | Armador: ${p.armadorNombre}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAprobar(p) && (
                  <button
                    onClick={() => handleAprobar(p.id)}
                    className="rounded-full border border-warning/40 px-3 py-[6px] font-body text-[11px] font-semibold text-warning transition hover:bg-warning/20"
                  >
                    Aprobar
                  </button>
                )}
                {canTomar(p) && (
                  <button
                    onClick={() => handleTomar(p.id)}
                    className="rounded-full border border-primary/40 px-3 py-[6px] font-body text-[11px] font-semibold text-primary transition hover:bg-primary/20"
                  >
                    Tomar
                  </button>
                )}
                {canCancelar(p) && (
                  <button
                    onClick={() => handleCancelar(p.id)}
                    className="rounded-full border border-error/30 px-3 py-[6px] font-body text-[11px] font-semibold text-error transition hover:bg-error/10"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-left font-body text-[12px]">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.8px] text-outline">
                    <th className="px-4 py-2.5 font-medium">Producto</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cantidad</th>
                    <th className="px-4 py-2.5 font-medium text-center">Completado</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((item) => (
                    <tr key={item.id} className="border-b border-white/10 last:border-0">
                      <td className="px-4 py-3 font-medium text-on-surface">{item.producto.nombre}</td>
                      <td className="px-4 py-3 text-right text-outline">{item.cantidad}</td>
                      <td className="px-4 py-3 text-center">
                        {canCompletarItems(p) ? (
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.completado}
                              onChange={() => handleCompletarItem(p.id, item.id)}
                              className="h-4 w-4 rounded border-white/10 bg-surface-container text-primary accent-primary"
                            />
                            <span className={`font-body text-[11px] ${item.completado ? 'text-primary' : 'text-outline'}`}>
                              {item.completado ? 'Listo' : 'Pendiente'}
                            </span>
                          </label>
                        ) : (
                          <span className={`font-body text-[11px] ${item.completado ? 'text-primary' : 'text-outline'}`}>
                            {item.completado ? 'Sí' : 'No'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-surface-container-low p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-heading text-[18px] font-bold text-on-surface">
              Nuevo pedido
            </h2>
            <div className="space-y-4">
              <div>
                <label className="font-body text-[11px] text-outline">Cliente</label>
                <select
                  value={createForm.clienteId}
                  onChange={(e) => setCreateForm({ ...createForm, clienteId: e.target.value })}
                  className="input-field mt-1"
                >
                  <option value="">Seleccionar cliente</option>
                   {activeClientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="font-body text-[11px] text-outline">Items</label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="font-body text-[11px] font-medium text-primary transition hover:underline"
                  >
                    + Agregar item
                  </button>
                </div>
                <div className="space-y-3">
                  {createForm.items.map((item, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="flex-1">
                        <select
                          value={item.productoId}
                          onChange={(e) => updateItem(idx, 'productoId', e.target.value)}
                          className="input-field"
                        >
                          <option value="">Producto</option>
                          {activeProductos.map((pr) => (
                            <option key={pr.id} value={pr.id}>{pr.nombre} ({pr.sku})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min={1}
                          value={item.cantidad}
                          onChange={(e) => updateItem(idx, 'cantidad', Math.max(1, Number(e.target.value)))}
                          className="input-field"
                        />
                      </div>
                      {createForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="mb-0.5 font-body text-[13px] text-error transition hover:opacity-80"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-full border border-white/10 px-4 py-2 font-body text-[12px] text-outline transition hover:text-on-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
<<<<<<< Updated upstream
                  disabled={saving}
                  className="rounded-full border border-primary px-4 py-2 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
=======
                  disabled={createMutation.isPending}
                  className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)] disabled:opacity-50"
>>>>>>> Stashed changes
                >
                  {createMutation.isPending ? 'Guardando...' : 'Crear pedido'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
