import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { type Pedido, type PedidoEstado } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  ESTADO_META,
  esArmadorAsignado,
  pedidoClientePendiente,
} from '../lib/estados'
import { usePedidos } from '../queries'

const FILTROS: Array<{ valor: PedidoEstado | ''; etiqueta: string }> = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'BORRADOR', etiqueta: 'Borrador' },
  { valor: 'APROBADO', etiqueta: 'Aprobado' },
  { valor: 'EN_ARMADO', etiqueta: 'En armado' },
  { valor: 'PREPARADO', etiqueta: 'Preparado' },
  { valor: 'DESPACHADO', etiqueta: 'Despachado' },
  { valor: 'CANCELADO', etiqueta: 'Cancelado' },
]

function porActualizadoDesc(a: { updatedAt: string }, b: { updatedAt: string }): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function rankBandeja(pedido: Pedido, rol: string, userId: string): number {
  const propioEnArmado = pedido.estado === 'EN_ARMADO' && (rol === 'admin' || esArmadorAsignado(pedido, userId))
  if (propioEnArmado) return 0.5
  return ESTADO_META[pedido.estado].priority
}

function formatFecha(dateString: string): string {
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

interface PedidoCardProps {
  pedido: Pedido
  onAbrir: () => void
}

function PedidoCard({ pedido, onAbrir }: PedidoCardProps) {
  const meta = ESTADO_META[pedido.estado]
  const remitoVigente = Boolean(pedido.remitos?.some((r) => r.estado === 'VIGENTE'))
  const clientePendiente = pedidoClientePendiente(pedido)
  const cancelacionSolicitada = Boolean(pedido.cancelacionSolicitadaAt)
  const esCancelado = pedido.estado === 'CANCELADO'

  let senalOperativa = ''
  if (cancelacionSolicitada) senalOperativa = 'Cancelación solicitada'
  else if (clientePendiente) senalOperativa = 'Pendiente de validación'
  else if (pedido.estado === 'APROBADO') senalOperativa = 'Pendiente de armado'
  else if (pedido.estado === 'EN_ARMADO') senalOperativa = 'En preparación'
  else if (pedido.estado === 'PREPARADO' && !remitoVigente) senalOperativa = 'Esperando remito'
  else if (pedido.estado === 'PREPARADO' && remitoVigente) senalOperativa = 'Listo para despacho'

  return (
    <article
      data-testid={`pedido-card-${pedido.id}`}
      onClick={onAbrir}
      className={cn(
        'group relative flex cursor-pointer flex-col justify-between gap-4 rounded-xl border border-white/10 bg-surface-container-high p-5 transition-all duration-200 hover:border-primary/40 hover:bg-surface-container-highest shadow-sm hover:shadow-md',
        esCancelado && 'opacity-60 grayscale-[50%]'
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-bold text-on-surface">
            {pedido.cliente.nombre}
          </p>
          <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">
            {pedido.vendedorNombre ? `Vendedor ${pedido.vendedorNombre}` : 'Vendedor sin asignar'}
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          <Badge variant={meta.variant} className="shadow-sm">
            {meta.label}
          </Badge>
        </div>
      </header>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {senalOperativa && (
            <p className="truncate font-body text-[13px] font-medium text-on-surface-variant">
              {senalOperativa}
            </p>
          )}
        </div>
        <ChevronRight size={18} className="shrink-0 text-outline-variant transition-colors group-hover:text-primary" />
      </div>
    </article>
  )
}
export default function PedidosPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const rol = user?.apps?.['ale-bet']?.rol ?? ''
  const userId = user?.sub ?? ''
  const esOperativo = rol === 'armador' || rol === 'admin'
  const puedeCrear = rol === 'admin' || rol === 'vendedor'

  const armadorFiltros = [
    { valor: '', etiqueta: 'Todos' },
    { valor: 'APROBADO', etiqueta: 'Aprobados' },
    { valor: 'EN_ARMADO', etiqueta: 'En armado' },
    { valor: 'PREPARADO', etiqueta: 'Preparados' },
  ] as const

  const [estadoFilter, setEstadoFilter] = useState<PedidoEstado | ''>((location.state as any)?.estadoFilter ?? '')
  const [soloHoy, setSoloHoy] = useState((location.state as any)?.pedidosHoy ?? false)

  const { data: pedidos = [], isLoading, error } = usePedidos()

  useEffect(() => {
    const id = (location.state as { openPedidoId?: string } | null)?.openPedidoId
    if (id) navigate(`/ale-bet/pedidos/${id}`)
  }, [location.state, navigate])

  const filtrados = useMemo(() => {
    let result = pedidos
    
    if (rol === 'armador') {
      result = result.filter(p => p.estado === 'APROBADO' || p.estado === 'EN_ARMADO' || p.estado === 'PREPARADO')
    }

    if (estadoFilter) result = result.filter((p) => p.estado === estadoFilter)
    if (soloHoy) {
      const hoy = new Date().toDateString()
      result = result.filter(p => new Date(p.createdAt).toDateString() === hoy)
    }
    return result
  }, [pedidos, estadoFilter, soloHoy, rol])

  const ordenados = useMemo(() => {
    const lista = [...filtrados]
    if (!esOperativo) return lista.sort(porActualizadoDesc)
    return lista.sort((a, b) => {
      const ra = rankBandeja(a, rol, userId)
      const rb = rankBandeja(b, rol, userId)
      if (ra !== rb) return ra - rb
      return porActualizadoDesc(a, b)
    })
  }, [filtrados, esOperativo, rol, userId])

  const header = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold tracking-tight text-on-surface">Pedidos</h1>
        <p className="font-body text-[13px] text-on-surface-variant">Bandeja operativa de pedidos</p>
      </div>
      {puedeCrear && (
        <button
          type="button"
          onClick={() => navigate('/ale-bet/pedidos/nuevo')}
          className="shrink-0 rounded-full bg-primary px-5 py-2.5 font-body text-[13px] font-bold text-on-primary transition hover:bg-primary/90 shadow-sm"
        >
          + Nuevo pedido
        </button>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton variant="card" className="h-44" />
          <Skeleton variant="card" className="h-44" />
          <Skeleton variant="card" className="h-44" />
        </div>
        <p className="font-body text-sm text-on-surface-variant">Cargando pedidos...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <p className="font-body text-sm text-error">{error instanceof Error ? error.message : 'Error al cargar pedidos'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" aria-label="Filtrar por estado">
        {(rol === 'armador' ? armadorFiltros : FILTROS).map((f) => {
          const activo = estadoFilter === f.valor
          return (
            <button
              key={f.valor || 'todos'}
              type="button"
              aria-pressed={activo}
              onClick={() => setEstadoFilter(f.valor as PedidoEstado | '')}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 font-body text-[12px] font-semibold transition',
                activo
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-white/10 text-on-surface-variant hover:text-on-surface',
              )}
            >
              {f.etiqueta}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={soloHoy}
          onClick={() => setSoloHoy(!soloHoy)}
          className={cn(
            'shrink-0 rounded-full border px-3.5 py-1.5 font-body text-[12px] font-semibold transition ml-auto',
            soloHoy
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-white/10 text-on-surface-variant hover:text-on-surface'
          )}
        >
          Solo hoy
        </button>
      </div>

      {ordenados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          {pedidos.length === 0 ? 'No hay pedidos.' : 'No hay pedidos en este estado.'}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordenados.map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              onAbrir={() => navigate(`/ale-bet/pedidos/${p.id}`)}
            />
          ))}
        </div>
      )}

    </div>
  )
}
