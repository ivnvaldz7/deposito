import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { maxSueltos } from '../lib/constants'
import { StockIndicator } from './StockIndicator'

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
        'relative overflow-hidden rounded-2xl border border-white/10 bg-surface-container-high shadow-sm transition-colors',
        enPedido && 'border-primary/25 ring-1 ring-inset ring-primary/10',
      )}
    >
      {enPedido && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />}
      <button
        type="button"
        onClick={onTap}
        className="flex w-full items-center justify-between gap-3 py-4 pl-5 pr-4 text-left transition enabled:active:scale-[0.99]"
      >
        <div className="min-w-0">
          <p className="truncate font-heading text-[14px] font-semibold text-on-surface">{producto.nombre}</p>
          <p className="mt-0.5 font-body text-[11px] text-outline">{producto.sku}</p>
          <div className="mt-2">
            <StockIndicator disponible={producto.disponible} reservado={producto.reservado} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {enPedido && <Badge variant="success">{resumenAgregado(agregadoCajas, agregadoSueltos)}</Badge>}
          <span className="flex h-9 min-w-9 items-center justify-center rounded-full border border-primary/40 px-3 font-body text-[12px] font-semibold text-primary">
            {enPedido ? '+1 caja' : 'Agregar'}
          </span>
        </div>
      </button>
      {enPedido && onChangeSueltos && (
        <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-surface-container-low/70 px-3 py-2.5">
          <div>
            <p className="font-heading text-[10px] font-bold uppercase tracking-[0.8px] text-primary">Carga rápida</p>
            <p className="mt-0.5 font-body text-[11px] text-on-surface-variant">
              Sueltos <span className="text-outline">· máx. {maximoSueltos}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangeSueltos(Math.max(0, agregadoSueltos - 1))}
              disabled={agregadoSueltos <= 0}
              aria-label="Quitar sueltos"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-container-high font-body text-base text-on-surface transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
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
                'flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-container-high font-body text-base text-on-surface transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35',
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
