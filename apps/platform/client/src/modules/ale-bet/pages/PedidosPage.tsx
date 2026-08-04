import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { type Pedido, type PedidoEstado } from '../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  ESTADO_META,
  canAprobar,
  canCancelarDirecto,
  canDespachar,
  canEmitirRemito,
  canPreparar,
  canSolicitarCancelacion,
  canTomar,
  esArmadorAsignado,
  pedidoClientePendiente,
} from '../lib/estados'
import {
  usePedidos,
  useAprobarPedido,
  useTomarPedido,
  usePrepararPedido,
  useCancelarPedido,
  useDespacharPedido,
} from '../queries'

const FILTROS: Array<{ valor: PedidoEstado | ''; etiqueta: string }> = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'BORRADOR', etiqueta: 'Borrador' },
  { valor: 'APROBADO', etiqueta: 'Aprobado' },
  { valor: 'EN_ARMADO', etiqueta: 'En armado' },
  { valor: 'PREPARADO', etiqueta: 'Preparado' },
  { valor: 'DESPACHADO', etiqueta: 'Despachado' },
  { valor: 'CANCELADO', etiqueta: 'Cancelado' },
]

type ConfirmAccion = 'aprobar' | 'tomar' | 'preparar' | 'despachar' | 'cancelar'

interface ConfirmState {
  pedido: Pedido
  accion: ConfirmAccion
}

const DIALOGOS: Record<ConfirmAccion, { titulo: string; mensaje: (p: Pedido) => string; accion: string }> = {
  aprobar: {
    titulo: 'Aprobar pedido',
    mensaje: (p) => `¿Aprobar ${p.numero}? Se reservará el stock.`,
    accion: 'Aprobar',
  },
  tomar: {
    titulo: 'Tomar pedido',
    mensaje: (p) => `¿Tomar ${p.numero}? Quedará asignado a vos para el armado.`,
    accion: 'Tomar',
  },
  preparar: {
    titulo: 'Marcar preparado',
    mensaje: (p) => `¿Marcar ${p.numero} como preparado?`,
    accion: 'Preparar',
  },
  despachar: {
    titulo: 'Confirmar despacho',
    mensaje: () => 'Esta acción descontará definitivamente el stock.',
    accion: 'Despachar',
  },
  cancelar: {
    titulo: 'Cancelar pedido',
    mensaje: () => 'Se liberará la reserva si existe.',
    accion: 'Cancelar',
  },
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function porActualizadoDesc(a: { updatedAt: string }, b: { updatedAt: string }): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function rankBandeja(pedido: Pedido, rol: string, userId: string): number {
  const propioEnArmado = pedido.estado === 'EN_ARMADO' && (rol === 'admin' || esArmadorAsignado(pedido, userId))
  if (propioEnArmado) return 0.5
  return ESTADO_META[pedido.estado].priority
}

function puedePreparar(pedido: Pedido, rol: string, userId: string): boolean {
  if (pedido.estado !== 'EN_ARMADO') return false
  if (rol !== 'admin' && rol !== 'armador') return false
  if (rol !== 'admin' && !esArmadorAsignado(pedido, userId)) return false
  return true
}

function formatFecha(dateString: string): string {
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

interface PedidoCardProps {
  pedido: Pedido
  rol: string
  userId: string
  onAbrir: () => void
  onAprobar: () => void
  onTomar: () => void
  onPreparar: () => void
  onDespachar: () => void
  onCancelar: () => void
  onEmitirRemito: () => void
  onSolicitarCancelacion: () => void
}

const botonAccionBase =
  'rounded-full border px-3 py-[6px] font-body text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'

function PedidoCard({
  pedido,
  rol,
  userId,
  onAbrir,
  onAprobar,
  onTomar,
  onPreparar,
  onDespachar,
  onCancelar,
  onEmitirRemito,
  onSolicitarCancelacion,
}: PedidoCardProps) {
  const meta = ESTADO_META[pedido.estado]
  const totalUnidades = pedido.items.reduce((acc, item) => acc + item.cantidad, 0)
  const itemsPendientes = pedido.items.filter((item) => !item.completado).length
  const remitoVigente = Boolean(pedido.remitos?.some((r) => r.estado === 'VIGENTE'))
  const clientePendiente = pedidoClientePendiente(pedido)

  const showAprobar = canAprobar(pedido, rol, userId)
  const showTomar = canTomar(pedido, rol, userId)
  const showPreparar = puedePreparar(pedido, rol, userId)
  const showDespachar = canDespachar(pedido, rol, userId)
  const showCancelar = canCancelarDirecto(pedido, rol, userId)
  const showEmitirRemito = canEmitirRemito(pedido, rol)
  const showSolicitarCancelacion = canSolicitarCancelacion(pedido, rol, userId)
  const prepararListo = canPreparar(pedido, rol, userId)

  return (
    <article
      data-testid={`pedido-card-${pedido.id}`}
      onClick={onAbrir}
      className="flex cursor-pointer flex-col gap-3 rounded-xl border border-white/10 bg-surface-container-high p-4 transition-colors hover:border-primary/50"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p data-testid="pedido-numero" className="font-heading text-[14px] font-semibold text-on-surface">
            {pedido.numero}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={meta.variant} className="justify-center">
            {meta.label}
          </Badge>
          {clientePendiente && <Badge variant="warning">Cliente pendiente</Badge>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-surface-container-low/50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-body text-[9px] font-semibold uppercase tracking-[0.12em] text-outline">Cliente</p>
          <p className="mt-1 break-words font-body text-[13px] font-semibold leading-snug text-on-surface">
            {pedido.cliente.nombre}
          </p>
        </div>
        <div className="min-w-0">
          <p className="font-body text-[9px] font-semibold uppercase tracking-[0.12em] text-outline">Vendedor</p>
          <p className="mt-1 break-words font-body text-[13px] font-semibold leading-snug text-on-surface">
            {pedido.vendedorNombre ?? 'Sin asignar'}
          </p>
        </div>
        {pedido.armadorNombre && (
          <div className="col-span-2 border-t border-white/10 pt-2">
            <span className="font-body text-[10px] font-semibold uppercase tracking-[0.1em] text-outline">Armador</span>{' '}
            <span className="font-body text-[12px] font-medium text-on-surface">{pedido.armadorNombre}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-3">
        <span className="font-body text-[11px] font-medium text-on-surface-variant">
          {pedido.items.length} items · {totalUnidades} unidades
        </span>
        {remitoVigente && (
          <span className="inline-flex items-center gap-1 font-body text-[11px] font-medium text-primary">
            <FileText size={13} aria-hidden="true" />
            Remito vigente
          </span>
        )}
        {pedido.cancelacionSolicitadaAt && <Badge variant="warning">Cancelación solicitada</Badge>}
        <time
          dateTime={pedido.updatedAt}
          className="ml-auto font-body text-[10px] font-medium text-on-surface-variant"
        >
          Actualizado {formatFecha(pedido.updatedAt)}
        </time>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3" onClick={(e) => e.stopPropagation()}>
        {showAprobar && (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={onAprobar}
              disabled={clientePendiente}
              className={cn(botonAccionBase, 'border-warning/40 text-warning hover:bg-warning/20')}
            >
              Aprobar
            </button>
            {clientePendiente && (
              <span className="font-body text-[10px] text-warning">Facturación debe validar el cliente</span>
            )}
          </div>
        )}
        {showTomar && (
          <button
            type="button"
            onClick={onTomar}
            className={cn(botonAccionBase, 'border-primary/40 text-primary hover:bg-primary/20')}
          >
            Tomar
          </button>
        )}
        {showPreparar && (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={onPreparar}
              disabled={!prepararListo}
              className={cn(botonAccionBase, 'border-primary/40 text-primary hover:bg-primary/20')}
            >
              Preparar
            </button>
            {itemsPendientes > 0 && (
              <span className="font-body text-[10px] text-warning">Faltan {itemsPendientes} items</span>
            )}
          </div>
        )}
        {showDespachar && (
          <button
            type="button"
            onClick={onDespachar}
            className={cn(botonAccionBase, 'border-error/40 text-error hover:bg-error/10')}
          >
            Confirmar despacho
          </button>
        )}
        {showCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className={cn(botonAccionBase, 'border-error/30 text-error hover:bg-error/10')}
          >
            Cancelar
          </button>
        )}
        {showEmitirRemito && (
          <button
            type="button"
            onClick={onEmitirRemito}
            className={cn(botonAccionBase, 'border-white/10 text-on-surface-variant hover:text-on-surface')}
          >
            Emitir remito
          </button>
        )}
        {showSolicitarCancelacion && (
          <button
            type="button"
            onClick={onSolicitarCancelacion}
            className={cn(botonAccionBase, 'border-warning/40 text-warning hover:bg-warning/20')}
          >
            Solicitar cancelación
          </button>
        )}
      </footer>
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

  const [estadoFilter, setEstadoFilter] = useState<PedidoEstado | ''>((location.state as any)?.estadoFilter ?? '')
  const [soloHoy, setSoloHoy] = useState((location.state as any)?.pedidosHoy ?? false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [ejecutando, setEjecutando] = useState(false)

  const { data: pedidos = [], isLoading, error } = usePedidos()
  const aprobarMutation = useAprobarPedido()
  const tomarMutation = useTomarPedido()
  const prepararMutation = usePrepararPedido()
  const cancelarMutation = useCancelarPedido()
  const despacharMutation = useDespacharPedido()

  useEffect(() => {
    const id = (location.state as { openPedidoId?: string } | null)?.openPedidoId
    if (id) navigate(`/ale-bet/pedidos/${id}`)
  }, [location.state, navigate])

  const filtrados = useMemo(() => {
    let result = pedidos
    if (estadoFilter) result = result.filter((p) => p.estado === estadoFilter)
    if (soloHoy) {
      const hoy = new Date().toDateString()
      result = result.filter(p => new Date(p.createdAt).toDateString() === hoy)
    }
    return result
  }, [pedidos, estadoFilter, soloHoy])

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

  async function ejecutarAccion(pedido: Pedido, accion: ConfirmAccion) {
    setEjecutando(true)
    try {
      if (accion === 'aprobar') {
        const aprobado = await aprobarMutation.mutateAsync({
          id: pedido.id,
          expectedVersion: pedido.version,
          idempotencyKey: newIdempotencyKey(),
        })
        toast.success(`Pedido ${aprobado.numero} aprobado`)
      } else if (accion === 'tomar') {
        await tomarMutation.mutateAsync({ id: pedido.id, expectedVersion: pedido.version })
        toast.success(`Pedido ${pedido.numero} tomado`)
      } else if (accion === 'preparar') {
        await prepararMutation.mutateAsync({ id: pedido.id, expectedVersion: pedido.version })
        toast.success(`Pedido ${pedido.numero} preparado`)
      } else if (accion === 'despachar') {
        await despacharMutation.mutateAsync({ id: pedido.id, expectedVersion: pedido.version })
        toast.success('Pedido despachado')
      } else {
        await cancelarMutation.mutateAsync({ id: pedido.id, expectedVersion: pedido.version })
        toast.success(`Pedido ${pedido.numero} cancelado`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al ejecutar la acción')
    } finally {
      setEjecutando(false)
      setConfirm(null)
    }
  }

  const header = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-[28px] font-bold tracking-[-0.03em] text-on-surface">Pedidos</h1>
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
        {FILTROS.map((f) => {
          const activo = estadoFilter === f.valor
          return (
            <button
              key={f.valor || 'todos'}
              type="button"
              aria-pressed={activo}
              onClick={() => setEstadoFilter(f.valor)}
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
              rol={rol}
              userId={userId}
              onAbrir={() => navigate(`/ale-bet/pedidos/${p.id}`)}
              onAprobar={() => setConfirm({ pedido: p, accion: 'aprobar' })}
              onTomar={() => setConfirm({ pedido: p, accion: 'tomar' })}
              onPreparar={() => setConfirm({ pedido: p, accion: 'preparar' })}
              onDespachar={() => setConfirm({ pedido: p, accion: 'despachar' })}
              onCancelar={() => setConfirm({ pedido: p, accion: 'cancelar' })}
              onEmitirRemito={() => navigate(`/ale-bet/pedidos/${p.id}`)}
              onSolicitarCancelacion={() => navigate(`/ale-bet/pedidos/${p.id}`)}
            />
          ))}
        </div>
      )}

      {confirm && (
        <div
          data-testid="confirm-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={DIALOGOS[confirm.accion].titulo}
            className="w-full max-w-sm rounded-xl border border-white/10 bg-surface-container-low p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-heading text-[16px] font-bold text-on-surface">{DIALOGOS[confirm.accion].titulo}</h2>
            <p className="mt-2 font-body text-[13px] leading-relaxed text-on-surface-variant">
              {DIALOGOS[confirm.accion].mensaje(confirm.pedido)}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={ejecutando}>
                Volver
              </Button>
              <Button
                onClick={() => void ejecutarAccion(confirm.pedido, confirm.accion)}
                loading={ejecutando}
              >
                {DIALOGOS[confirm.accion].accion}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
