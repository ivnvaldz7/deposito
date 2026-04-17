import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiRequest, type DashboardOverview, type DashboardPedidoReciente, type Pedido } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

function formatDashboardDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const time = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (current.getTime() === today.getTime()) {
    return `Hoy ${time}`
  }

  if (current.getTime() === yesterday.getTime()) {
    return `Ayer ${time}`
  }

  const dayMonth = date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
  })

  return `${dayMonth} ${time}`
}

const getInitials = (nombre: string) => {
  if (!nombre) return '?'
  if (nombre === 'Admin Ale-Bet' || nombre.includes('Admin')) return 'IV'
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

function isAdminVendor(name: string): boolean {
  return name.includes('Admin') || name.includes('admin')
}

function getEstadoBadgeStyle(estado: Pedido['estado']): {
  background: string
  color: string
  border: string
} {
  switch (estado) {
    case 'PENDIENTE':
      return { background: 'rgba(116, 121, 111, 0.14)', color: '#bccbb8', border: '1px solid rgba(116, 121, 111, 0.28)' }
    case 'APROBADO':
      return { background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.28)' }
    case 'EN_ARMADO':
      return { background: 'rgba(96, 165, 250, 0.12)', color: '#93c5fd', border: '1px solid rgba(96, 165, 250, 0.28)' }
    case 'COMPLETADO':
      return { background: 'rgba(26, 107, 53, 0.1)', color: '#bccbb8', border: '1px solid rgba(26, 107, 53, 0.22)' }
    case 'CANCELADO':
      return { background: 'rgba(239, 68, 68, 0.08)', color: '#d6a8a8', border: '1px solid rgba(239, 68, 68, 0.2)' }
  }
}

function MetricCard({
  label,
  value,
  subtitle,
  valueClassName,
  onClick,
}: {
  label: string
  value: number
  subtitle: string
  valueClassName: string
  onClick?: () => void
}) {
  const clickable = typeof onClick === 'function'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`app-panel rounded-[12px] px-5 py-5 text-left transition ${
        clickable ? 'cursor-pointer hover:border-[var(--color-text-3)] hover:translate-y-[-1px]' : 'cursor-default'
      }`}
      disabled={!clickable}
    >
      <p className="text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">{label}</p>
      <p className={`mt-4 text-[48px] font-bold leading-none ${valueClassName}`} style={{ fontFamily: 'Montserrat, sans-serif' }}>
        {value}
      </p>
      <p className="mt-3 max-w-[20ch] text-[11px] text-[var(--color-text-2)]">{subtitle}</p>
    </button>
  )
}

function PedidoRow({
  pedido,
  onComplete,
}: {
  pedido: DashboardPedidoReciente
  onComplete: (pedidoId: string) => void
}) {
  const adminVendor = isAdminVendor(pedido.vendedorNombre)
  const estadoBadgeStyle = getEstadoBadgeStyle(pedido.estado)

  return (
    <div className="grid grid-cols-[1.8fr_1fr_1fr_100px_100px] items-center gap-4 border-b border-[var(--color-border)] px-5 py-4">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          {pedido.clienteNombre}
        </p>
        <p className="mt-1 text-[10px] text-[var(--color-text-3)]">
          {pedido.numero} · {pedido.cantidadItems} items
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] font-semibold"
          style={
            adminVendor
              ? { background: 'rgba(26, 107, 53, 0.16)', color: '#7ff6a1', borderColor: 'rgba(26, 107, 53, 0.4)' }
              : { background: 'rgba(116, 121, 111, 0.14)', color: '#bccbb8', borderColor: 'rgba(116, 121, 111, 0.28)' }
          }
        >
          {getInitials(pedido.vendedorNombre)}
        </span>
        <span className={`truncate text-[11px] ${adminVendor ? 'font-bold text-[var(--color-text-2)]' : 'text-[var(--color-text-3)]'}`}>
          {pedido.vendedorNombre}
        </span>
      </div>

      <div className="text-[11px] text-[var(--color-text-3)]">{formatDashboardDate(pedido.createdAt)}</div>

      <div className="flex justify-center">
        <span
          style={{
            ...estadoBadgeStyle,
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 0',
            borderRadius: '999px',
            width: '88px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {pedido.estado.replace('_', ' ')}
        </span>
      </div>

      <div className="flex justify-center">
        {pedido.estado === 'EN_ARMADO' ? (
          <button
            type="button"
            onClick={() => onComplete(pedido.id)}
            className="w-[88px] rounded-full border border-[var(--color-accent)] px-3 py-[7px] text-[11px] font-semibold text-[#7ff6a1] transition hover:bg-[rgba(26,107,53,0.16)]"
          >
            Completar
          </button>
        ) : (
          <span className="block h-[32px] w-[88px]" />
        )}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [animatedPedidoId, setAnimatedPedidoId] = useState<string | null>(null)
  const [animatedTone, setAnimatedTone] = useState<'success' | 'danger' | null>(null)

  async function loadData(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const response = await apiRequest<DashboardOverview>('/api/dashboard')
      setData(response)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    const handler = () => {
      void loadData()
    }

    window.addEventListener('alebet:refresh', handler)

    return () => {
      window.removeEventListener('alebet:refresh', handler)
    }
  }, [])

  useEffect(() => {
    const state = location.state as { flashPedidoId?: string; flashTone?: 'success' | 'danger' } | null

    if (!state?.flashPedidoId || !state.flashTone) {
      return
    }

    setAnimatedPedidoId(state.flashPedidoId)
    setAnimatedTone(state.flashTone)

    const timeoutId = window.setTimeout(() => {
      setAnimatedPedidoId(null)
      setAnimatedTone(null)
    }, 600)

    return () => window.clearTimeout(timeoutId)
  }, [location.state])

  if (loading) {
    return <p className="text-sm text-[var(--color-text-2)]">Cargando dashboard...</p>
  }

  if (error || !data) {
    return <p className="text-sm text-[var(--color-danger)]">{error ?? 'No se pudo cargar el dashboard'}</p>
  }

  const isAdmin = user?.rol === 'admin'

  return (
    <div className="space-y-6 text-[var(--color-text)]">
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          Dashboard
        </h1>
        <p className="text-[13px] text-[var(--color-text-2)]">Vista operativa consolidada</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Stock crítico"
          value={data.stockCritico}
          subtitle="Productos por debajo del mínimo"
          valueClassName="text-[var(--color-danger)]"
          onClick={isAdmin ? () => navigate('/productos') : undefined}
        />
        <MetricCard
          label="Pedidos hoy"
          value={data.pedidosHoy}
          subtitle="Pedidos creados en el día"
          valueClassName="text-[var(--color-text)]"
          onClick={isAdmin ? () => navigate('/pedidos') : undefined}
        />
        <MetricCard
          label="En armado"
          value={data.enArmado}
          subtitle="Pedidos tomados por armado"
          valueClassName="text-[var(--color-warning)]"
          onClick={isAdmin ? () => navigate('/pedidos') : undefined}
        />
        <MetricCard
          label="TOTAL PRODUCTOS"
          value={data.totalProductos}
          subtitle="en inventario"
          valueClassName="text-[var(--color-text)]"
          onClick={isAdmin ? () => navigate('/stock') : undefined}
        />
      </div>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Pedidos recientes
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/pedidos')}
            className="text-[12px] font-medium text-[var(--color-text-2)] transition hover:text-[var(--color-text)]"
          >
            Ver todos →
          </button>
        </div>

        <div className="app-panel overflow-hidden rounded-[12px]">
          <div className="grid grid-cols-[1.8fr_1fr_1fr_100px_100px] gap-4 border-b border-[var(--color-border)] px-5 py-3 text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
            <div>Cliente</div>
            <div>Vendedor</div>
            <div>Fecha</div>
            <div className="text-center">Estado</div>
            <div className="text-center">Acción</div>
          </div>

          {data.pedidosRecientes.map((pedido) => {
            const animationClass =
              animatedPedidoId === pedido.id
                ? animatedTone === 'danger'
                  ? 'alebet-flash-danger'
                  : 'alebet-flash-success'
                : ''

            return (
              <div key={pedido.id} className={animationClass}>
                <PedidoRow
                  pedido={pedido}
                  onComplete={(pedidoId) => navigate('/pedidos', { state: { openPedidoId: pedidoId } })}
                />
              </div>
            )
          })}

          {data.pedidosRecientes.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--color-text-2)]">No hay pedidos recientes.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
