import type { NotificationItem } from '@/stores/notifications-store'

interface FeedItemProps {
  notification: NotificationItem
  onMarkRead?: (id: string) => void
}

const TIPO_LABELS: Record<string, string> = {
  ingreso_creado: 'Ingreso',
  stock_actualizado: 'Stock',
  orden_creada: 'Orden',
  orden_actualizada: 'Orden',
  stock_bajo: 'Stock bajo',
  vencimiento_proximo: 'Vencimiento',
  'pedido:aprobado': 'Pedido',
  'pedido:completado': 'Pedido',
}

const TIPO_CHIP_COLORS: Record<string, { color: string; bg: string }> = {
  ingreso_creado:    { color: 'var(--color-accent)', bg: 'var(--color-accent-bg)' },
  stock_actualizado: { color: 'var(--color-accent)', bg: 'var(--color-accent-bg)' },
  orden_creada:      { color: 'var(--color-warning)', bg: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' },
  orden_actualizada: { color: 'var(--color-accent)', bg: 'var(--color-accent-bg)' },
  stock_bajo:        { color: 'var(--color-danger)', bg: 'color-mix(in srgb, var(--color-danger) 10%, transparent)' },
  vencimiento_proximo: { color: 'var(--color-warning)', bg: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' },
  'pedido:aprobado': { color: 'var(--color-accent)', bg: 'var(--color-accent-bg)' },
  'pedido:completado':{ color: 'var(--color-success, #22c55e)', bg: 'color-mix(in srgb, #22c55e 10%, transparent)' },
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH} h`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export function FeedItem({ notification: n, onMarkRead }: FeedItemProps) {
  const chipStyle = TIPO_CHIP_COLORS[n.tipo] ?? { color: 'var(--color-text-2)', bg: 'var(--color-accent-bg)' }

  return (
    <div
      className="px-4 py-3 border-b border-outline-variant/10 transition-colors cursor-pointer"
      style={n.leida ? { opacity: 0.6 } : undefined}
      onClick={() => onMarkRead?.(n.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onMarkRead?.(n.id) }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {!n.leida && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
          )}
          <span
            className="inline-block font-body text-xs font-medium px-1.5 py-0.5 rounded shrink-0"
            style={{ color: chipStyle.color, backgroundColor: chipStyle.bg }}
          >
            {TIPO_LABELS[n.tipo] ?? n.tipo}
          </span>
        </div>
        <span className="font-body text-on-surface-variant text-xs shrink-0">
          {formatTimestamp(n.timestamp)}
        </span>
      </div>
      <p className="font-body text-on-surface text-xs mt-1.5 leading-relaxed">
        {n.mensaje}
      </p>
    </div>
  )
}
