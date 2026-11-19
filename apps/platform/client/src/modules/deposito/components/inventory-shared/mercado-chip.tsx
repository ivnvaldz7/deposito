import { formatMercadoLabel, type Mercado } from './mercados'

const MERCADO_FLAG_GRADIENTS: Record<Mercado, string | null> = {
  argentina: 'linear-gradient(to bottom, #74acdf 0 33%, #f8fafc 33% 66%, #74acdf 66% 100%)',
  colombia: 'linear-gradient(to bottom, #fcd116 0 50%, #003893 50% 75%, #ce1126 75% 100%)',
  mexico: 'linear-gradient(to right, #006847 0 33%, #f8fafc 33% 66%, #ce1126 66% 100%)',
  ecuador: 'linear-gradient(to bottom, #fcd116 0 50%, #003893 50% 75%, #ce1126 75% 100%)',
  bolivia: 'linear-gradient(to bottom, #d52b1e 0 33%, #f9e300 33% 66%, #007a33 66% 100%)',
  paraguay: 'linear-gradient(to bottom, #d52b1e 0 33%, #f8fafc 33% 66%, #0038a8 66% 100%)',
  VENEZUELA: 'linear-gradient(to bottom, #fcd116 0 33%, #003893 33% 66%, #ce1126 66% 100%)',
  no_exportable: null,
}

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

export function MercadoFlag({ mercado, className = '' }: { mercado: Mercado; className?: string }) {
  const flagGradient = MERCADO_FLAG_GRADIENTS[mercado] ?? null
  if (!flagGradient) return null

  return (
    <span
      role="img"
      aria-label={`Bandera de ${formatMercadoLabel(mercado)}`}
      title={formatMercadoLabel(mercado)}
      className={`h-3 w-4 shrink-0 rounded-[2px] border border-white/25 shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${className}`}
      style={{ backgroundImage: flagGradient }}
    />
  )
}

export function MercadoChip({ mercado }: { mercado: Mercado }) {
  const style = MERCADO_STYLES[mercado] ?? MERCADO_STYLES['no_exportable']
  const flagGradient = MERCADO_FLAG_GRADIENTS[mercado] ?? null
  return (
    <span
      className="inline-flex items-center gap-1 font-body text-xs font-medium px-2 py-0.5 rounded shrink-0 border"
      style={{ 
        color: style.color, 
        backgroundColor: style.bg,
        borderColor: style.borderColor,
      }}
    >
      {flagGradient ? (
        <MercadoFlag mercado={mercado} />
      ) : (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current opacity-70" />
      )}
      {formatMercadoLabel(mercado)}
    </span>
  )
}
