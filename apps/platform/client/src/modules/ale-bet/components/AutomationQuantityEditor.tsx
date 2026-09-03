import { useState } from 'react'
import { cn } from '@/lib/utils'

interface AutomationStepperProps {
  cajas: number
  sueltos: number
  unidadesPorCaja: number
  totalUnits: number
  originalExpression: string
  onChange: (cajas: number, sueltos: number) => void
}

function StepperControl({
  value,
  label,
  onChange,
  disabledMinus
}: {
  value: number
  label: string
  onChange: (val: number) => void
  disabledMinus: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-surface-container-high p-2 w-32">
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={disabledMinus}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container hover:bg-surface-variant font-bold text-on-surface transition disabled:opacity-30"
        >
          -
        </button>
        <span className="font-semibold text-lg">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container hover:bg-surface-variant font-bold text-on-surface transition"
        >
          +
        </button>
      </div>
      <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-outline">{label}</span>
    </div>
  )
}

export function AutomationQuantityEditor({
  cajas,
  sueltos,
  unidadesPorCaja,
  totalUnits,
  originalExpression,
  onChange
}: AutomationStepperProps) {
  const handleCajas = (newCajas: number) => onChange(newCajas, sueltos)
  
  const handleSueltos = (newSueltos: number) => {
    if (newSueltos >= unidadesPorCaja) {
      onChange(cajas + 1, newSueltos - unidadesPorCaja)
    } else if (newSueltos < 0) {
      if (cajas > 0) {
        onChange(cajas - 1, unidadesPorCaja - 1)
      } else {
        onChange(0, 0)
      }
    } else {
      onChange(cajas, newSueltos)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-outline">Cantidad</h3>
      
      <div className="flex items-center gap-4">
        <StepperControl
          value={cajas}
          label={cajas === 1 ? "caja" : "cajas"}
          onChange={handleCajas}
          disabledMinus={cajas <= 0}
        />
        <StepperControl
          value={sueltos}
          label={sueltos === 1 ? "suelto" : "sueltos"}
          onChange={handleSueltos}
          disabledMinus={sueltos <= 0 && cajas <= 0}
        />
      </div>

      <div className="space-y-1">
        <p className="font-body text-[13px] font-semibold text-on-surface">
          Total: {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}
        </p>
        <p className="font-body text-[12px] text-on-surface-variant">
          {unidadesPorCaja} u. por caja
        </p>
        <p className="font-body text-[12px] italic text-outline">
          Pedido original: {originalExpression}
        </p>
      </div>
    </div>
  )
}
