import { describe, expect, it } from 'vitest'
import { automationDocumentTrayWhere } from '../automation-document-tray'

describe('automationDocumentTrayWhere', () => {
  it('includes only Automation orders that still need a document or a partial continuation', () => {
    expect(automationDocumentTrayWhere()).toEqual({
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
    })
  })
})
