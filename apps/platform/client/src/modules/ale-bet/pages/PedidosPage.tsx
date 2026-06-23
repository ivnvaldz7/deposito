import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { aleBetApi, type Pedido, type Cliente, type Producto, type PedidoItem } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'

const ESTADO_PRIORITY: Record<Pedido['estado'], number> = {
  APROBADO: 0,
  EN_ARMADO: 1,
  PENDIENTE: 2,
  COMPLETADO: 3,
  CANCELADO: 4,
}

function getEstadoBadge(estado: Pedido['estado']) {
  const map: Record<Pedido['estado'], { bg: string; color: string; border: string }> = {
    PENDIENTE: { bg: 'rgba(116,121,111,0.14)', color: '#bccbb8', border: 'rgba(116,121,111,0.28)' },
    APROBADO: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.28)' },
    EN_ARMADO: { bg: 'rgba(96,165,250,0.12)', color: '#93c5fd', border: 'rgba(96,165,250,0.28)' },
    COMPLETADO: { bg: 'rgba(26,107,53,0.1)', color: '#bccbb8', border: 'rgba(26,107,53,0.22)' },
    CANCELADO: { bg: 'rgba(239,68,68,0.08)', color: '#d6a8a8', border: 'rgba(239,68,68,0.2)' },
  }
  return map[estado]
}

function Badge({ estado }: { estado: Pedido['estado'] }) {
  const s = getEstadoBadge(estado)
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        width: '88px',
        padding: '3px 0',
      }}
    >
      {estado.replace('_', ' ')}
    </span>
  )
}

export default function PedidosPage() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [createForm, setCreateForm] = useState<{ clienteId: string; items: Array<{ productoId: string; cantidad: number }> }>({
    clienteId: '',
    items: [{ productoId: '', cantidad: 1 }],
  })
  const [saving, setSaving] = useState(false)

  const isAdmin = rol === 'admin'
  const isVendedor = rol === 'vendedor'
  const isArmador = rol === 'armador'

  async function loadPedidos() {
    setLoading(true)
    setError(null)
    try {
      const params: { estado?: string; vendedorId?: string } = {}
      if (estadoFilter) params.estado = estadoFilter
      if (isVendedor && user?.id) params.vendedorId = user.id
      const data = await aleBetApi.pedidos.list(params)
      data.sort((a, b) => {
        const pa = ESTADO_PRIORITY[a.estado]
        const pb = ESTADO_PRIORITY[b.estado]
        if (pa !== pb) return pa - pb
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      setPedidos(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPedidos() }, [estadoFilter, isVendedor, user?.id])

  useEffect(() => {
    const id = (location.state as { openPedidoId?: string } | null)?.openPedidoId
    if (id) setExpandedId(id)
  }, [location.state])

  async function openCreateModal() {
    try {
      const [c, p] = await Promise.all([aleBetApi.clientes.list(), aleBetApi.productos.list()])
      setClientes(c.filter((cl) => cl.activo))
      setProductos(p.filter((pr) => pr.activo))
      setCreateForm({ clienteId: '', items: [{ productoId: '', cantidad: 1 }] })
      setShowCreate(true)
    } catch {
      alert('Error al cargar datos para crear pedido')
    }
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
    setSaving(true)
    try {
      await aleBetApi.pedidos.create(createForm)
      setShowCreate(false)
      void loadPedidos()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear pedido')
    } finally {
      setSaving(false)
    }
  }

  async function handleAprobar(id: string) {
    try {
      await aleBetApi.pedidos.aprobar(id)
      void loadPedidos()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al aprobar')
    }
  }

  async function handleTomar(id: string) {
    try {
      await aleBetApi.pedidos.tomar(id)
      void loadPedidos()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al tomar pedido')
    }
  }

  async function handleCompletarItem(pedidoId: string, itemId: string) {
    try {
      await aleBetApi.pedidos.completarItem(pedidoId, itemId)
      void loadPedidos()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al completar item')
    }
  }

  async function handleCancelar(id: string) {
    if (!confirm('¿Cancelar este pedido?')) return
    try {
      await aleBetApi.pedidos.cancelar(id)
      void loadPedidos()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cancelar')
    }
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

  if (loading) return <p className="text-sm text-[var(--color-text-2)]">Cargando pedidos...</p>
  if (error) return <p className="text-sm text-[var(--color-danger)]">{error}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Pedidos</h1>
          <p className="text-[13px] text-[var(--color-text-2)]">Gestión de pedidos y armado</p>
        </div>
        {canCreate() && (
          <button onClick={openCreateModal} className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]">
            + Nuevo pedido
          </button>
        )}
      </div>

      <div className="flex gap-4">
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
        >
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="APROBADO">Aprobado</option>
          <option value="EN_ARMADO">En armado</option>
          <option value="COMPLETADO">Completado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
      </div>

      <div className="app-panel overflow-hidden rounded-[12px]">
        {pedidos.length === 0 ? (
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
              {pedidos.map((p) => {
                const isExpanded = expandedId === p.id
                const badge = getEstadoBadge(p.estado)
                return (
                  <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-5 py-4 font-semibold text-[var(--color-text)]">{p.numero}</td>
                    <td className="px-5 py-4 text-[var(--color-text)]">{p.cliente.nombre}</td>
                    <td className="px-5 py-4"><Badge estado={p.estado} /></td>
                    <td className="px-5 py-4 text-[var(--color-text-3)]">{p.vendedorNombre ?? '—'}</td>
                    <td className="px-5 py-4 text-center text-[var(--color-text-3)]">{p.items.length}</td>
                    <td className="px-5 py-4 text-center text-[var(--color-text-3)]">
                      {new Date(p.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : p.id)}
                          className="text-[11px] text-[var(--color-text-3)] transition hover:text-[var(--color-text)]"
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
      {pedidos.filter((p) => expandedId === p.id).map((p) => (
        <div
          key={`detail-${p.id}`}
          className="app-panel -mt-4 rounded-[12px]"
          style={{ borderLeft: `3px solid ${getEstadoBadge(p.estado).color}` }}
        >
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {p.numero} — {p.cliente.nombre}
                </p>
                <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                  Vendedor: {p.vendedorNombre ?? '—'}{p.armadorNombre ? ` | Armador: ${p.armadorNombre}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAprobar(p) && (
                  <button
                    onClick={() => handleAprobar(p.id)}
                    className="rounded-full border border-[rgba(245,158,11,0.4)] px-3 py-[6px] text-[11px] font-semibold text-[#f59e0b] transition hover:bg-[rgba(245,158,11,0.12)]"
                  >
                    Aprobar
                  </button>
                )}
                {canTomar(p) && (
                  <button
                    onClick={() => handleTomar(p.id)}
                    className="rounded-full border border-[rgba(96,165,250,0.4)] px-3 py-[6px] text-[11px] font-semibold text-[#93c5fd] transition hover:bg-[rgba(96,165,250,0.12)]"
                  >
                    Tomar
                  </button>
                )}
                {canCancelar(p) && (
                  <button
                    onClick={() => handleCancelar(p.id)}
                    className="rounded-full border border-[rgba(239,68,68,0.3)] px-3 py-[6px] text-[11px] font-semibold text-[#d6a8a8] transition hover:bg-[rgba(239,68,68,0.08)]"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-[8px] border border-[var(--color-border)]">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
                    <th className="px-4 py-2.5 font-medium">Producto</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cantidad</th>
                    <th className="px-4 py-2.5 font-medium text-center">Completado</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3 font-medium text-[var(--color-text)]">{item.producto.nombre}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-3)]">{item.cantidad}</td>
                      <td className="px-4 py-3 text-center">
                        {canCompletarItems(p) ? (
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.completado}
                              onChange={() => handleCompletarItem(p.id, item.id)}
                              className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-accent)] accent-[var(--color-accent)]"
                            />
                            <span className={`text-[11px] ${item.completado ? 'text-[#7ff6a1]' : 'text-[var(--color-text-3)]'}`}>
                              {item.completado ? 'Listo' : 'Pendiente'}
                            </span>
                          </label>
                        ) : (
                          <span className={`text-[11px] ${item.completado ? 'text-[#7ff6a1]' : 'text-[var(--color-text-3)]'}`}>
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
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-[18px] font-bold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Nuevo pedido
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-[var(--color-text-3)]">Cliente</label>
                <select
                  value={createForm.clienteId}
                  onChange={(e) => setCreateForm({ ...createForm, clienteId: e.target.value })}
                  className="mt-1 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
                >
                  <option value="">Seleccionar cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[11px] text-[var(--color-text-3)]">Items</label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-[11px] font-medium text-[var(--color-accent)] transition hover:underline"
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
                          className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
                        >
                          <option value="">Producto</option>
                          {productos.map((pr) => (
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
                          className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
                        />
                      </div>
                      {createForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="mb-0.5 text-[13px] text-[var(--color-danger)] transition hover:opacity-80"
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
                  className="rounded-full border border-[var(--color-border)] px-4 py-2 text-[12px] text-[var(--color-text-3)] transition hover:text-[var(--color-text)]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)] disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Crear pedido'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
