import type { PrismaClient } from '@platform/db'

export const APPROVED_DRUG_NAMES = [
  'ÁCIDO CÍTRICO', 'ÁCIDO OLEICO', 'ALCOHOL BENCÍLICO', 'ARGININA',
  'ASPARTATO DE MAGNESIO', 'ASPARTATO DE POTASIO', 'ATP', 'BETAÍNA',
  'CITRATO DE SODIO', 'CLORURO CÚPRICO', 'CLORURO DE BENZALCONIO',
  'CLORURO DE CALCIO', 'CLORURO DE MAGNESIO', 'CLORURO DE SODIO',
  'CLORURO DE ZINC', 'CLORURO DE COBALTO', 'DEXTROSA',
  'DIISOPROPILAMINA DICLOROACETATO', 'EDETATO DE COBRE Y ZINC',
  'EDETATO DE ZINC', 'EDTA', 'FENOL', 'FOSFATO DE SODIO', 'GLICERINA',
  'GLICEROFORMAL', 'GLUCONATO DE CALCIO', 'GLUCONATO DE ZINC',
  'HIERRO CITRATO', 'HIERRO CITRATO 50%', 'IODURO DE SODIO', 'ISOLEUCINA',
  'LECHE CONDENSADA', 'LEUCINA', 'LEVAMISOL', 'LISINA', 'METILPARABENO',
  'NICOTINAMIDA', 'NITRITO DE SODIO', 'PANTOTENATO DE CALCIO',
  'PROPILENGLICOL', 'PROPILPARABENO', 'SELENITO DE SODIO', 'SODA CÁUSTICA',
  'SORBITOL', 'TILMICOSIN FOSFATO', 'TWEEN', 'VAINILLA AROMÁTICA',
  'VITAMINA A', 'VITAMINA B1', 'VITAMINA B12', 'VITAMINA B6', 'VITAMINA C',
  'VITAMINA D2', 'VITAMINA E', 'VITAMINA B2-5 FOSFATO',
] as const

interface DrugSnapshot {
  nombreBase: string
  nombreCompleto: string
  categoria: string
  codigo: string | null
  mercado: string | null
  mercadosHabilitados: readonly string[]
  estado: string | null
  activo: boolean
  origen: string
}

export function validateApprovedDrugSnapshot(actual: DrugSnapshot, expectedName: string): 'already-correct' {
  const matches = actual.nombreBase === expectedName
    && actual.nombreCompleto === expectedName
    && actual.categoria === 'droga'
    && actual.codigo === null
    && actual.mercado === null
    && actual.mercadosHabilitados.length === 0
    && actual.estado === 'ACTIVO'
    && actual.activo
    && actual.origen === 'IMPORTACION'
  if (!matches) throw new Error(`Approved drug catalog drift detected for ${expectedName}`)
  return 'already-correct'
}

export interface InitialDrugCatalogResult {
  created: number
  total: number
  replay: boolean
}

export class CatalogoInicialDrogasService {
  constructor(private readonly db: PrismaClient) {}

  async apply(): Promise<InitialDrugCatalogResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('deposito:catalogo-inicial-drogas'))`
          const existing = await tx.depositoProducto.findMany({
            where: { categoria: 'droga', nombreCompleto: { in: [...APPROVED_DRUG_NAMES] }, mercado: null },
          })
          const byName = new Map(existing.map((product) => [product.nombreCompleto, product]))
          for (const product of existing) validateApprovedDrugSnapshot(product, product.nombreCompleto)

          const missing = APPROVED_DRUG_NAMES.filter((name) => !byName.has(name))
          if (missing.length > 0) {
            await tx.depositoProducto.createMany({ data: missing.map((name) => ({
              nombreBase: name,
              nombreCompleto: name,
              categoria: 'droga' as const,
              codigo: null,
              mercado: null,
              mercadosHabilitados: [],
              estado: 'ACTIVO' as const,
              activo: true,
              origen: 'IMPORTACION' as const,
            })) })
          }

          const total = await tx.depositoProducto.count({
            where: { categoria: 'droga', nombreCompleto: { in: [...APPROVED_DRUG_NAMES] }, mercado: null },
          })
          if (total !== APPROVED_DRUG_NAMES.length) {
            throw new Error(`Approved drug catalog incomplete: expected ${APPROVED_DRUG_NAMES.length}, found ${total}`)
          }
          return { created: missing.length, total, replay: missing.length === 0 }
        }, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (isRetryable(error) && attempt < 2) continue
        throw error
      }
    }
    throw new Error('Unable to persist approved drug catalog')
  }
}

function isRetryable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034'
}
