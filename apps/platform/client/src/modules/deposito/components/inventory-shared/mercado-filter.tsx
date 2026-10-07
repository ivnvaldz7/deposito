import type { Mercado } from './mercados'
import { MERCADOS } from './mercados'
import { MERCADO_STYLES } from './mercado-chip'

interface MercadoFilterProps {
  mercadoActivo: Mercado | 'todos'
  onChangeMercado: (mercado: Mercado | 'todos') => void
  totalCount: number
  countsByMercado: Record<Mercado, number>
}

export function MercadoFilter({
  mercadoActivo,
  onChangeMercado,
  countsByMercado,
}: MercadoFilterProps) {
  return (
    <section aria-label="Filtros de mercado" className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChangeMercado('todos')}
        className={`px-4 py-2 rounded-lg font-body text-sm font-medium transition-all duration-200 border ${
          mercadoActivo === 'todos'
            ? 'bg-primary text-on-primary border-primary'
            : 'bg-surface-container text-on-surface border-outline-variant hover:bg-surface-bright'
        }`}
      >
        Todos
      </button>
      {MERCADOS.filter((m) => countsByMercado[m.value] > 0).map(({ value, label }) => {
        const style = MERCADO_STYLES[value] ?? MERCADO_STYLES['no_exportable']
        const isActive = mercadoActivo === value
        
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChangeMercado(value)}
            style={
              isActive
                ? {
                    backgroundColor: style.bg,
                    color: style.color,
                    borderColor: style.color,
                  }
                : {
                    borderColor: style.borderColor,
                    color: '#e2e8f0', // Neutral light text for dark background
                  }
            }
            className={`px-4 py-2 rounded-lg font-body text-sm font-medium transition-colors duration-200 border ${
              isActive
                ? ''
                : 'bg-surface-container hover:bg-surface-container-high'
            }`}
          >
            {label}
          </button>
        )
      })}
    </section>
  )
}
