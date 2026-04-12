import type { EstadoActa } from './types'

const ESTADO_CONFIG: Record<EstadoActa, { label: string; color: string; bg: string; title?: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#FF9800', bg: 'rgba(255, 152, 0, 0.10)' },
  parcial:    {
    label: 'Parcial',
    color: '#2196F3',
    bg: 'rgba(33, 150, 243, 0.10)',
    title: 'Algunos items de este ingreso aún no fueron distribuidos al inventario',
  },
  completada: { label: 'Completada', color: '#00AE42', bg: 'rgba(0, 174, 66, 0.10)' },
}

export function EstadoChip({ estado }: { estado: EstadoActa }) {
  const s = ESTADO_CONFIG[estado]
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded cursor-default"
      style={{ color: s.color, backgroundColor: s.bg }}
      title={s.title}
    >
      {s.label}
    </span>
  )
}
