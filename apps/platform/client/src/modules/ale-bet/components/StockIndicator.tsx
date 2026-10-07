import { cn } from '@/lib/utils'

export type NivelStock = 'verde' | 'amarillo' | 'rojo'

/**
 * Stock traffic-light level for a line, comparing requested units against
 * availability. Without a requested amount the level reflects availability only.
 */
export function nivelStock(disponible: number, cantidadPedida?: number): NivelStock {
  if (!cantidadPedida || cantidadPedida <= 0) return disponible > 0 ? 'verde' : 'rojo'
  if (disponible < cantidadPedida) return 'rojo'
  return disponible - cantidadPedida >= cantidadPedida ? 'verde' : 'amarillo'
}

const NIVEL_CLASSES: Record<NivelStock, string> = {
  verde: 'bg-success',
  amarillo: 'bg-warning',
  rojo: 'bg-error',
}

interface StockIndicatorProps {
  disponible: number
  reservado: number
  cantidadPedida?: number
  className?: string
}

export function StockIndicator({ disponible, reservado, cantidadPedida, className }: StockIndicatorProps) {
  const nivel = nivelStock(disponible, cantidadPedida)
  const faltan = cantidadPedida && cantidadPedida > 0 ? Math.max(0, cantidadPedida - disponible) : 0
  const muestraFaltante = nivel === 'rojo' && cantidadPedida !== undefined && cantidadPedida > 0

  return (
    <div className={cn('space-y-0.5', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-label={`Stock ${nivel}`} className={cn('h-2.5 w-2.5 rounded-full', NIVEL_CLASSES[nivel])} />
        <span className="text-[12px] font-bold text-on-surface">Disponible {disponible}</span>
        {muestraFaltante && (
          <span className="font-body text-[11px] font-semibold text-error">Faltan {faltan}u</span>
        )}
      </div>
      <p className="pl-4.5 font-body text-[10px] text-outline">{reservado} en pedidos aprobados</p>
    </div>
  )
}
