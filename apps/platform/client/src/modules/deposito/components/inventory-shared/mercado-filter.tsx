import type { Mercado } from './mercados'
import { MERCADOS } from './mercados'

interface MercadoFilterProps {
  mercadoActivo: Mercado | 'todos'
  onChangeMercado: (mercado: Mercado | 'todos') => void
  totalCount: number
  countsByMercado: Record<Mercado, number>
}

export function MercadoFilter({
  mercadoActivo,
  onChangeMercado,
  totalCount,
  countsByMercado,
}: MercadoFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChangeMercado('todos')}
        className={`px-4 py-2 rounded-lg font-body text-sm font-medium transition-all duration-200 border ${
          mercadoActivo === 'todos'
            ? 'bg-primary text-on-primary border-primary'
            : 'bg-surface-container text-on-surface border-outline-variant hover:bg-surface-bright'
        }`}
      >
        Todos <span className="tabular-nums">({totalCount})</span>
      </button>
      {MERCADOS.filter((m) => countsByMercado[m.value] > 0).map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChangeMercado(value)}
          className={`px-4 py-2 rounded-lg font-body text-sm font-medium transition-all duration-200 border ${
            mercadoActivo === value
              ? 'bg-primary text-on-primary border-primary'
              : 'bg-surface-container text-on-surface border-outline-variant hover:bg-surface-bright'
          }`}
        >
          {label} <span className="tabular-nums">({countsByMercado[value]})</span>
        </button>
      ))}
    </div>
  )
}
