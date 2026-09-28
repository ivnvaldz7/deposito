import { Prisma, TipoReglaTransferenciaProducto } from '@platform/db'

export type CatalogIdentity = Readonly<{
  id: string
  nombre: string
  sku: string
}>

type RuleDefinition = Readonly<{
  sourceProductId: string
  targetProductId: string
  label: string
  tipo: TipoReglaTransferenciaProducto
  orden: number
}>

const ID = {
  energizante250: 'cmtx1uj0c000sv4oj2iwf25tv',
  energizante250Vacas: 'cmtx1uj0c000tv4ojvz40odvf',
  amino1L: 'cmtx1uj0b0005v4ojbzmb3mg1',
  amino1LAves: 'cmtx1uj0b0006v4ojhylnmm8y',
  amino1LEquino: 'cprodaminol1equino0000001',
  amino1LCerdos: 'cprodaminol1cerdos0000001',
  amino50: 'cprodaminobase50ml0000001',
  amino50Aves: 'cmtx1uj0b0009v4oj442qiqsj',
  amino50Mascota: 'cmtx1uj0b000av4ojlitjj9z7',
  complejo25: 'cmtx1uj0b000lv4ojvyr9787s',
  complejo25Equino: 'cmtx1uj0c000pv4ojz15e8sdg',
  complejo25Cerdos: 'cmtx1uj0b000nv4ojd54pcz1d',
  complejo100: 'cmtx1uj0b000kv4ojahkig0z8',
  complejo100Equino: 'cmtx1uj0b000ov4oj9pot2rl9',
  complejo100Cerdos: 'cmtx1uj0b000mv4oj79p15ycx',
  supercomplejo: 'cmtx1uj0c0015v4ojiyfwzbi5',
  supercomplejoAves: 'cmtx1uj0c0016v4ojtgpvujbn',
  supercomplejoEquino: 'cmtx1uj0c0017v4oj81rap46n',
} as const

// Exact catalog identities. The three entries introduced by the catalog patch
// are sourced from PROD-02A2; all others are asserted against PROD-02B.
export const PRODUCT_TRANSFER_CATALOG_IDENTITIES: readonly CatalogIdentity[] = [
  { id: ID.energizante250, nombre: 'ENERGIZANTE 250 ML', sku: 'LOG-E07A848866BEBE01' },
  { id: ID.energizante250Vacas, nombre: 'ENERGIZANTE 250 ML VACAS', sku: 'LOG-D7940EF93CB09EEA' },
  { id: ID.amino50, nombre: 'AMINOÁCIDOS 50 ML', sku: 'LOG-CD3520C476B6F5C6' },
  { id: ID.amino50Aves, nombre: 'AMINOÁCIDOS 50 ML AVES', sku: 'LOG-D8C1A70AF2FDD426' },
  { id: ID.amino50Mascota, nombre: 'AMINOÁCIDOS 50 ML MASCOTA', sku: 'LOG-10D28E61AA1B9F69' },
  { id: ID.amino1L, nombre: 'AMINOÁCIDOS 1 L', sku: 'LOG-AE01D316D2D64635' },
  { id: ID.amino1LAves, nombre: 'AMINOÁCIDOS 1 L AVES', sku: 'LOG-9860110B82774981' },
  { id: ID.amino1LEquino, nombre: 'AMINOÁCIDOS 1 L EQUINO', sku: 'LOG-7EA9922C837C111A' },
  { id: ID.amino1LCerdos, nombre: 'AMINOÁCIDOS 1 L CERDOS', sku: 'LOG-8CB0C424D18E1D65' },
  { id: ID.complejo25, nombre: 'COMPLEJO B HIERRO 25 ML', sku: 'LOG-EC1E9164D8079ACF' },
  { id: ID.complejo25Equino, nombre: 'COMPLEJO B HIERRO EQUINO 25 ML', sku: 'LOG-9216D7CBA4BA371B' },
  { id: ID.complejo25Cerdos, nombre: 'COMPLEJO B HIERRO CERDOS 25 ML', sku: 'LOG-88A1AC67454FABFC' },
  { id: ID.complejo100, nombre: 'COMPLEJO B HIERRO 100 ML', sku: 'LOG-5E595022AB9E0F7D' },
  { id: ID.complejo100Equino, nombre: 'COMPLEJO B HIERRO EQUINO 100 ML', sku: 'LOG-398E2341215524EB' },
  { id: ID.complejo100Cerdos, nombre: 'COMPLEJO B HIERRO CERDOS 100 ML', sku: 'LOG-C6104CE935EA7543' },
  { id: ID.supercomplejo, nombre: 'SUPERCOMPLEJO B 1 L', sku: 'LOG-56398B81D5B27106' },
  { id: ID.supercomplejoAves, nombre: 'SUPERCOMPLEJO B 1 L AVES', sku: 'LOG-2029B7F0486806D2' },
  { id: ID.supercomplejoEquino, nombre: 'SUPERCOMPLEJO B 1 L EQUINO', sku: 'LOG-020EF7CEF3AE4DC1' },
]

export const PRODUCT_TRANSFER_RULE_DEFINITIONS: readonly RuleDefinition[] = [
  { sourceProductId: ID.energizante250, targetProductId: ID.energizante250, label: 'Normal', tipo: TipoReglaTransferenciaProducto.SAME_PRODUCT, orden: 10 },
  { sourceProductId: ID.energizante250, targetProductId: ID.energizante250Vacas, label: 'Vacas', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
  { sourceProductId: ID.amino50, targetProductId: ID.amino50Aves, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 },
  { sourceProductId: ID.amino50, targetProductId: ID.amino50Mascota, label: 'Mascota', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
  { sourceProductId: ID.amino1L, targetProductId: ID.amino1LAves, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 },
  { sourceProductId: ID.amino1L, targetProductId: ID.amino1LEquino, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
  { sourceProductId: ID.amino1L, targetProductId: ID.amino1LCerdos, label: 'Cerdos', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 30 },
  { sourceProductId: ID.complejo25, targetProductId: ID.complejo25Equino, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 },
  { sourceProductId: ID.complejo25, targetProductId: ID.complejo25Cerdos, label: 'Cerdos', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
  { sourceProductId: ID.complejo100, targetProductId: ID.complejo100Equino, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 10 },
  { sourceProductId: ID.complejo100, targetProductId: ID.complejo100Cerdos, label: 'Cerdos', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
  { sourceProductId: ID.supercomplejo, targetProductId: ID.supercomplejo, label: 'Normal', tipo: TipoReglaTransferenciaProducto.SAME_PRODUCT, orden: 10 },
  { sourceProductId: ID.supercomplejo, targetProductId: ID.supercomplejoEquino, label: 'Equino', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 20 },
  { sourceProductId: ID.supercomplejo, targetProductId: ID.supercomplejoAves, label: 'Aves', tipo: TipoReglaTransferenciaProducto.PRESENTATION, orden: 30 },
]

export async function initializeProductTransferRules(tx: Prisma.TransactionClient): Promise<number> {
  const products = await tx.producto.findMany({
    where: { id: { in: PRODUCT_TRANSFER_CATALOG_IDENTITIES.map((identity) => identity.id) } },
    select: { id: true, nombre: true, sku: true, activo: true },
  })
  const actual = new Map(products.map((product) => [product.id, product]))
  for (const expected of PRODUCT_TRANSFER_CATALOG_IDENTITIES) {
    const product = actual.get(expected.id)
    if (!product || !product.activo || product.nombre !== expected.nombre || product.sku !== expected.sku) {
      throw new Error(`Catálogo destino no coincide exactamente: ${expected.id} (${expected.nombre})`)
    }
  }
  if (actual.size !== PRODUCT_TRANSFER_CATALOG_IDENTITIES.length) {
    throw new Error('El catálogo destino contiene identidades de transferencia duplicadas o faltantes')
  }

  for (const definition of PRODUCT_TRANSFER_RULE_DEFINITIONS) {
    await tx.productoTransferRule.upsert({
      where: {
        sourceProductId_targetProductId_label: {
          sourceProductId: definition.sourceProductId,
          targetProductId: definition.targetProductId,
          label: definition.label,
        },
      },
      create: { ...definition, activo: true },
      update: { tipo: definition.tipo, orden: definition.orden, activo: true },
    })
  }
  return PRODUCT_TRANSFER_RULE_DEFINITIONS.length
}
