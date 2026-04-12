import { MERCADOS, type Mercado } from './mercados'

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
        onClick={() => onChangeMercado('todos')}
        className="rounded px-3 py-1.5 font-body text-xs transition-colors"
        style={
          mercadoActivo === 'todos'
            ? { background: 'rgba(84,225,109,0.15)', color: '#54e16d' }
            : { background: 'var(--color-surface-high)', color: '#bccbb8' }
        }
      >
        Todos ({totalCount})
      </button>

      {MERCADOS.map(({ value, label }) => {
        const count = countsByMercado[value]
        if (count === 0) return null

        return (
          <button
            key={value}
            onClick={() => onChangeMercado(value)}
            className="rounded px-3 py-1.5 font-body text-xs transition-colors"
            style={
              mercadoActivo === value
                ? { background: 'rgba(84,225,109,0.15)', color: '#54e16d' }
                : { background: 'var(--color-surface-high)', color: '#bccbb8' }
            }
          >
            {label} ({count})
          </button>
        )
      })}
    </div>
  )
}
