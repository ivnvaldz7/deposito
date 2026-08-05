import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { maxSueltos } from '../lib/constants'


export interface ProductoCardDatos {
  id: string
  nombre: string
  sku: string
  unidadesPorCaja: number
  fisico: number
  reservado: number
  disponible: number
}

interface ProductCardProps {
  producto: ProductoCardDatos
  onTap: () => void
  agregadoCajas?: number
  agregadoSueltos?: number
  onChangeSueltos?: (sueltos: number) => void
}

function resumenAgregado(cajas: number, sueltos: number): string {
  const partes: string[] = []
  if (cajas > 0) partes.push(`${cajas} caja${cajas === 1 ? '' : 's'}`)
  if (sueltos > 0) partes.push(`${sueltos} suelto${sueltos === 1 ? '' : 's'}`)
  return `En pedido · ${partes.join(' · ')}`
}

interface EditableQuantityProps {
  value: number
  max: number
  onChange: (value: number) => void
}

function EditableQuantity({ value, max, onChange }: EditableQuantityProps) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit(raw: string) {
    setDraft(null)
    const parsed = Math.floor(Number(raw))
    if (!Number.isFinite(parsed)) return
    onChange(Math.min(max, Math.max(0, parsed)))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label="sueltos"
      value={draft ?? String(value)}
      onFocus={(event) => {
        setDraft(String(value))
        event.currentTarget.select()
      }}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="h-9 w-12 rounded-lg border border-primary/20 bg-surface-container-low text-center font-body text-[14px] font-bold tabular-nums text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
    />
  )
}

export function ProductCard({
  producto,
  onTap,
  agregadoCajas = 0,
  agregadoSueltos = 0,
  onChangeSueltos,
}: ProductCardProps) {
  const enPedido = agregadoCajas > 0 || agregadoSueltos > 0
  const maximoSueltos = maxSueltos(producto.unidadesPorCaja)

  return (
    <div
      data-testid={`product-card-${producto.id}`}
      className={cn(
        'group relative overflow-hidden border-b border-white/5 bg-transparent transition-colors hover:bg-white/[0.02]',
        enPedido && 'border-primary/25 bg-primary/[0.03]',
      )}
    >
      <div className="flex w-full items-center justify-between gap-3 py-3 pl-4 pr-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-on-surface leading-tight">{producto.nombre}</p>
          <div className="mt-1 flex items-center gap-x-3 text-[12px] font-body text-on-surface-variant">
            <span>{producto.sku}</span>
            <span className="text-outline/40">•</span>
            <span className={cn(producto.disponible <= 0 && 'text-warning font-medium')}>Disp: {producto.disponible}</span>
            {producto.reservado > 0 && (
              <>
                <span className="text-outline/40">•</span>
                <span className="text-on-surface/60">Res: {producto.reservado}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center gap-2">
          {enPedido && <Badge variant="success" className="h-5 px-1.5 text-[10px]">{resumenAgregado(agregadoCajas, agregadoSueltos)}</Badge>}
          <button
            type="button"
            onClick={onTap}
            aria-label={enPedido ? `Sumar caja de ${producto.nombre}` : `Agregar ${producto.nombre}`}
            className="flex h-8 items-center justify-center rounded-full border border-primary/40 px-3 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/10 active:scale-95"
          >
            {enPedido ? '+1 caja' : 'Agregar'}
          </button>
        </div>
      </div>
      {enPedido && onChangeSueltos && (
        <div className="mx-4 mb-3 mt-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/10 bg-surface-container-low/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="font-body text-[11px] font-medium text-primary">Carga rápida sueltos</p>
            <span className="text-outline/40">•</span>
            <p className="font-body text-[11px] text-on-surface-variant">
              máx {maximoSueltos}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangeSueltos(Math.max(0, agregadoSueltos - 1))}
              disabled={agregadoSueltos <= 0}
              aria-label="Quitar sueltos"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-surface-container-high font-body text-base text-on-surface transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              -
            </button>
            <EditableQuantity value={agregadoSueltos} max={maximoSueltos} onChange={onChangeSueltos} />
            <button
              type="button"
              onClick={() => onChangeSueltos(Math.min(maximoSueltos, agregadoSueltos + 1))}
              disabled={agregadoSueltos >= maximoSueltos}
              aria-label="Sumar sueltos"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-surface-container-high font-body text-base text-on-surface transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35',
              )}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
