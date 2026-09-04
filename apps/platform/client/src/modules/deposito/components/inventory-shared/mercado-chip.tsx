import { formatMercadoLabel, type Mercado } from './mercados'

export const MERCADO_STYLES: Record<string, { color: string; bg: string; borderColor: string }> = {
  argentina:     { color: '#8ca6c4', bg: 'rgba(140, 166, 196, 0.12)', borderColor: 'rgba(140, 166, 196, 0.3)' },
  colombia:      { color: '#d4b872', bg: 'rgba(212, 184, 114, 0.12)', borderColor: 'rgba(212, 184, 114, 0.3)' },
  mexico:        { color: '#799e82', bg: 'rgba(121, 158, 130, 0.12)', borderColor: 'rgba(121, 158, 130, 0.3)' },
  ecuador:       { color: '#bda282', bg: 'rgba(189, 162, 130, 0.12)', borderColor: 'rgba(189, 162, 130, 0.3)' },
  bolivia:       { color: '#bc7a8f', bg: 'rgba(188, 122, 143, 0.12)', borderColor: 'rgba(188, 122, 143, 0.3)' },
  paraguay:      { color: '#64849c', bg: 'rgba(100, 132, 156, 0.12)', borderColor: 'rgba(100, 132, 156, 0.3)' },
  VENEZUELA:     { color: '#c49c74', bg: 'rgba(196, 156, 116, 0.12)', borderColor: 'rgba(196, 156, 116, 0.3)' },
  no_exportable: { color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.12)', borderColor: 'rgba(156, 163, 175, 0.3)' },
}

export function MercadoChip({ mercado }: { mercado: Mercado }) {
  const style = MERCADO_STYLES[mercado] ?? MERCADO_STYLES['no_exportable']
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 border capitalize"
      style={{ 
        color: style.color, 
        backgroundColor: style.bg,
        borderColor: style.borderColor,
      }}
    >
      {mercado.replace('_', ' ')}
    </span>
  )
}
