import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { platformDb as db, Prisma } from '@platform/db'

type CatalogProduct = Readonly<{ id?: string; nombre: string; sku?: string; unidadesPorCaja: number }>
type SourceRow = Readonly<{
  sourceRow: string
  sourceProductName: string
  lot: string
  location: 'DEPOSITO' | 'ACONDICIONADO'
  quantity: number
}>

const TARGET_DATABASE = process.env.PROD_02_TARGET_DATABASE ?? 'platform_prod'
const ALLOWED_TARGET_DATABASES = new Set(['platform_prod', 'platform_uat'])

if (!ALLOWED_TARGET_DATABASES.has(TARGET_DATABASE)) {
  throw new Error(`Target PROD-02 no autorizado: ${TARGET_DATABASE}`)
}

// PROD-02B is content-addressed by product ID. Persist these identities in the
// catalog source so a new UAT replica is bit-for-bit compatible with the
// approved manifest instead of depending on generated CUID timing.
const MANIFEST_PRODUCT_IDS: Readonly<Record<string, string>> = {
  'AMANTINA 250 ML': 'cmtx1uj0a0000v4ojji8orf8n',
  'AMANTINA 500 ML': 'cmtx1uj0b0001v4oj4jkfmyyy',
  'AMANTINA PREMIUM 100 ML': 'cmtx1uj0b0002v4oj1l2wg5v8',
  'AMANTINA PREMIUM 250 ML': 'cmtx1uj0b0003v4ojppmdz0a1',
  'AMANTINA PREMIUM 500 ML': 'cmtx1uj0b0004v4ojv2vj50mj',
  'AMINOÁCIDOS 1 L': 'cmtx1uj0b0005v4ojbzmb3mg1',
  'AMINOÁCIDOS 1 L AVES': 'cmtx1uj0b0006v4ojhylnmm8y',
  'AMINOÁCIDOS 20 ML': 'cmtx1uj0b0007v4oj4c3wnnl5',
  'AMINOÁCIDOS 5 L': 'cmtx1uj0b0008v4oj6w6ngumu',
  'AMINOÁCIDOS 50 ML AVES': 'cmtx1uj0b0009v4oj442qiqsj',
  'AMINOÁCIDOS 50 ML MASCOTA': 'cmtx1uj0b000av4ojlitjj9z7',
  'AMINOÁCIDOS INYECTABLE 100 ML': 'cmtx1uj0b000bv4ojii6vi6t8',
  'AMINOÁCIDOS INYECTABLE 250 ML': 'cmtx1uj0b000cv4ojvlf1796h',
  'ANTITÉRMICO 1 L': 'cmtx1uj0b000dv4ojmma4l21c',
  'CALCITROVIT 500 ML': 'cmtx1uj0b000ev4ojrpgld1lt',
  'CETRI-AMON 1 L': 'cmtx1uj0b000fv4oj93i3jt3d',
  'CETRI-AMON 5 L': 'cmtx1uj0b000gv4ojo2chv9d2',
  'COMPLEJO B B12 B15 100 ML': 'cmtx1uj0b000hv4ojybthyaux',
  'COMPLEJO B B12 B15 20 ML': 'cmtx1uj0b000iv4ojp9prcnol',
  'COMPLEJO B B12 B15 250 ML': 'cmtx1uj0b000jv4oj9edlbnee',
  'COMPLEJO B HIERRO 100 ML': 'cmtx1uj0b000kv4ojahkig0z8',
  'COMPLEJO B HIERRO 25 ML': 'cmtx1uj0b000lv4ojvyr9787s',
  'COMPLEJO B HIERRO CERDOS 100 ML': 'cmtx1uj0b000mv4oj79p15ycx',
  'COMPLEJO B HIERRO CERDOS 25 ML': 'cmtx1uj0b000nv4ojd54pcz1d',
  'COMPLEJO B HIERRO EQUINO 100 ML': 'cmtx1uj0b000ov4oj9pot2rl9',
  'COMPLEJO B HIERRO EQUINO 25 ML': 'cmtx1uj0c000pv4ojz15e8sdg',
  'ENERGIZANTE 100 ML': 'cmtx1uj0c000qv4ojj1tqba8u',
  'ENERGIZANTE 25 ML': 'cmtx1uj0c000rv4ojhi7tow0m',
  'ENERGIZANTE 250 ML': 'cmtx1uj0c000sv4oj2iwf25tv',
  'ENERGIZANTE 250 ML VACAS': 'cmtx1uj0c000tv4ojvz40odvf',
  'ENERGIZANTE 500 ML': 'cmtx1uj0c000uv4ojg1186lsv',
  'IVERSAN 500 ML': 'cmtx1uj0c000vv4ojx9skdhrf',
  'JERINGA ATP 35 GR': 'cmtx1uj0c000wv4oj9mkwpjj0',
  'OLIFAMISOL 500 ML': 'cmtx1uj0c000xv4ojjnggfzk1',
  'OLIVITASAN 100 ML': 'cmtx1uj0c000yv4ojdfw801g7',
  'OLIVITASAN 25 ML': 'cmtx1uj0c000zv4ojsqnev0dy',
  'OLIVITASAN 300 ML': 'cmtx1uj0c0010v4ojyjgr8bns',
  'OLIVITASAN 500 ML': 'cmtx1uj0c0011v4oj9hh1wr2d',
  'OLIVITASAN PLUS 250 ML': 'cmtx1uj0c0012v4ojl6s5dksy',
  'OLIVITASAN PLUS 50 ML': 'cmtx1uj0c0013v4ojd0bb6rzl',
  'OLIVITASAN PLUS 500 ML': 'cmtx1uj0c0014v4oj0fyb2l8e',
  'SUPERCOMPLEJO B 1 L': 'cmtx1uj0c0015v4ojiyfwzbi5',
  'SUPERCOMPLEJO B 1 L AVES': 'cmtx1uj0c0016v4ojtgpvujbn',
  'SUPERCOMPLEJO B 1 L EQUINO': 'cmtx1uj0c0017v4oj81rap46n',
  'TILCOSAN 100 ML': 'cmtx1uj0c0018v4oj1hgkyorc',
  'TILCOSAN 250 ML': 'cmtx1uj0c0019v4oj3kpcww9l',
  'VITAMINA B1 100 ML': 'cmtx1uj0c001av4ojiz0l0xj0',
  'VITAMINA B12 100 ML': 'cmtx1uj0c001bv4ojhzbc93m5',
  'VITAMINA B12 50 ML': 'cmtx1uj0c001cv4oj8gmbwj7f',
}

const CATALOG: readonly CatalogProduct[] = [
  { nombre: 'AMANTINA 250 ML', unidadesPorCaja: 15 },
  { nombre: 'AMANTINA 500 ML', unidadesPorCaja: 20 },
  { nombre: 'AMANTINA PREMIUM 100 ML', unidadesPorCaja: 30 },
  { nombre: 'AMANTINA PREMIUM 250 ML', unidadesPorCaja: 24 },
  { nombre: 'AMANTINA PREMIUM 500 ML', unidadesPorCaja: 20 },
  { nombre: 'AMINOÁCIDOS 1 L', unidadesPorCaja: 12 },
  { nombre: 'AMINOÁCIDOS 1 L AVES', unidadesPorCaja: 12 },
  { id: 'cprodaminol1equino0000001', nombre: 'AMINOÁCIDOS 1 L EQUINO', sku: 'LOG-7EA9922C837C111A', unidadesPorCaja: 12 },
  { id: 'cprodaminol1cerdos0000001', nombre: 'AMINOÁCIDOS 1 L CERDOS', sku: 'LOG-8CB0C424D18E1D65', unidadesPorCaja: 12 },
  { nombre: 'AMINOÁCIDOS 20 ML', unidadesPorCaja: 15 },
  { nombre: 'AMINOÁCIDOS 5 L', unidadesPorCaja: 4 },
  { id: 'cprodaminobase50ml0000001', nombre: 'AMINOÁCIDOS 50 ML', sku: 'LOG-CD3520C476B6F5C6', unidadesPorCaja: 40 },
  // The SKU remains the established GALLO identity while the operational
  // canonical name is normalized to AVES. Existing production rows keep ID,
  // SKU, lots and balances through the additive catalog patch.
  { nombre: 'AMINOÁCIDOS 50 ML AVES', sku: 'LOG-D8C1A70AF2FDD426', unidadesPorCaja: 40 },
  { nombre: 'AMINOÁCIDOS 50 ML MASCOTA', unidadesPorCaja: 40 },
  { nombre: 'AMINOÁCIDOS INYECTABLE 100 ML', unidadesPorCaja: 24 },
  { nombre: 'AMINOÁCIDOS INYECTABLE 250 ML', unidadesPorCaja: 24 },
  { nombre: 'ANTITÉRMICO 1 L', unidadesPorCaja: 12 },
  { nombre: 'CALCITROVIT 500 ML', unidadesPorCaja: 20 },
  { nombre: 'CETRI-AMON 1 L', unidadesPorCaja: 12 },
  { nombre: 'CETRI-AMON 5 L', unidadesPorCaja: 4 },
  { nombre: 'COMPLEJO B B12 B15 100 ML', unidadesPorCaja: 24 },
  { nombre: 'COMPLEJO B B12 B15 20 ML', unidadesPorCaja: 12 },
  { nombre: 'COMPLEJO B B12 B15 250 ML', unidadesPorCaja: 24 },
  { nombre: 'COMPLEJO B HIERRO 100 ML', unidadesPorCaja: 24 },
  { nombre: 'COMPLEJO B HIERRO 25 ML', unidadesPorCaja: 20 },
  { nombre: 'COMPLEJO B HIERRO CERDOS 100 ML', unidadesPorCaja: 24 },
  { nombre: 'COMPLEJO B HIERRO CERDOS 25 ML', unidadesPorCaja: 20 },
  { nombre: 'COMPLEJO B HIERRO EQUINO 100 ML', unidadesPorCaja: 24 },
  { nombre: 'COMPLEJO B HIERRO EQUINO 25 ML', unidadesPorCaja: 20 },
  { nombre: 'ENERGIZANTE 100 ML', unidadesPorCaja: 24 },
  { nombre: 'ENERGIZANTE 25 ML', unidadesPorCaja: 20 },
  { nombre: 'ENERGIZANTE 250 ML', unidadesPorCaja: 24 },
  { nombre: 'ENERGIZANTE 250 ML VACAS', unidadesPorCaja: 24 },
  { nombre: 'ENERGIZANTE 500 ML', unidadesPorCaja: 20 },
  { nombre: 'IVERSAN 500 ML', unidadesPorCaja: 20 },
  { nombre: 'JERINGA ATP 35 GR', unidadesPorCaja: 24 },
  { nombre: 'OLIFAMISOL 500 ML', unidadesPorCaja: 20 },
  { nombre: 'OLIVITASAN 100 ML', unidadesPorCaja: 40 },
  { nombre: 'OLIVITASAN 25 ML', unidadesPorCaja: 20 },
  { nombre: 'OLIVITASAN 300 ML', unidadesPorCaja: 24 },
  { nombre: 'OLIVITASAN 500 ML', unidadesPorCaja: 20 },
  { nombre: 'OLIVITASAN PLUS 250 ML', unidadesPorCaja: 24 },
  { nombre: 'OLIVITASAN PLUS 50 ML', unidadesPorCaja: 40 },
  { nombre: 'OLIVITASAN PLUS 500 ML', unidadesPorCaja: 20 },
  { nombre: 'SUPERCOMPLEJO B 1 L', unidadesPorCaja: 12 },
  { nombre: 'SUPERCOMPLEJO B 1 L AVES', unidadesPorCaja: 12 },
  { nombre: 'SUPERCOMPLEJO B 1 L EQUINO', unidadesPorCaja: 12 },
  { nombre: 'TILCOSAN 100 ML', unidadesPorCaja: 24 },
  { nombre: 'TILCOSAN 250 ML', unidadesPorCaja: 24 },
  { nombre: 'VITAMINA B1 100 ML', unidadesPorCaja: 24 },
  { nombre: 'VITAMINA B12 100 ML', unidadesPorCaja: 24 },
  { nombre: 'VITAMINA B12 50 ML', unidadesPorCaja: 30 },
]

const SOURCE_ROWS: readonly SourceRow[] = [
  ['D01', 'AMANTINA 250 ML', 'AM0141', 'DEPOSITO', 78],
  ['D02', 'AMANTINA 500 ML', 'AM0141', 'DEPOSITO', 1068],
  ['D03', 'AMANTINA PREMIUM 100 ML', 'AP0060', 'DEPOSITO', 0],
  ['D04', 'AMANTINA PREMIUM 250 ML', 'AP0034', 'DEPOSITO', 0],
  ['D05', 'AMANTINA PREMIUM 500 ML', 'AP0082', 'DEPOSITO', 475],
  ['D06', 'AMINOÁCIDOS 1 L', 'AO0298', 'DEPOSITO', 640],
  ['D07', 'AMINOÁCIDOS 1 L AVES', 'AO0282', 'DEPOSITO', 0],
  ['D08', 'AMINOÁCIDOS 20 ML', 'AO0248', 'DEPOSITO', 0],
  ['D09', 'AMINOÁCIDOS 5 L', 'AO0296', 'DEPOSITO', 0],
  ['D10', 'AMINOÁCIDOS 50 ML AVES', 'AO0297', 'DEPOSITO', 379],
  ['D11', 'AMINOÁCIDOS 50 ML MASCOTA', 'AO0297', 'DEPOSITO', 406],
  ['D12', 'ANTITÉRMICO 1 L', 'AT0017', 'DEPOSITO', 60],
  ['D13', 'CALCITROVIT 500 ML', 'CV0018', 'DEPOSITO', 0],
  ['D14', 'CETRI-AMON 1 L', 'CA0132', 'DEPOSITO', 174],
  ['D15', 'CETRI-AMON 5 L', 'CA0132', 'DEPOSITO', 170],
  ['D16', 'COMPLEJO B B12 B15 100 ML', 'CB0094', 'DEPOSITO', 436],
  ['D17', 'COMPLEJO B B12 B15 20 ML', 'CB0094', 'DEPOSITO', 912],
  ['D18', 'COMPLEJO B B12 B15 250 ML', 'CB0096', 'DEPOSITO', 691],
  ['D19', 'COMPLEJO B HIERRO CERDOS 100 ML', 'HB0030', 'DEPOSITO', 120],
  ['D20', 'COMPLEJO B HIERRO CERDOS 25 ML', 'HB0025', 'DEPOSITO', 0],
  ['D21', 'COMPLEJO B HIERRO EQUINO 25 ML', 'HB0028', 'DEPOSITO', 40],
  ['D22', 'COMPLEJO B HIERRO EQUINOS 100 ML', 'HB0030', 'DEPOSITO', 598],
  ['D23', 'ENERGIZANTE 100 ML', 'EN0131', 'DEPOSITO', 1988],
  ['D24', 'ENERGIZANTE 25 ML', 'EN0132', 'DEPOSITO', 169],
  ['D25', 'ENERGIZANTE 250 ML', 'EN0131', 'DEPOSITO', 368],
  ['D26', 'ENERGIZANTE 250 ML VACAS', 'EN0129', 'DEPOSITO', 153],
  ['D27', 'ENERGIZANTE 500 ML', 'EN0122', 'DEPOSITO', 0],
  ['D28', 'IVERSAN 500 ML', 'IV0038', 'DEPOSITO', 0],
  ['D29', 'JERINGA ATP 35 GR', 'EN0116', 'DEPOSITO', 472],
  ['D30', 'OLIVITASAN 100 ML', 'OL0909', 'DEPOSITO', 224],
  ['D31', 'OLIVITASAN 25 ML', 'OL0910', 'DEPOSITO', 51],
  ['D32', 'OLIVITASAN 300 ML', 'OL0926', 'DEPOSITO', 281],
  ['D33', 'OLIVITASAN 500 ML', 'OL0925', 'DEPOSITO', 2020],
  ['D34', 'OLIVITASAN PLUS 250 ML', 'PL0605', 'DEPOSITO', 251],
  ['D35', 'OLIVITASAN PLUS 50 ML', 'PL0578', 'DEPOSITO', 0],
  ['D36', 'OLIVITASAN PLUS 500 ML', 'PL0614', 'DEPOSITO', 1860],
  ['D37', 'SUPERCOMPLEJO B 1 L AVES', 'SC0014', 'DEPOSITO', 80],
  ['D38', 'SUPERCOMPLEJO B 1 L EQUINO', 'SC0014', 'DEPOSITO', 1],
  ['D39', 'TILCOSAN 100 ML', 'TM0036', 'DEPOSITO', 409],
  ['D40', 'TILCOSAN 250 ML', 'TM0038', 'DEPOSITO', 2253],
  ['D41', 'VITAMINA B1 100 ML', 'VB0017', 'DEPOSITO', 118],
  ['D42', 'VITAMINA B12 100 ML', 'BB005', 'DEPOSITO', 212],
  ['D43', 'VITAMINA B12 50 ML', 'BB005', 'DEPOSITO', 20],
  ['A01', 'AMINOÁCIDOS 1 L', 'AO0298', 'ACONDICIONADO', 666],
  ['A02', 'AMINOÁCIDOS INYECTABLE 100ML', 'AI0031', 'ACONDICIONADO', 400],
  ['A03', 'AMINOÁCIDOS INYECTABLE 250ML', 'AI0031', 'ACONDICIONADO', 312],
  ['A04', 'ANTITERMICO 1L', 'AT0017', 'ACONDICIONADO', 708],
  ['A05', 'COMPLEJO B B12 B15 100 ML', 'CB0096', 'ACONDICIONADO', 6200],
  ['A06', 'COMPLEJO B HIERRO 100 ML', 'HB0030', 'ACONDICIONADO', 740],
  ['A07', 'COMPLEJO B HIERRO 25 ML', 'HB0029', 'ACONDICIONADO', 360],
  ['A08', 'ENERGIZANTE 100 ML', 'EN0132', 'ACONDICIONADO', 1000],
  ['A09', 'JERINGA ATP 35 GR', 'EN0116', 'ACONDICIONADO', 1768],
  ['A10', 'OLIFAMISOL 500ML', 'OF0008', 'ACONDICIONADO', 120],
  ['A11', 'SUPERCOMPLEJO B 1L', 'SC0014', 'ACONDICIONADO', 465],
  ['A12', 'VITAMINA B1 100 ML', 'VB0017', 'ACONDICIONADO', 1890],
  ['A13', 'VITAMINA B12 100ML', 'BB0005', 'ACONDICIONADO', 630],
].map(([sourceRow, sourceProductName, lot, location, quantity]) => ({
  sourceRow: String(sourceRow),
  sourceProductName: String(sourceProductName),
  lot: String(lot),
  location: location as SourceRow['location'],
  quantity: Number(quantity),
}))

const buildTechnicalSku = (name: string): string =>
  `LOG-${createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 16).toUpperCase()}`

function normalizedProductKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d+)\s*ML\b/g, '$1 ML')
    .replace(/(\d+)\s*GR\b/g, '$1 GR')
    .replace(/(\d+)\s*L\b/g, '$1 L')
    .replace(/\bEQUINOS\b/g, 'EQUINO')
    .replace(/\s+/g, ' ')
}

function correctedLot(row: SourceRow): string {
  if (row.sourceProductName.startsWith('VITAMINA B12 ') && row.lot === 'BB005') return 'BB0005'
  if (row.sourceProductName === 'JERINGA ATP 35 GR' && row.lot === 'EN0116') return 'EA0116'
  return row.lot
}

function validateStaticData(): void {
  if (CATALOG.length !== 52) throw new Error(`Catálogo inválido: ${CATALOG.length} productos`)
  if (SOURCE_ROWS.length !== 56) throw new Error(`Fuente inválida: ${SOURCE_ROWS.length} filas`)

  const names = new Set(CATALOG.map((product) => product.nombre))
  const skus = new Set(CATALOG.map((product) => product.sku ?? buildTechnicalSku(product.nombre)))
  const keys = new Set(CATALOG.map((product) => normalizedProductKey(product.nombre)))
  if (names.size !== 52) throw new Error('Hay nombres canónicos duplicados')
  if (skus.size !== 52) throw new Error('Hay SKU técnicos duplicados')
  if (keys.size !== 52) throw new Error('Hay nombres canónicos ambiguos después de normalizar')
  if (CATALOG.some((product) => !Number.isInteger(product.unidadesPorCaja) || product.unidadesPorCaja <= 0)) {
    throw new Error('Hay unidadesPorCaja inválidas')
  }
  const catalogIds = CATALOG.map((product) => product.id ?? MANIFEST_PRODUCT_IDS[product.nombre])
  if (catalogIds.some((id) => !id) || new Set(catalogIds).size !== 52) {
    throw new Error('Hay IDs de catálogo faltantes o duplicados')
  }

  const totals = summarizeSource()
  if (totals.deposit !== 17177 || totals.conditioned !== 15259 || totals.total !== 32436 || totals.zeroRows !== 10) {
    throw new Error(`Totales fuente inválidos: ${JSON.stringify(totals)}`)
  }
}

function summarizeSource(): { deposit: number; conditioned: number; total: number; zeroRows: number } {
  const deposit = SOURCE_ROWS.filter((row) => row.location === 'DEPOSITO').reduce((sum, row) => sum + row.quantity, 0)
  const conditioned = SOURCE_ROWS.filter((row) => row.location === 'ACONDICIONADO').reduce((sum, row) => sum + row.quantity, 0)
  return {
    deposit,
    conditioned,
    total: deposit + conditioned,
    zeroRows: SOURCE_ROWS.filter((row) => row.quantity === 0).length,
  }
}

async function readCounts(client: Prisma.TransactionClient | typeof db) {
  const [product, lot, balance, movement, order, reservation, outbox] = await Promise.all([
    client.producto.count(),
    client.lote.count(),
    client.saldoStock.count(),
    client.movimientoStock.count(),
    client.pedido.count(),
    client.reservaStock.count(),
    client.stockProjectionOutbox.count(),
  ])
  return { product, lot, balance, movement, order, reservation, outbox }
}

async function assertTarget(client: Prisma.TransactionClient | typeof db): Promise<void> {
  const [target] = await client.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
  if (target?.database !== TARGET_DATABASE) throw new Error(`Target rechazado: ${target?.database ?? 'UNKNOWN'}`)
}

function catalogProductId(product: CatalogProduct): string {
  const id = product.id ?? MANIFEST_PRODUCT_IDS[product.nombre]
  if (!id) throw new Error(`ID estable faltante: ${product.nombre}`)
  return id
}

async function applyCatalog(): Promise<void> {
  const created = await db.$transaction(async (tx) => {
    await assertTarget(tx)
    const before = await readCounts(tx)
    if (before.product !== 0 || before.lot !== 0 || before.balance !== 0 || before.movement !== 0 || before.order !== 0) {
      throw new Error(`Precheck rechazado: ${JSON.stringify(before)}`)
    }

    await tx.producto.createMany({
      data: CATALOG.map((product) => ({
        id: catalogProductId(product),
        nombre: product.nombre,
        sku: product.sku ?? buildTechnicalSku(product.nombre),
        unidadesPorCaja: product.unidadesPorCaja,
        activo: true,
      })),
    })

    const products = await tx.producto.findMany({
      select: { id: true, nombre: true, sku: true, unidadesPorCaja: true, activo: true },
      orderBy: { nombre: 'asc' },
    })
    assertExactCatalog(products)
    return products.length
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  console.log(JSON.stringify({ target: TARGET_DATABASE, productsCreated: created }))
}

type StoredProduct = Readonly<{
  id: string
  nombre: string
  sku: string
  unidadesPorCaja: number
  activo: boolean
}>

function assertExactCatalog(products: readonly StoredProduct[]): void {
  if (products.length !== 52) throw new Error(`Product count inválido: ${products.length}`)
  const actual = new Map(products.map((product) => [product.nombre, product]))
  for (const expected of CATALOG) {
    const product = actual.get(expected.nombre)
    if (!product) throw new Error(`Falta producto: ${expected.nombre}`)
    if (product.id !== catalogProductId(expected)) throw new Error(`ID inválido: ${expected.nombre}`)
    if (product.sku !== (expected.sku ?? buildTechnicalSku(expected.nombre))) throw new Error(`SKU inválido: ${expected.nombre}`)
    if (product.unidadesPorCaja !== expected.unidadesPorCaja) throw new Error(`unidadesPorCaja inválidas: ${expected.nombre}`)
    if (!product.activo) throw new Error(`Producto inactivo: ${expected.nombre}`)
  }
  if (new Set(products.map((product) => product.sku)).size !== 52) throw new Error('Los SKU persistidos no son únicos')
  if (new Set(products.map((product) => product.nombre)).size !== 52) throw new Error('Los nombres persistidos no son únicos')
}

async function readAndVerifyProducts(): Promise<StoredProduct[]> {
  await assertTarget(db)
  const counts = await readCounts(db)
  if (
    counts.product !== 52 || counts.lot !== 0 || counts.balance !== 0 || counts.movement !== 0
    || counts.order !== 0 || counts.reservation !== 0 || counts.outbox !== 0
  ) throw new Error(`Postcondition rechazada: ${JSON.stringify(counts)}`)

  const products = await db.producto.findMany({
    select: { id: true, nombre: true, sku: true, unidadesPorCaja: true, activo: true },
    orderBy: { nombre: 'asc' },
  })
  assertExactCatalog(products)
  return products
}

function buildManifestRows(products: readonly StoredProduct[]) {
  const byKey = new Map<string, StoredProduct[]>()
  for (const product of products) {
    const key = normalizedProductKey(product.nombre)
    byKey.set(key, [...(byKey.get(key) ?? []), product])
  }

  return SOURCE_ROWS.map((row) => {
    const candidates = byKey.get(normalizedProductKey(row.sourceProductName)) ?? []
    if (candidates.length !== 1) {
      throw new Error(`${row.sourceRow}: ${candidates.length === 0 ? 'NOT_FOUND' : 'AMBIGUOUS'}`)
    }
    const product = candidates[0]
    return {
      sourceRow: row.sourceRow,
      productId: product.id,
      canonicalProductName: product.nombre,
      sku: product.sku,
      lot: correctedLot(row),
      location: row.location,
      quantity: row.quantity,
      unidadesPorCaja: product.unidadesPorCaja,
      matchType: row.sourceProductName === product.nombre ? 'EXACT' : 'NORMALIZED',
      createActiveZeroLot: row.quantity === 0,
    }
  })
}

async function generateManifest(): Promise<void> {
  const products = await readAndVerifyProducts()
  const rows = buildManifestRows(products)
  const totals = summarizeSource()
  const payload = {
    lineage: 'prod-02b-initial-stock',
    generatedAt: new Date().toISOString(),
    targetDatabase: 'platform_prod',
    authoritativeSource: 'PROD-02A user-supplied initial stock',
    applyStatus: 'NOT_APPLIED',
    corrections: {
      vitaminB12Lot: 'BB0005',
      syringeAtpLot: 'EA0116',
      equineVariant: 'EQUINO',
      legacyAmino50Presentation: 'AVES',
    },
    summary: {
      sourceRows: rows.length,
      resolvedRows: rows.length,
      notFound: 0,
      ambiguous: 0,
      zeroLotRows: rows.filter((row) => row.createActiveZeroLot).length,
      depositTotal: totals.deposit,
      conditionedTotal: totals.conditioned,
      generalTotal: totals.total,
    },
    rows,
  }
  const path = resolve(process.cwd(), '../../../docs/operations/PROD-02B-initial-stock-manifest.json')
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ manifest: path, summary: payload.summary }))
}

async function main(): Promise<void> {
  validateStaticData()
  const command = process.argv[2]
  if (command === 'validate-data') {
    console.log(JSON.stringify({ catalogProducts: 52, uniqueSku: 52, ...summarizeSource() }))
    return
  }
  if (command === 'apply') {
    await applyCatalog()
    return
  }
  if (command === 'verify') {
    const products = await readAndVerifyProducts()
    console.log(JSON.stringify({ target: TARGET_DATABASE, products }))
    return
  }
  if (command === 'manifest') {
    await generateManifest()
    return
  }
  throw new Error('Uso: prod-02a2-catalog.ts <validate-data|apply|verify|manifest>')
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
