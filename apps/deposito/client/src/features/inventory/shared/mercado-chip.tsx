import { getMercadoStyle, type Mercado } from './mercados'

export function MercadoChip({ mercado }: { mercado: Mercado }) {
  const style = getMercadoStyle(mercado)

  return (
    <span
      className="inline-block rounded px-2 py-0.5 font-body text-xs font-medium"
      style={{ color: style.color, backgroundColor: style.bg }}
    >
      {style.label}
    </span>
  )
}
