import type { EstadoProducto } from '../queries/use-productos'

const ESTADO_CONFIG: Record<EstadoProducto, { label: string; color: string; bg: string }> = {
  PENDIENTE_REVISION: { label: 'Pendiente', color: '#FF9800', bg: 'rgba(255, 152, 0, 0.10)' },
  ACTIVO:            { label: 'Activo',    color: '#00AE42', bg: 'rgba(0, 174, 66, 0.10)' },
  INACTIVO:          { label: 'Inactivo',  color: '#9E9E9E', bg: 'rgba(158, 158, 158, 0.10)' },
}

export function EstadoProductoChip({ estado }: { estado: EstadoProducto }) {
  const s = ESTADO_CONFIG[estado]
  return (
    <span
      className="inline-block font-body text-xs font-medium px-2 py-0.5 rounded cursor-default"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  )
}
