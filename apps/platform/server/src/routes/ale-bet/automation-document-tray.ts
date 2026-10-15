import type { Prisma } from '@platform/db'

/**
 * The active Automation document queue.  Both Dashboard and Pedidos consume
 * this predicate so a completed delivery cannot be presented as pending only
 * on the Dashboard.
 */
export function automationDocumentTrayWhere(): Prisma.PedidoWhereInput {
  return {
    origen: 'AUTOMATION',
    OR: [
      {
        descuentoPorRemito: true,
        estado: { in: ['APROBADO', 'PENDIENTE_PRODUCCION', 'PENDIENTE_PARCIAL', 'PREPARADO'] },
      },
      {
        descuentoPorRemito: false,
        estado: { not: 'CANCELADO' },
        remitos: { none: { estado: 'VIGENTE' } },
      },
    ],
  }
}
