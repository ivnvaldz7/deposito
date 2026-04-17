import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Section, StatusChip } from '@/components/ui'
import { apiBlobRequest, apiRequest, type Cliente, type HistorialPedido, type Pedido } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

interface HistorialFilters {
  desde: string
  hasta: string
  clienteId: string
  estado: '' | Pedido['estado']
  vendedorId: string
}

interface VendedorOption {
  id: string
  nombre: string
}

const emptyFilters: HistorialFilters = {
  desde: '',
  hasta: '',
  clienteId: '',
  estado: '',
  vendedorId: '',
}

const filterControlStyle = {
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '13px',
  outline: 'none',
  cursor: 'pointer',
  width: '200px',
} as const

const dateInputStyle = {
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '13px',
  outline: 'none',
  cursor: 'pointer',
  colorScheme: 'dark',
  width: '100%',
} as const

function buildQuery(filters: HistorialFilters, isAdmin: boolean): string {
  const params = new URLSearchParams()

  if (filters.desde) {
    params.set('desde', filters.desde)
  }

  if (filters.hasta) {
    params.set('hasta', filters.hasta)
  }

  if (filters.clienteId) {
    params.set('clienteId', filters.clienteId)
  }

  if (filters.estado) {
    params.set('estado', filters.estado)
  }

  if (isAdmin && filters.vendedorId) {
    params.set('vendedorId', filters.vendedorId)
  }

  const query = params.toString()
  return query.length > 0 ? `?${query}` : ''
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

function getStatusTone(estado: Pedido['estado']): 'amber' | 'blue' | 'green' | 'red' | 'slate' {
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
      return 'red'
  }
}

function renderProductos(items: HistorialPedido['items']) {
  const visibleItems = items.slice(0, 2)
  const remaining = items.length - visibleItems.length

  return (
    <div className="space-y-1">
      {visibleItems.map((item) => (
        <p key={`${item.productoNombre}-${item.cantidad}`} className="text-[12px] text-[var(--color-text)]">
          {item.productoNombre} ×{item.cantidad}
        </p>
      ))}
      {remaining > 0 ? <p className="text-[11px] text-[var(--color-text-3)]">y {remaining} más...</p> : null}
    </div>
  )
}

export function HistorialPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.rol === 'admin'
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pedidos, setPedidos] = useState<HistorialPedido[]>([])
  const [vendedores, setVendedores] = useState<VendedorOption[]>([])
  const [filters, setFilters] = useState<HistorialFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<HistorialFilters>(emptyFilters)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadData(activeFilters: HistorialFilters = appliedFilters): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const requests = [
        apiRequest<Cliente[]>('/api/clientes'),
        apiRequest<HistorialPedido[]>(`/api/historial${buildQuery(activeFilters, isAdmin)}`),
      ] as const

      const [clientesData, historialData, pedidosData] = await Promise.all([
        ...requests,
        isAdmin ? apiRequest<Pedido[]>('/api/pedidos') : Promise.resolve([] as Pedido[]),
      ])

      setClientes(clientesData)
      setPedidos(historialData)

      if (isAdmin) {
        const vendedoresMap = new Map<string, string>()

        for (const pedido of pedidosData) {
          if (pedido.vendedorNombre) {
            vendedoresMap.set(pedido.vendedorId, pedido.vendedorNombre)
          }
        }

        setVendedores(
          [...vendedoresMap.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es-AR'))
            .map(([id, nombre]) => ({ id, nombre }))
        )
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el historial')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData(emptyFilters)
  }, [])

  useEffect(() => {
    const handler = () => {
      void loadData(appliedFilters)
    }

    window.addEventListener('alebet:refresh', handler)

    return () => {
      window.removeEventListener('alebet:refresh', handler)
    }
  }, [appliedFilters])

  async function handleExport(): Promise<void> {
    setExporting(true)
    setError(null)

    try {
      const query = buildQuery(appliedFilters, isAdmin)
      const blob = await apiBlobRequest(`/api/historial/export${query}`)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'historial-pedidos.xlsx'
      document.body.append(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'No se pudo exportar el historial')
    } finally {
      setExporting(false)
    }
  }

  async function handleApplyFilters(): Promise<void> {
    setAppliedFilters(filters)
    await loadData(filters)
  }

  async function handleResetFilters(): Promise<void> {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    await loadData(emptyFilters)
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-text-2)]">Cargando historial...</p>
  }

  const gridTemplateColumns = isAdmin ? '1.7fr 1.5fr 1fr 1fr 1fr 100px' : '1.7fr 1.5fr 1fr 1fr 100px'

  return (
    <div className="space-y-6 text-[var(--color-text)]">
      <Section
        title="Historial de pedidos"
        description={isAdmin ? 'Todos los pedidos' : 'Mis pedidos'}
        action={
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--color-accent)] px-4 py-[9px] text-[13px] font-semibold text-[#e8f5eb] transition hover:bg-[var(--color-accent-h)] disabled:opacity-60"
            style={{ fontFamily: 'Montserrat, sans-serif' }}
          >
            <Download size={14} />
            Exportar Excel
          </button>
        }
      >
        {error ? <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p> : null}

        <div className="grid gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-2 xl:grid-cols-7">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Desde</label>
            <input
              type="date"
              value={filters.desde}
              onChange={(event) => setFilters((current) => ({ ...current, desde: event.target.value }))}
              style={dateInputStyle}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Hasta</label>
            <input
              type="date"
              value={filters.hasta}
              onChange={(event) => setFilters((current) => ({ ...current, hasta: event.target.value }))}
              style={dateInputStyle}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Cliente</label>
            <select
              value={filters.clienteId}
              onChange={(event) => setFilters((current) => ({ ...current, clienteId: event.target.value }))}
              style={filterControlStyle}
            >
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Estado</label>
            <select
              value={filters.estado}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  estado: event.target.value as HistorialFilters['estado'],
                }))
              }
              style={filterControlStyle}
            >
              <option value="">Todos</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="APROBADO">APROBADO</option>
              <option value="EN_ARMADO">EN_ARMADO</option>
              <option value="COMPLETADO">COMPLETADO</option>
              <option value="CANCELADO">CANCELADO</option>
            </select>
          </div>

          {isAdmin ? (
            <div>
              <label className="mb-1 block text-[11px] text-[var(--color-text-2)]">Vendedor</label>
              <select
                value={filters.vendedorId}
                onChange={(event) => setFilters((current) => ({ ...current, vendedorId: event.target.value }))}
                style={filterControlStyle}
              >
                <option value="">Todos</option>
                {vendedores.map((vendedor) => (
                  <option key={vendedor.id} value={vendedor.id}>
                    {vendedor.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleApplyFilters()}
              className="w-full rounded-[8px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-text)] transition hover:border-[var(--color-text-3)]"
            >
              Filtrar
            </button>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleResetFilters()}
              className="w-full rounded-[8px] border border-[var(--color-border)] bg-transparent px-4 py-[9px] text-[13px] font-semibold text-[var(--color-text-2)] transition hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <div
            className="grid gap-4 border-b border-[var(--color-border)] px-4 py-3 text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]"
            style={{ gridTemplateColumns }}
          >
            <div>Cliente</div>
            <div>Productos</div>
            <div>Fecha</div>
            {isAdmin ? <div>Vendedor</div> : null}
            <div>Armador</div>
            <div className="text-center">Estado</div>
          </div>

          {pedidos.map((pedido) => (
            <div
              key={pedido.id}
              className="grid gap-4 border-b border-[var(--color-border)] px-4 py-4 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
              style={{ gridTemplateColumns }}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {pedido.clienteNombre}
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-text-3)]">
                  {pedido.numero} · {pedido.items.length} items
                </p>
              </div>

              <div>{renderProductos(pedido.items)}</div>

              <div className="text-[12px] text-[var(--color-text-2)]">{formatDate(pedido.createdAt)}</div>

              {isAdmin ? <div className="text-[12px] text-[var(--color-text)]">{pedido.vendedorNombre}</div> : null}

              <div className="text-[12px] text-[var(--color-text)]">{pedido.armadorNombre ?? '—'}</div>

              <div className="flex justify-center">
                <StatusChip label={pedido.estado.replace('_', ' ')} tone={getStatusTone(pedido.estado)} />
              </div>
            </div>
          ))}

          {pedidos.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-[var(--color-text-2)]">
              No hay pedidos para los filtros seleccionados
            </p>
          ) : null}
        </div>
      </Section>
    </div>
  )
}
