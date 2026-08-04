import { useState } from 'react'
import { calcularUnidades, maxSueltos } from '../lib/constants'

interface QuantityStepperProps {
  cajas: number
  sueltos: number
  onChange: (cajas: number, sueltos: number) => void
  disabled?: boolean
  unidadesPorCaja: number
  showSueltos?: boolean
}

interface StepperFieldProps {
  value: number
  max?: number
  onChange: (value: number) => void
  disabled?: boolean
  ariaLabel: string
}

function StepperField({ value, max, onChange, disabled, ariaLabel }: StepperFieldProps) {
  const [editing, setEditing] = useState<string | null>(null)

  function clamp(n: number): number {
    const floor = Math.max(0, n)
    return max === undefined ? floor : Math.min(max, floor)
  }

  function commit(raw: string) {
    setEditing(null)
    const parsed = Math.floor(Number(raw))
    if (!Number.isFinite(parsed)) return
    const clamped = clamp(parsed)
    if (clamped !== value) onChange(clamped)
  }

  const minusDisabled = disabled || value <= 0
  const plusDisabled = disabled || (max !== undefined && value >= max)

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={minusDisabled}
        aria-label={`Quitar ${ariaLabel}`}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-container-high font-body text-lg text-on-surface transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
      >
        -
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        max={max}
        aria-label={ariaLabel}
        value={editing ?? String(value)}
        onFocus={(e) => {
          setEditing(String(value))
          e.currentTarget.select()
        }}
        onChange={(e) => setEditing(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        disabled={disabled}
        className="h-11 w-12 rounded-lg border border-white/10 bg-surface-container-high text-center font-body text-base font-semibold text-on-surface focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-35"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={plusDisabled}
        aria-label={`Sumar ${ariaLabel}`}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-container-high font-body text-lg text-on-surface transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
      >
        +
      </button>
    </div>
  )
}

export function QuantityStepper({
  cajas,
  sueltos,
  onChange,
  disabled = false,
  unidadesPorCaja,
  showSueltos = true,
}: QuantityStepperProps) {
  const maximoSueltos = maxSueltos(unidadesPorCaja)
  const total = calcularUnidades(cajas, sueltos, unidadesPorCaja)

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="space-y-1.5">
        <p className="font-body text-[10px] font-semibold uppercase tracking-[0.8px] text-outline">
          Cajas ({unidadesPorCaja}u c/u)
        </p>
        <StepperField
          value={cajas}
          onChange={(v) => onChange(v, sueltos)}
          disabled={disabled}
          ariaLabel="cajas"
        />
      </div>
      {showSueltos && (
        <div className="space-y-1.5">
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.8px] text-outline">
            Sueltos (máx {maximoSueltos})
          </p>
          <StepperField
            value={sueltos}
            max={maximoSueltos}
            onChange={(v) => onChange(cajas, v)}
            disabled={disabled}
            ariaLabel="sueltos"
          />
        </div>
      )}
      <p className="pb-1 font-body text-[12px] font-medium text-on-surface-variant">
        Total: <span className="font-semibold text-on-surface">{total} unidades</span>
      </p>
    </div>
  )
}
