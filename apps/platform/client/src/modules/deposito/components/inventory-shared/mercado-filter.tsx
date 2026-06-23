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
        className="px-3 py-1.5 rounded font-body text-xs transition-colors"
        style={
          mercadoActivo === 'todos'
            ? { background: 'rgba(84,225,109,0.15)', color: '#54e16d' }
            : { background: 'var(--color-surface-high)', color: '#bccbb8' }
        }
      >
        Todos ({totalCount})
      </button>
      {MERCADOS.filter((m) => countsByMercado[m.value] > 0).map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChangeMercado(value)}
          className="px-3 py-1.5 rounded font-body text-xs transition-colors"
          style={
            mercadoActivo === value
              ? { background: 'rgba(84,225,109,0.15)', color: '#54e16d' }
              : { background: 'var(--color-surface-high)', color: '#bccbb8' }
          }
        >
          {label} ({countsByMercado[value]})
        </button>
      ))}
    </div>
  )
}
