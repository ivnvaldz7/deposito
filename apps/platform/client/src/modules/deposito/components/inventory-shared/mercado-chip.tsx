import type { Mercado } from './mercados'

const MERCADO_STYLES: Record<string, { color: string; bg: string }> = {
  argentina:     { color: '#54e16d', bg: 'rgba(84,225,109,0.10)' },
  colombia:      { color: '#54e16d', bg: 'rgba(84,225,109,0.10)' },
  mexico:        { color: '#54e16d', bg: 'rgba(84,225,109,0.10)' },
  ecuador:       { color: '#54e16d', bg: 'rgba(84,225,109,0.10)' },
  bolivia:       { color: '#54e16d', bg: 'rgba(84,225,109,0.10)' },
  paraguay:      { color: '#54e16d', bg: 'rgba(84,225,109,0.10)' },
  no_exportable: { color: '#bccbb8', bg: 'rgba(188,203,184,0.10)' },
}

export function MercadoChip({ mercado }: { mercado: Mercado }) {
  const style = MERCADO_STYLES[mercado] ?? { color: '#bccbb8', bg: 'rgba(188,203,184,0.10)' }
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0"
      style={{ color: style.color, backgroundColor: style.bg }}
    >
      {mercado.replace('_', ' ')}
    </span>
  )
}
