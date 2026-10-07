import { useEffect, useMemo, useState } from 'react'
import { roleHasPermission } from '@platform/core/permissions'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, Plus } from 'lucide-react'
import { type Pedido, type PedidoEstado } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  ESTADO_META,
  esArmadorAsignado,
  esPedidoAutomation,
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
  const propioEnArmado = pedido.estado === 'EN_ARMADO' && (roleHasPermission('ale-bet', rol, 'pedidos.take') || esArmadorAsignado(pedido, userId))
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
  const isAuto = esPedidoAutomation(pedido)
  const stockDescontado = pedido.stockDescontado === true || pedido.estado === 'DESPACHADO' || isAuto

  let senalOperativa = ''
  if (cancelacionSolicitada) senalOperativa = 'Cancelación solicitada'
  else if (clientePendiente) senalOperativa = 'Pendiente de validación'
  else if (remitoVigente) senalOperativa = stockDescontado ? 'Stock descontado' : 'Pendiente a descuento'
  else if (isAuto) senalOperativa = 'Pendiente de remito'
  else if (pedido.estado === 'APROBADO') senalOperativa = 'Pendiente de armado'
  else if (pedido.estado === 'EN_ARMADO') senalOperativa = 'En preparación'
  else if (pedido.estado === 'PREPARADO' && !remitoVigente) senalOperativa = 'Esperando remito'

  return (
    <article
      data-testid={`pedido-card-${pedido.id}`}
      data-estado={pedido.estado}
      onClick={onAbrir}
      className={cn(
        'group relative grid min-h-16 cursor-pointer grid-cols-1 items-center gap-2 border-b border-white/10 px-3 py-3 transition-colors hover:bg-surface-variant/20 md:grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(7rem,.8fr)_minmax(10rem,1fr)_auto]',
        esCancelado && 'opacity-60 grayscale-[50%]'
      )}
    >
      <header className="min-w-0">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-bold text-on-surface">
            {pedido.cliente.nombre}
          </p>
          {isAuto ? (
            <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">Automation · Confirmado</p>
          ) : (
            <p className="mt-1 truncate font-body text-[13px] font-medium text-on-surface-variant">
              {pedido.vendedorNombre ? `Vendedor ${pedido.vendedorNombre}` : 'Vendedor sin asignar'}
            </p>
          )}
        </div>
        {!isAuto && (
          <div className="shrink-0 pt-0.5">
            <Badge variant={meta.variant} className="shadow-sm">
              {meta.label}
            </Badge>
          </div>
        )}
      </header>

      <p className="truncate font-body text-[12px] text-on-surface-variant md:block">
        {pedido.numero ?? pedido.id} · {pedido.items?.length ?? 0} items
      </p>
      <p className="font-body text-[12px] text-on-surface-variant">Automation</p>
      <p className="font-body text-[12px] text-on-surface-variant">{formatFecha(pedido.updatedAt)}</p>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="min-w-0 flex-1">
          {senalOperativa && (
            <div className="flex items-center gap-1.5">
              {isAuto && <FileText size={14} className="text-on-surface-variant" />}
              <p
                className="truncate font-body text-[13px] font-medium text-on-surface-variant"
              >
                {senalOperativa}
              </p>
            </div>
          )}
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 text-on-surface-variant transition-colors"
        />
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
  const esFacturacion = rol === 'facturacion'
  const esOperativo = can(user, 'ale-bet', 'pedidos.prepare') || can(user, 'ale-bet', 'pedidos.take')
  const puedeCrearPedidos = can(user, 'ale-bet', 'pedidos.create') && !esFacturacion

  const armadorFiltros = [
    { valor: '', etiqueta: 'Todos' },
    { valor: 'APROBADO', etiqueta: 'Aprobados' },
    { valor: 'EN_ARMADO', etiqueta: 'En armado' },
    { valor: 'PREPARADO', etiqueta: 'Preparados' },
  ] as const


  const { data: pedidos = [], isLoading, error } = usePedidos(esFacturacion ? { bandeja: 'FACTURACION' } : undefined)

  useEffect(() => {
    const id = (location.state as { openPedidoId?: string } | null)?.openPedidoId
    if (id) navigate(`/ale-bet/pedidos/${id}`)
  }, [location.state, navigate])

  const filtrados = useMemo(() => {
    let result = pedidos
    
    if (rol === 'armador') {
      result = result.filter(p => p.origen === 'MANUAL' && (p.estado === 'APROBADO' || p.estado === 'EN_ARMADO' || p.estado === 'PREPARADO'))
    }

    return result
  }, [pedidos, rol])

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
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold tracking-tight text-on-surface sm:text-[28px]">Pedidos</h1>
        <p className="font-body text-[13px] text-on-surface-variant">{esFacturacion ? 'Pendientes de remito' : 'Bandeja operativa de pedidos'}</p>
      </div>
      {puedeCrearPedidos && (
        <button
          type="button"
          onClick={() => navigate('/ale-bet/pedidos/nuevo')}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 font-body text-[13px] font-semibold text-on-primary btn-press"
        >
          <Plus size={18} aria-hidden="true" />
          Nuevo
        </button>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-container-high">
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
    <div className="space-y-5">
      {header}

      {ordenados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center font-body text-[13px] text-on-surface-variant">
          {pedidos.length === 0 ? (esFacturacion ? 'No hay pedidos pendientes de remito.' : 'No hay pedidos.') : 'No hay pedidos en este estado.'}
        </p>
      ) : (
        <div className="flex w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-surface-container-high">
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
