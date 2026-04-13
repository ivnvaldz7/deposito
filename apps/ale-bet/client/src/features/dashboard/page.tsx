import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiRequest, type DashboardOverview, type DashboardPedidoReciente, type Pedido } from '@/lib/api'

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
      return { background: '#161616', color: '#6b7280', border: '1px solid #2a2a2a' }
    case 'APROBADO':
      return { background: '#1c1a0a', color: '#f59e0b', border: '1px solid #854f0b' }
    case 'EN_ARMADO':
      return { background: '#0f1520', color: '#60a5fa', border: '1px solid #1e3a5f' }
    case 'COMPLETADO':
      return { background: '#0a0a0a', color: '#4b5563', border: '1px solid #1e1e1e' }
    case 'CANCELADO':
      return { background: '#0a0a0a', color: '#3d3d3d', border: '1px solid #1a1a1a' }
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
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[8px] border border-[#1e1e1e] bg-[#111111] px-[18px] py-5 text-left transition hover:border-[#2a2a2a]"
    >
      <p className="text-[10px] uppercase tracking-[0.8px] text-[#4b5563]">{label}</p>
      <p className={`mt-4 text-[48px] font-bold leading-none ${valueClassName}`} style={{ fontFamily: 'Montserrat, sans-serif' }}>
        {value}
      </p>
      <p className="mt-3 text-[10px] text-[#374151]">{subtitle}</p>
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
    <div className="grid grid-cols-[1.8fr_1fr_1fr_100px_100px] items-center gap-4 border-b border-[#161616] px-4 py-[14px]">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-[#e5e7eb]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          {pedido.numero}
        </p>
        <p className="mt-1 text-[10px] text-[#4b5563]">
          {pedido.clienteNombre} · {pedido.cantidadItems} ítems
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] font-semibold"
          style={
            adminVendor
              ? { background: '#0a2410', color: '#1a6b35', borderColor: '#1a6b35' }
              : { background: '#1e1e1e', color: '#6b7280', borderColor: '#2a2a2a' }
          }
        >
          {getInitials(pedido.vendedorNombre)}
        </span>
        <span className={`truncate text-[11px] ${adminVendor ? 'font-bold text-[#9ca3af]' : 'text-[#6b7280]'}`}>
          {pedido.vendedorNombre}
        </span>
      </div>

      <div className="text-[11px] text-[#4b5563]">{formatDashboardDate(pedido.createdAt)}</div>

      <div className="flex justify-center">
        <span
          style={{
            ...estadoBadgeStyle,
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 0',
            borderRadius: '4px',
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
            className="w-[88px] rounded-[8px] border border-[#22c55e] px-3 py-[7px] text-[11px] font-semibold text-[#22c55e] transition hover:bg-[#052e16]"
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
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [animatedPedidoId, setAnimatedPedidoId] = useState<string | null>(null)
  const [animatedTone, setAnimatedTone] = useState<'success' | 'danger' | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
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

    void load()
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
    return <p className="text-sm text-[#6b7280]">Cargando dashboard...</p>
  }

  if (error || !data) {
    return <p className="text-sm text-[#ef4444]">{error ?? 'No se pudo cargar el dashboard'}</p>
  }

  return (
    <div className="space-y-6 bg-[#0d0d0d] text-white">
      <div>
        <h1 className="text-[22px] font-bold text-white" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          Dashboard
        </h1>
        <p className="mt-1 text-[12px] text-[#6b7280]">Vista operativa consolidada</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Stock crítico"
          value={data.stockCritico}
          subtitle="Productos por debajo del mínimo"
          valueClassName="text-[#ef4444]"
          onClick={() => navigate('/productos')}
        />
        <MetricCard
          label="Pedidos hoy"
          value={data.pedidosHoy}
          subtitle="Pedidos creados en el día"
          valueClassName="text-white"
          onClick={() => navigate('/pedidos')}
        />
        <MetricCard
          label="En armado"
          value={data.enArmado}
          subtitle="Pedidos tomados por armado"
          valueClassName="text-[#f59e0b]"
          onClick={() => navigate('/pedidos')}
        />
        <MetricCard
          label="TOTAL PRODUCTOS"
          value={data.totalProductos}
          subtitle="en inventario"
          valueClassName="text-white"
          onClick={() => navigate('/stock')}
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-bold text-white" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Pedidos recientes
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/pedidos')}
            className="text-[12px] font-medium text-[#6b7280] transition hover:text-white"
          >
            Ver todos →
          </button>
        </div>

        <div className="overflow-hidden rounded-[8px] border border-[#1e1e1e] bg-[#0d0d0d]">
          <div className="grid grid-cols-[1.8fr_1fr_1fr_100px_100px] gap-4 px-4 py-3 text-[10px] uppercase tracking-[0.8px] text-[#4b5563]">
            <div>Pedido · Cliente</div>
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
            <p className="px-4 py-8 text-center text-[13px] text-[#6b7280]">No hay pedidos recientes.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
