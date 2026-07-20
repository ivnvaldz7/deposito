import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { aleBetApi, type DashboardOverview, type DashboardPedidoReciente, type Pedido } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { GlassCard } from '@/components/ui/GlassCard'
import { Badge } from '@/components/ui/Badge'

function formatDashboardDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  if (current.getTime() === today.getTime()) return `Hoy ${time}`
  if (current.getTime() === yesterday.getTime()) return `Ayer ${time}`

  return `${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${time}`
}

const getInitials = (nombre: string) => {
  if (!nombre) return '?'
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

function getEstadoBadgeVariant(estado: Pedido['estado']): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (estado) {
    case 'PENDIENTE': return 'default'
    case 'APROBADO': return 'warning'
    case 'EN_ARMADO': return 'info'
    case 'COMPLETADO': return 'success'
    case 'CANCELADO': return 'error'
  }
}

function MetricCard({
  label, value, subtitle, valueClassName, onClick,
}: {
  label: string; value: number; subtitle: string; valueClassName: string; onClick?: () => void
}) {
  const clickable = typeof onClick === 'function'

  return (
    <GlassCard
      variant={valueClassName.includes('error') ? 'error' : valueClassName.includes('warning') ? 'warning' : 'default'}
      hover={clickable}
      className={clickable ? 'cursor-pointer' : ''}
    >
      <div onClick={onClick} onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onClick?.() } : undefined} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}>
        <p className="font-body text-[10px] uppercase tracking-[0.8px] text-outline">{label}</p>
        <p className={`mt-4 font-heading text-[48px] font-bold leading-none ${valueClassName}`}>
          {value}
        </p>
        <p className="mt-3 max-w-[20ch] font-body text-[11px] text-on-surface-variant">{subtitle}</p>
      </div>
    </GlassCard>
  )
}

function PedidoRow({ pedido, onComplete }: { pedido: DashboardPedidoReciente; onComplete: (pedidoId: string) => void }) {
  const adminVendor = isAdminVendor(pedido.vendedorNombre)
  const variant = getEstadoBadgeVariant(pedido.estado)

  return (
    <div className="grid grid-cols-[1.8fr_1fr_1fr_100px_100px] items-center gap-4 border-b border-white/10 px-5 py-4">
      <div className="min-w-0">
        <p className="truncate font-heading text-[12px] font-semibold text-on-surface">
          {pedido.clienteNombre}
        </p>
        <p className="mt-1 font-body text-[10px] text-outline">{pedido.numero} · {pedido.cantidadItems} items</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] font-semibold ${
          adminVendor ? 'border-primary/40 bg-primary/20 text-primary' : 'border-outline/30 bg-surface-variant text-on-surface-variant'
        }`}>
          {getInitials(pedido.vendedorNombre)}
        </span>
        <span className={`truncate font-body text-[11px] ${adminVendor ? 'font-bold text-on-surface-variant' : 'text-outline'}`}>
          {pedido.vendedorNombre}
        </span>
      </div>
      <div className="font-body text-[11px] text-outline">{formatDashboardDate(pedido.createdAt)}</div>
      <div className="flex justify-center">
        <Badge variant={variant} className="w-[88px] justify-center">{pedido.estado.replace('_', ' ')}</Badge>
      </div>
      <div className="flex justify-center">
        {pedido.estado === 'EN_ARMADO' ? (
          <button
            type="button"
            onClick={() => onComplete(pedido.id)}
            className="w-[88px] rounded-full border border-primary px-3 py-[7px] font-body text-[11px] font-semibold text-primary transition hover:bg-primary/20"
          >
            Completar
          </button>
        ) : <span className="block h-[32px] w-[88px]" />}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [animatedPedidoId, setAnimatedPedidoId] = useState<string | null>(null)
  const [animatedTone, setAnimatedTone] = useState<'success' | 'danger' | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      setData(await aleBetApi.dashboard())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  useEffect(() => {
    const handler = () => void loadData()
    window.addEventListener('alebet:refresh', handler)
    return () => window.removeEventListener('alebet:refresh', handler)
  }, [])

  useEffect(() => {
    const state = location.state as { flashPedidoId?: string; flashTone?: 'success' | 'danger' } | null
    if (!state?.flashPedidoId || !state.flashTone) return

    setAnimatedPedidoId(state.flashPedidoId)
    setAnimatedTone(state.flashTone)
    const id = window.setTimeout(() => { setAnimatedPedidoId(null); setAnimatedTone(null) }, 600)
    return () => window.clearTimeout(id)
  }, [location.state])

  if (loading) return <p className="font-body text-sm text-on-surface-variant">Cargando dashboard...</p>
  if (error || !data) return <p className="font-body text-sm text-error">{error ?? 'No se pudo cargar el dashboard'}</p>

  const isAdmin = user?.apps?.['ale-bet']?.rol === 'admin'

  return (
    <div className="space-y-6 text-on-surface">
      <div className="space-y-1">
        <h1 className="font-heading text-[28px] font-bold tracking-[-0.03em] text-on-surface">Dashboard</h1>
        <p className="font-body text-[13px] text-on-surface-variant">Vista operativa consolidada</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Stock crítico" value={data.stockCritico} subtitle="Productos por debajo del mínimo" valueClassName="text-error" onClick={isAdmin ? () => navigate('/ale-bet/productos') : undefined} />
        <MetricCard label="Pedidos hoy" value={data.pedidosHoy} subtitle="Pedidos creados en el día" valueClassName="text-on-surface" onClick={isAdmin ? () => navigate('/ale-bet/pedidos') : undefined} />
        <MetricCard label="En armado" value={data.enArmado} subtitle="Pedidos tomados por armado" valueClassName="text-warning" onClick={isAdmin ? () => navigate('/ale-bet/pedidos') : undefined} />
        <MetricCard label="TOTAL PRODUCTOS" value={data.totalProductos} subtitle="en inventario" valueClassName="text-on-surface" onClick={isAdmin ? () => navigate('/ale-bet/stock') : undefined} />
      </div>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-[24px] font-bold tracking-[-0.02em] text-on-surface">Pedidos recientes</h2>
          <button type="button" onClick={() => navigate('/ale-bet/pedidos')} className="font-body text-[12px] font-medium text-on-surface-variant transition hover:text-on-surface">
            Ver todos →
          </button>
        </div>

        <div className="bg-surface-container-high rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1.8fr_1fr_1fr_100px_100px] gap-4 border-b border-white/10 px-5 py-3 font-body text-[10px] uppercase tracking-[0.8px] text-outline">
            <div>Cliente</div>
            <div>Vendedor</div>
            <div>Fecha</div>
            <div className="text-center">Estado</div>
            <div className="text-center">Acción</div>
          </div>

          {data.pedidosRecientes.map((pedido) => (
            <div key={pedido.id} className={animatedPedidoId === pedido.id ? (animatedTone === 'danger' ? 'alebet-flash-danger' : 'alebet-flash-success') : ''}>
              <PedidoRow pedido={pedido} onComplete={(id) => navigate('/ale-bet/pedidos', { state: { openPedidoId: id } })} />
            </div>
          ))}

          {data.pedidosRecientes.length === 0 && (
            <p className="px-4 py-8 text-center font-body text-[13px] text-on-surface-variant">No hay pedidos recientes.</p>
          )}
        </div>
      </section>
    </div>
  )
}
