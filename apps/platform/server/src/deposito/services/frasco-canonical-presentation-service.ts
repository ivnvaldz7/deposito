import type { PrismaClient } from '@platform/db'

export interface CanonicalFrascoPresentation {
  codigo: string
  currentName: string
  nombreBase: string
  presentacion: number
  unidad: 'ML' | 'L' | 'GR'
}

const APPROVED_FRASCOS = [
  ['AGROPECUARIO 25 ML', 'AGROPECUARIO', 25, 'ML'],
  ['AGROPECUARIO 100 ML', 'AGROPECUARIO', 100, 'ML'],
  ['AGROPECUARIO 500 ML', 'AGROPECUARIO', 500, 'ML'],
  ['AMBAR 100 ML', 'AMBAR', 100, 'ML'],
  ['BIDÓN 500 ML', 'BIDÓN', 500, 'ML'],
  ['BIDÓN BLANCO 1 L', 'BIDÓN BLANCO', 1, 'L'],
  ['BIDÓN BLANCO 5 L', 'BIDÓN BLANCO', 5, 'L'],
  ['BLANCO 500 ML', 'BLANCO', 500, 'ML'],
  ['DORADO 50 ML', 'DORADO', 50, 'ML'],
  ['DORADO 250 ML', 'DORADO', 250, 'ML'],
  ['DORADO 500 ML', 'DORADO', 500, 'ML'],
  ['GOTERO 60 ML', 'GOTERO', 60, 'ML'],
  ['IVERSAN 50 ML', 'IVERSAN', 50, 'ML'],
  ['TRANSPARENTE 500 ML', 'TRANSPARENTE', 500, 'ML'],
  ['JERINGA 35 GR', 'JERINGA', 35, 'GR'],
  ['MARRÓN 300 ML', 'MARRÓN', 300, 'ML'],
  ['MARRÓN 500 ML', 'MARRÓN', 500, 'ML'],
  ['PVC 100 ML', 'PVC', 100, 'ML'],
  ['PVC 200 ML', 'PVC', 200, 'ML'],
  ['PVC 500 ML', 'PVC', 500, 'ML'],
  ['VETERINARIO 250 ML', 'VETERINARIO', 250, 'ML'],
] as const

export const CANONICAL_FRASCO_PRESENTATIONS: readonly CanonicalFrascoPresentation[] = APPROVED_FRASCOS.map(
  ([currentName, nombreBase, presentacion, unidad], index) => ({
    codigo: `ENV${String(index + 63).padStart(3, '0')}`,
    currentName, nombreBase, presentacion, unidad,
  }),
)

interface FrascoSnapshot {
  codigo: string | null
  nombreBase: string
  nombreCompleto: string
  presentacion: number | null
  unidad: string | null
  categoria: string
  mercado: string | null
  estado: string | null
  activo: boolean
}

export function validateCanonicalFrascoSnapshot(
  actual: FrascoSnapshot,
  expected: CanonicalFrascoPresentation,
): 'needs-update' | 'already-correct' {
  const invariantMatches = actual.codigo === expected.codigo
    && actual.nombreCompleto === expected.currentName
    && actual.categoria === 'frasco'
    && actual.mercado === 'argentina'
    && actual.estado === 'ACTIVO'
    && actual.activo
  if (!invariantMatches) throw new Error(`Canonical Frasco drift detected for ${expected.codigo}`)
  if (actual.nombreBase === expected.currentName && actual.presentacion === null && actual.unidad === null) return 'needs-update'
  if (actual.nombreBase === expected.nombreBase && actual.presentacion === expected.presentacion && actual.unidad === expected.unidad) return 'already-correct'
  throw new Error(`Canonical Frasco presentation drift detected for ${expected.codigo}`)
}

export class FrascoCanonicalPresentationService {
  constructor(private readonly db: PrismaClient) {}

  async apply(): Promise<{ updated: number; replay: boolean }> {
    return this.db.$transaction(async (tx) => {
      const codes = CANONICAL_FRASCO_PRESENTATIONS.map(({ codigo }) => codigo)
      const placeholders = codes.map((_, index) => `$${index + 1}`).join(', ')
      await tx.$queryRawUnsafe(`SELECT id FROM deposito.productos WHERE codigo IN (${placeholders}) ORDER BY codigo FOR UPDATE`, ...codes)
      const products = await tx.depositoProducto.findMany({ where: { codigo: { in: codes } } })
      if (products.length !== CANONICAL_FRASCO_PRESENTATIONS.length) {
        throw new Error(`Canonical Frasco set incomplete: expected 21, found ${products.length}`)
      }
      const byCode = new Map(products.map((product) => [product.codigo, product]))
      let updated = 0
      for (const expected of CANONICAL_FRASCO_PRESENTATIONS) {
        const product = byCode.get(expected.codigo)
        if (!product) throw new Error(`Missing canonical Frasco ${expected.codigo}`)
        if (validateCanonicalFrascoSnapshot(product, expected) === 'already-correct') continue
        const result = await tx.depositoProducto.updateMany({
          where: {
            id: product.id, codigo: expected.codigo, nombreBase: expected.currentName,
            nombreCompleto: expected.currentName, presentacion: null, unidad: null,
            categoria: 'frasco', mercado: 'argentina', estado: 'ACTIVO', activo: true,
          },
          data: { nombreBase: expected.nombreBase, presentacion: expected.presentacion, unidad: expected.unidad },
        })
        if (result.count !== 1) throw new Error(`Concurrent drift detected for ${expected.codigo}`)
        updated += 1
      }
      return { updated, replay: updated === 0 }
    }, { isolationLevel: 'Serializable' })
  }
}
