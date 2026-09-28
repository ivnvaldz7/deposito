import 'dotenv/config'

import { platformDb, Prisma, TipoMovimiento } from '@platform/db'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'
import { z } from 'zod'
import { adjustManagedStock, createManagedLot } from '../routes/ale-bet/product-stock-admin-service'
import { createGoogleSheetsAdapter } from '../routes/ale-bet/stock-projection/google-sheets-adapter'
import { validateSheetConfig } from '../routes/ale-bet/stock-projection/sheet-adapter'
import { buildCurrentStockProjectionSnapshot } from '../routes/ale-bet/stock-projection/snapshot-repository'
import type { StockProjectionSnapshot } from '../routes/ale-bet/stock-projection/snapshot'

const EXPECTED_MANIFEST_SHA256 = '20DDFD897E92C853335B0F435C12B9D4296F403B998D3AEECEAD88BBA9E7E94E'
const MANIFEST_SOURCE_DATABASE = 'platform_prod'
const EXPECTED_DATABASE = process.env.PROD_02_TARGET_DATABASE ?? MANIFEST_SOURCE_DATABASE
const ALLOWED_TARGET_DATABASES = new Set(['platform_prod', 'platform_uat'])
const EXPECTED_CATALOG_PRODUCT_COUNT = 52
const EXPECTED_MANIFEST_PRODUCT_COUNT = 49
const EXPECTED_ROWS = 56
const EXPECTED_ZERO_ROWS = 10
const EXPECTED_TOTALS = { DEPOSITO: 17177, ACONDICIONADO: 15259, GENERAL: 32436 } as const
const IMPORT_ACTOR = 'prod-02b-initial-stock'
const IMPORT_REASON = 'Carga inicial productiva PROD-02B'
const MANIFEST_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/operations/PROD-02B-initial-stock-manifest.json',
)

if (!ALLOWED_TARGET_DATABASES.has(EXPECTED_DATABASE)) {
  throw new Error(`Target PROD-02 no autorizado: ${EXPECTED_DATABASE}`)
}

const ManifestRowSchema = z.object({
  sourceRow: z.string().regex(/^[DA]\d{2}$/),
  productId: z.string().min(1),
  canonicalProductName: z.string().min(1),
  sku: z.string().regex(/^LOG-[0-9A-F]{16}$/),
  lot: z.string().min(1),
  location: z.enum(['DEPOSITO', 'ACONDICIONADO']),
  quantity: z.number().int().nonnegative(),
  unidadesPorCaja: z.number().int().positive(),
  matchType: z.enum(['EXACT', 'NORMALIZED']),
  createActiveZeroLot: z.boolean(),
}).strict()

const ManifestSchema = z.object({
  lineage: z.literal('prod-02b-initial-stock'),
  generatedAt: z.string().datetime(),
  targetDatabase: z.literal(MANIFEST_SOURCE_DATABASE),
  authoritativeSource: z.string().min(1),
  applyStatus: z.literal('NOT_APPLIED'),
  corrections: z.object({
    vitaminB12Lot: z.literal('BB0005'),
    syringeAtpLot: z.literal('EA0116'),
    equineVariant: z.literal('EQUINO'),
    legacyAmino50Presentation: z.literal('AVES'),
  }).strict(),
  summary: z.object({
    sourceRows: z.literal(EXPECTED_ROWS),
    resolvedRows: z.literal(EXPECTED_ROWS),
    notFound: z.literal(0),
    ambiguous: z.literal(0),
    zeroLotRows: z.literal(EXPECTED_ZERO_ROWS),
    depositTotal: z.literal(EXPECTED_TOTALS.DEPOSITO),
    conditionedTotal: z.literal(EXPECTED_TOTALS.ACONDICIONADO),
    generalTotal: z.literal(EXPECTED_TOTALS.GENERAL),
  }).strict(),
  rows: z.array(ManifestRowSchema).length(EXPECTED_ROWS),
}).strict()

const OpeningReferenceSchema = z.object({
  operacion: z.literal('SALDO_APERTURA'),
  anterior: z.literal(0),
  nuevo: z.number().int().positive(),
  motivo: z.literal(IMPORT_REASON),
  fechaEfectiva: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()

type Manifest = z.infer<typeof ManifestSchema>
type ManifestRow = Manifest['rows'][number]
type Tx = Prisma.TransactionClient
type LocationCode = ManifestRow['location']
type Cell = string | number | boolean | null

interface ImportPlan {
  manifestSha256: string
  rows: number
  positiveRows: number
  zeroLotRows: number
  distinctLots: number
  distinctProducts: number
  totals: Record<LocationCode, number> & { GENERAL: number }
}

interface DbCounts {
  Producto: number
  Lote: number
  SaldoStock: number
  MovimientoStock: number
  Pedido: number
  ReservaStock: number
  StockProjectionOutbox: number
}

interface PostcheckResult {
  counts: DbCounts
  distinctLots: number
  zeroLotRows: number
  positiveRows: number
  totals: Record<LocationCode, number> & { GENERAL: number }
  reconciliation: 'PASS'
  duplicates: 'PASS'
  negativeStock: 'PASS'
  movementTypes: 'SALDO_APERTURA_ONLY'
  outboxState: 'PENDING'
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex').toUpperCase()
}

function lotKey(row: Pick<ManifestRow, 'productId' | 'lot'>): string {
  return `${row.productId}\u0000${row.lot}`
}

function balanceKey(row: Pick<ManifestRow, 'productId' | 'lot' | 'location'>): string {
  return `${lotKey(row)}\u0000${row.location}`
}

function idempotencyKey(sourceRow: string): string {
  return `prod-02b:${EXPECTED_MANIFEST_SHA256.toLowerCase()}:${sourceRow}`
}

async function loadManifest(): Promise<{ manifest: Manifest; raw: string; hash: string }> {
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  const hash = sha256(raw)
  invariant(hash === EXPECTED_MANIFEST_SHA256, `SHA-256 del manifiesto inválido: ${hash}`)
  const parsed: unknown = JSON.parse(raw)
  return { manifest: ManifestSchema.parse(parsed), raw, hash }
}

function buildPlan(manifest: Manifest, manifestSha256: string): ImportPlan {
  const sourceRows = new Set<string>()
  const balances = new Set<string>()
  const lots = new Set<string>()
  const products = new Set<string>()
  let positiveRows = 0
  let zeroLotRows = 0
  let deposito = 0
  let acondicionado = 0

  for (const row of manifest.rows) {
    invariant(!sourceRows.has(row.sourceRow), `sourceRow duplicada: ${row.sourceRow}`)
    sourceRows.add(row.sourceRow)
    const currentBalanceKey = balanceKey(row)
    invariant(!balances.has(currentBalanceKey), `Combinación producto/lote/ubicación duplicada: ${row.sourceRow}`)
    balances.add(currentBalanceKey)
    lots.add(lotKey(row))
    products.add(row.productId)

    invariant(row.createActiveZeroLot === (row.quantity === 0), `Flag zero-lot inconsistente: ${row.sourceRow}`)
    if (row.quantity === 0) zeroLotRows += 1
    else positiveRows += 1
    if (row.location === 'DEPOSITO') deposito += row.quantity
    else acondicionado += row.quantity
  }

  invariant(manifest.rows.every((row) => row.lot !== 'BB005'), 'El manifiesto todavía contiene BB005')
  invariant(
    manifest.rows.filter((row) => row.canonicalProductName.startsWith('VITAMINA B12')).every((row) => row.lot === 'BB0005'),
    'La corrección BB0005 no está aplicada a todas las filas VITAMINA B12',
  )
  invariant(
    manifest.rows.filter((row) => row.canonicalProductName === 'JERINGA ATP 35 GR').every((row) => row.lot === 'EA0116'),
    'La corrección EA0116 no está aplicada a todas las filas JERINGA ATP',
  )
  invariant(manifest.rows.every((row) => !row.canonicalProductName.includes('EQUINOS')), 'El manifiesto contiene EQUINOS')
  invariant(products.size === EXPECTED_MANIFEST_PRODUCT_COUNT, `Productos referenciados: ${products.size}; esperados: ${EXPECTED_MANIFEST_PRODUCT_COUNT}`)
  invariant(zeroLotRows === EXPECTED_ZERO_ROWS, `Filas zero-lot: ${zeroLotRows}; esperadas: ${EXPECTED_ZERO_ROWS}`)
  invariant(deposito === EXPECTED_TOTALS.DEPOSITO, `Total DEPOSITO inválido: ${deposito}`)
  invariant(acondicionado === EXPECTED_TOTALS.ACONDICIONADO, `Total ACONDICIONADO inválido: ${acondicionado}`)

  return {
    manifestSha256,
    rows: manifest.rows.length,
    positiveRows,
    zeroLotRows,
    distinctLots: lots.size,
    distinctProducts: products.size,
    totals: { DEPOSITO: deposito, ACONDICIONADO: acondicionado, GENERAL: deposito + acondicionado },
  }
}

async function currentDatabase(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ database: string }>>(Prisma.sql`SELECT current_database() AS database`)
  invariant(rows.length === 1, 'No se pudo determinar la base activa')
  return rows[0]!.database
}

async function readCounts(tx: Tx): Promise<DbCounts> {
  const [Producto, Lote, SaldoStock, MovimientoStock, Pedido, ReservaStock, StockProjectionOutbox] = await Promise.all([
    tx.producto.count(),
    tx.lote.count(),
    tx.saldoStock.count(),
    tx.movimientoStock.count(),
    tx.pedido.count(),
    tx.reservaStock.count(),
    tx.stockProjectionOutbox.count(),
  ])
  return { Producto, Lote, SaldoStock, MovimientoStock, Pedido, ReservaStock, StockProjectionOutbox }
}

async function validateTargetAndCatalog(tx: Tx, manifest: Manifest): Promise<Map<LocationCode, string>> {
  const database = await currentDatabase(tx)
  invariant(database === EXPECTED_DATABASE, `Target DB inválido: ${database}`)

  const [products, locations] = await Promise.all([
    tx.producto.findMany({
      select: { id: true, nombre: true, sku: true, unidadesPorCaja: true, activo: true },
    }),
    tx.ubicacionStock.findMany({
      where: { codigo: { in: ['DEPOSITO', 'ACONDICIONADO'] } },
      select: { id: true, codigo: true, activo: true },
    }),
  ])
  invariant(products.length === EXPECTED_CATALOG_PRODUCT_COUNT, `Producto count inválido: ${products.length}`)
  invariant(products.every((product) => product.activo), 'Existe un producto inactivo')
  invariant(new Set(products.map((product) => product.nombre)).size === EXPECTED_CATALOG_PRODUCT_COUNT, 'Nombres de producto no únicos')
  invariant(new Set(products.map((product) => product.sku)).size === EXPECTED_CATALOG_PRODUCT_COUNT, 'SKU no únicos')

  const productsById = new Map(products.map((product) => [product.id, product]))
  for (const row of manifest.rows) {
    const product = productsById.get(row.productId)
    invariant(Boolean(product), `Product ID no encontrado: ${row.sourceRow}`)
    invariant(product!.nombre === row.canonicalProductName, `Nombre no coincide: ${row.sourceRow}`)
    invariant(product!.sku === row.sku, `SKU no coincide: ${row.sourceRow}`)
    invariant(product!.unidadesPorCaja === row.unidadesPorCaja, `unidadesPorCaja no coincide: ${row.sourceRow}`)
  }

  invariant(locations.length === 2, `Ubicaciones requeridas encontradas: ${locations.length}`)
  const result = new Map<LocationCode, string>()
  for (const code of ['DEPOSITO', 'ACONDICIONADO'] as const) {
    const matches = locations.filter((location) => location.codigo === code)
    invariant(matches.length === 1 && matches[0]!.activo, `Ubicación ${code} ausente o inactiva`)
    result.set(code, matches[0]!.id)
  }
  return result
}

function assertPreloadCounts(counts: DbCounts): void {
  invariant(counts.Producto === EXPECTED_CATALOG_PRODUCT_COUNT, `Producto debe ser ${EXPECTED_CATALOG_PRODUCT_COUNT}`)
  for (const key of ['Lote', 'SaldoStock', 'MovimientoStock', 'Pedido', 'ReservaStock', 'StockProjectionOutbox'] as const) {
    invariant(counts[key] === 0, `${key} debe ser 0 y es ${counts[key]}`)
  }
}

async function dryRun(tx: Tx, manifest: Manifest, plan: ImportPlan): Promise<{ database: string; counts: DbCounts; plan: ImportPlan }> {
  await validateTargetAndCatalog(tx, manifest)
  const counts = await readCounts(tx)
  assertPreloadCounts(counts)
  return { database: await currentDatabase(tx), counts, plan }
}

async function verifyPostconditions(tx: Tx, manifest: Manifest, plan: ImportPlan): Promise<PostcheckResult> {
  const locations = await validateTargetAndCatalog(tx, manifest)
  const counts = await readCounts(tx)
  invariant(counts.Producto === EXPECTED_CATALOG_PRODUCT_COUNT, `Producto count post-import inválido: ${counts.Producto}`)
  invariant(counts.Lote === plan.distinctLots, `Lote count inválido: ${counts.Lote}`)
  invariant(counts.SaldoStock === plan.positiveRows, `SaldoStock count inválido: ${counts.SaldoStock}`)
  invariant(counts.MovimientoStock === plan.positiveRows, `MovimientoStock count inválido: ${counts.MovimientoStock}`)
  invariant(counts.StockProjectionOutbox === plan.positiveRows, `Outbox count inválido: ${counts.StockProjectionOutbox}`)
  invariant(counts.Pedido === 0, `Pedido count inválido: ${counts.Pedido}`)
  invariant(counts.ReservaStock === 0, `ReservaStock count inválido: ${counts.ReservaStock}`)

  const [lots, balances, movements, outbox] = await Promise.all([
    tx.lote.findMany({ select: { id: true, productoId: true, numero: true, activo: true, cajas: true, sueltos: true } }),
    tx.saldoStock.findMany({ select: { productoId: true, loteId: true, ubicacionId: true, cantidad: true } }),
    tx.movimientoStock.findMany({
      select: { productoId: true, loteId: true, cantidad: true, tipo: true, origenUbicacionId: true, destinoUbicacionId: true, idempotencyKey: true, usuarioId: true, referencia: true },
    }),
    tx.stockProjectionOutbox.findMany({ select: { productId: true, causeType: true, causeId: true, estado: true, attempts: true, lastError: true } }),
  ])

  invariant(lots.every((lot) => lot.activo && lot.cajas === 0 && lot.sueltos === 0), 'Lote inactivo o con stock legacy')
  const lotsByKey = new Map(lots.map((lot) => [`${lot.productoId}\u0000${lot.numero}`, lot]))
  invariant(lotsByKey.size === lots.length, 'Lotes duplicados por producto/número')
  const balancesByKey = new Map<string, number>()
  for (const balance of balances) {
    invariant(balance.cantidad >= 0, 'Se detectó stock negativo')
    const lot = lots.find((candidate) => candidate.id === balance.loteId)
    invariant(Boolean(lot), `Saldo referencia lote inexistente: ${balance.loteId}`)
    const code = balance.ubicacionId === locations.get('DEPOSITO') ? 'DEPOSITO'
      : balance.ubicacionId === locations.get('ACONDICIONADO') ? 'ACONDICIONADO' : null
    invariant(code !== null, `Saldo en ubicación no aprobada: ${balance.ubicacionId}`)
    const key = `${balance.productoId}\u0000${lot!.numero}\u0000${code}`
    invariant(!balancesByKey.has(key), `Saldo duplicado: ${key}`)
    balancesByKey.set(key, balance.cantidad)
  }

  for (const row of manifest.rows) {
    const lot = lotsByKey.get(lotKey(row))
    invariant(Boolean(lot), `Lote faltante: ${row.sourceRow}`)
    const actual = balancesByKey.get(balanceKey(row))
    if (row.quantity === 0) invariant(actual === undefined, `Zero-lot creó saldo artificial: ${row.sourceRow}`)
    else invariant(actual === row.quantity, `Saldo no coincide: ${row.sourceRow}`)
  }
  invariant(balancesByKey.size === plan.positiveRows, 'Existen saldos adicionales al manifiesto')

  const positiveByIdempotency = new Map(
    manifest.rows.filter((row) => row.quantity > 0).map((row) => [idempotencyKey(row.sourceRow), row]),
  )
  invariant(new Set(movements.map((movement) => movement.idempotencyKey)).size === movements.length, 'Movimientos con idempotencia duplicada')
  for (const movement of movements) {
    invariant(movement.tipo === TipoMovimiento.SALDO_APERTURA, 'Existe un movimiento que no es SALDO_APERTURA')
    invariant(movement.cantidad > 0, 'Existe movimiento de apertura no positivo')
    invariant(movement.destinoUbicacionId === null, 'Movimiento de apertura con destino inesperado')
    invariant(movement.usuarioId === IMPORT_ACTOR, 'Movimiento de apertura con actor incorrecto')
    invariant(Boolean(movement.referencia), 'Movimiento de apertura sin referencia')
    invariant(Boolean(movement.idempotencyKey), 'Movimiento sin idempotencyKey')
    const row = positiveByIdempotency.get(movement.idempotencyKey!)
    invariant(Boolean(row), `Movimiento ajeno al manifiesto: ${movement.idempotencyKey}`)
    const parsedReference: unknown = JSON.parse(movement.referencia!)
    const reference = OpeningReferenceSchema.parse(parsedReference)
    invariant(reference.nuevo === row!.quantity, `Referencia de movimiento no coincide: ${row!.sourceRow}`)
    invariant(reference.fechaEfectiva === manifest.generatedAt.slice(0, 10), `Fecha efectiva no coincide: ${row!.sourceRow}`)
    const lot = lotsByKey.get(lotKey(row!))
    invariant(
      movement.productoId === row!.productId && movement.loteId === lot!.id &&
      movement.origenUbicacionId === locations.get(row!.location) && movement.cantidad === row!.quantity,
      `Movimiento no coincide: ${row!.sourceRow}`,
    )
  }

  for (const event of outbox) {
    const row = positiveByIdempotency.get(event.causeId)
    invariant(Boolean(row), `Outbox ajeno al manifiesto: ${event.causeId}`)
    invariant(event.productId === row!.productId, `Outbox con producto incorrecto: ${row!.sourceRow}`)
    invariant(event.causeType === 'SALDO_APERTURA', `Outbox con causeType incorrecto: ${event.causeType}`)
    invariant(event.estado === 'PENDING' && event.attempts === 0 && event.lastError === null, 'Outbox no está pendiente y limpio')
  }

  const totals = { DEPOSITO: 0, ACONDICIONADO: 0, GENERAL: 0 }
  for (const row of manifest.rows) {
    totals[row.location] += balancesByKey.get(balanceKey(row)) ?? 0
  }
  totals.GENERAL = totals.DEPOSITO + totals.ACONDICIONADO
  invariant(totals.DEPOSITO === EXPECTED_TOTALS.DEPOSITO, `Total DB DEPOSITO inválido: ${totals.DEPOSITO}`)
  invariant(totals.ACONDICIONADO === EXPECTED_TOTALS.ACONDICIONADO, `Total DB ACONDICIONADO inválido: ${totals.ACONDICIONADO}`)
  invariant(totals.GENERAL === EXPECTED_TOTALS.GENERAL, `Total DB general inválido: ${totals.GENERAL}`)

  return {
    counts,
    distinctLots: lots.length,
    zeroLotRows: plan.zeroLotRows,
    positiveRows: plan.positiveRows,
    totals,
    reconciliation: 'PASS',
    duplicates: 'PASS',
    negativeStock: 'PASS',
    movementTypes: 'SALDO_APERTURA_ONLY',
    outboxState: 'PENDING',
  }
}

async function applyImport(manifest: Manifest, plan: ImportPlan): Promise<PostcheckResult> {
  return platformDb.$transaction(async (tx) => {
    const locations = await validateTargetAndCatalog(tx, manifest)
    assertPreloadCounts(await readCounts(tx))

    const lotRows = [...new Map(manifest.rows.map((row) => [lotKey(row), row])).values()]
      .sort((left, right) => lotKey(left).localeCompare(lotKey(right)))
    const lotsByKey = new Map<string, string>()
    for (const row of lotRows) {
      const lot = await createManagedLot(tx, { productoId: row.productId, numero: row.lot })
      lotsByKey.set(lotKey(row), lot.id)
    }

    const effectiveDate = manifest.generatedAt.slice(0, 10)
    const positiveRows = manifest.rows.filter((row) => row.quantity > 0)
      .sort((left, right) => left.sourceRow.localeCompare(right.sourceRow))
    for (const row of positiveRows) {
      const loteId = lotsByKey.get(lotKey(row))
      const ubicacionId = locations.get(row.location)
      invariant(Boolean(loteId) && Boolean(ubicacionId), `Plan incompleto: ${row.sourceRow}`)
      const result = await adjustManagedStock(tx, {
        productoId: row.productId,
        loteId: loteId!,
        ubicacionId: ubicacionId!,
        cantidadFinal: row.quantity,
        actorId: IMPORT_ACTOR,
        motivo: IMPORT_REASON,
        fechaEfectiva: effectiveDate,
        idempotencyKey: idempotencyKey(row.sourceRow),
        tipoMovimiento: TipoMovimiento.SALDO_APERTURA,
      })
      invariant(result.anterior === 0 && result.delta === row.quantity && Boolean(result.movimiento), `Apertura inválida: ${row.sourceRow}`)
    }

    return verifyPostconditions(tx, manifest, plan)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 120_000 })
}

function validateSnapshot(snapshot: StockProjectionSnapshot, manifest: Manifest): { productoTerminado: number; sinAcondicionar: number; general: number; rows: { productoTerminado: number; sinAcondicionar: number } } {
  const productoTerminado = snapshot.productoTerminado.reduce((sum, row) => sum + row.total, 0)
  const sinAcondicionar = snapshot.sinAcondicionar.reduce((sum, row) => sum + row.total, 0)
  invariant(productoTerminado === EXPECTED_TOTALS.DEPOSITO, `Snapshot PRODUCTO TERMINADO inválido: ${productoTerminado}`)
  invariant(sinAcondicionar === EXPECTED_TOTALS.ACONDICIONADO, `Snapshot SIN ACONDICIONAR inválido: ${sinAcondicionar}`)
  invariant([...snapshot.productoTerminado, ...snapshot.sinAcondicionar].every((row) => Number.isSafeInteger(row.total) && row.total >= 0), 'Snapshot con cantidad inválida')

  const expectedPositive = new Set(manifest.rows.filter((row) => row.quantity > 0).map((row) => `${row.location}\u0000${row.canonicalProductName}\u0000${row.lot}\u0000${row.quantity}`))
  const actualPositive = new Set([
    ...snapshot.productoTerminado.filter((row) => row.total > 0).map((row) => `DEPOSITO\u0000${row.producto}\u0000${row.lote}\u0000${row.total}`),
    ...snapshot.sinAcondicionar.filter((row) => row.total > 0).map((row) => `ACONDICIONADO\u0000${row.producto}\u0000${row.lote}\u0000${row.total}`),
  ])
  invariant(expectedPositive.size === actualPositive.size && [...expectedPositive].every((key) => actualPositive.has(key)), 'Snapshot positivo no coincide con el manifiesto')

  return {
    productoTerminado,
    sinAcondicionar,
    general: productoTerminado + sinAcondicionar,
    rows: { productoTerminado: snapshot.productoTerminado.length, sinAcondicionar: snapshot.sinAcondicionar.length },
  }
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`
}

function normalizeRows(rows: Cell[][] | null | undefined): Cell[][] {
  return (rows ?? []).map((row) => {
    const result = [...row]
    while (result.length > 0 && (result.at(-1) === '' || result.at(-1) === null)) result.pop()
    return result
  })
}

function expectedSheetRows(title: string, rows: StockProjectionSnapshot['productoTerminado']): Cell[][] {
  return [[title], ['PRODUCTO', 'LOTE', 'TOTAL'], ...rows.map((row) => [row.producto, row.lote, row.total])]
}

async function syncGoogle(snapshot: StockProjectionSnapshot, manifest: Manifest): Promise<{ sheet: 'STOCK APP'; reconciliation: 'PASS'; contentFingerprint: string; writeAttempts: number }> {
  const config = validateSheetConfig(process.env)
  invariant(config.enabled && Boolean(config.spreadsheetId) && Boolean(config.sheetName) && Boolean(config.serviceAccountFile), 'Configuración Google incompleta o deshabilitada')
  invariant(config.sheetName === 'STOCK APP', `Solapa Google no autorizada: ${config.sheetName}`)

  const credentialPath = isAbsolute(config.serviceAccountFile!) ? config.serviceAccountFile! : resolve(process.cwd(), config.serviceAccountFile!)
  const auth = new google.auth.GoogleAuth({ keyFile: credentialPath, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth })
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId!, fields: 'sheets.properties(sheetId,title,gridProperties)' })
  invariant(metadata.data.sheets?.some((sheet) => sheet.properties?.title === 'STOCK APP') ?? false, 'La solapa STOCK APP no existe')
  const quoted = quoteSheetName('STOCK APP')
  await sheets.spreadsheets.values.batchGet({
    spreadsheetId: config.spreadsheetId!,
    ranges: [`${quoted}!A1:C2`, `${quoted}!E1:G2`],
    valueRenderOption: 'UNFORMATTED_VALUE',
  })

  const leftEnd = Math.max(2, snapshot.productoTerminado.length + 2)
  const rightEnd = Math.max(2, snapshot.sinAcondicionar.length + 2)
  const expectedLeft = expectedSheetRows('PRODUCTO TERMINADO', snapshot.productoTerminado)
  const expectedRight = expectedSheetRows('SIN ACONDICIONAR', snapshot.sinAcondicionar)
  const adapter = createGoogleSheetsAdapter({ ...config, serviceAccountFile: credentialPath })
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await adapter.writeSnapshot(snapshot)
      const readback = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: config.spreadsheetId!,
        ranges: [`${quoted}!A1:C${leftEnd}`, `${quoted}!E1:G${rightEnd}`],
        valueRenderOption: 'UNFORMATTED_VALUE',
      })
      const actualLeft = normalizeRows(readback.data.valueRanges?.[0]?.values)
      const actualRight = normalizeRows(readback.data.valueRanges?.[1]?.values)
      invariant(JSON.stringify(actualLeft) === JSON.stringify(expectedLeft), 'Google PRODUCTO TERMINADO no coincide con el snapshot')
      invariant(JSON.stringify(actualRight) === JSON.stringify(expectedRight), 'Google SIN ACONDICIONAR no coincide con el snapshot')
      invariant([...actualLeft.slice(2), ...actualRight.slice(2)].every((row) => typeof row[2] === 'number'), 'Google devolvió totales no numéricos')

      const currentSnapshot = await buildCurrentStockProjectionSnapshot(platformDb)
      validateSnapshot(currentSnapshot, manifest)
      invariant(JSON.stringify(currentSnapshot) === JSON.stringify(snapshot), 'PostgreSQL cambió durante la sincronización Google')
      return {
        sheet: 'STOCK APP',
        reconciliation: 'PASS',
        contentFingerprint: sha256(JSON.stringify([actualLeft, actualRight])).slice(0, 16),
        writeAttempts: attempt,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Fallo no identificable durante la escritura Google')
    }
  }
  throw lastError ?? new Error('No se pudo reconciliar Google')
}

async function withReadTransaction<T>(action: (tx: Tx) => Promise<T>): Promise<T> {
  return platformDb.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 60_000 })
}

async function main(): Promise<void> {
  try {
    const { manifest, hash } = await loadManifest()
    const plan = buildPlan(manifest, hash)
    const mode = process.argv[2] ?? '--dry-run'
    invariant(['--dry-run', '--apply', '--verify', '--google-sync'].includes(mode), `Modo no permitido: ${mode}`)

    if (mode === '--dry-run') {
      const result = await withReadTransaction((tx) => dryRun(tx, manifest, plan))
      console.log(`DRY_RUN PASS ${JSON.stringify(result)}`)
      return
    }

    if (mode === '--apply') {
      const result = await applyImport(manifest, plan)
      console.log(`APPLY PASS ${JSON.stringify({ database: EXPECTED_DATABASE, plan, postcheck: result })}`)
      return
    }

    const postcheck = await withReadTransaction((tx) => verifyPostconditions(tx, manifest, plan))
    const snapshot = await buildCurrentStockProjectionSnapshot(platformDb)
    const snapshotTotals = validateSnapshot(snapshot, manifest)
    if (mode === '--verify') {
      console.log(`VERIFY PASS ${JSON.stringify({ database: EXPECTED_DATABASE, plan, postcheck, snapshot: snapshotTotals })}`)
      return
    }

    const googleResult = await syncGoogle(snapshot, manifest)
    console.log(`GOOGLE_SYNC PASS ${JSON.stringify({ database: EXPECTED_DATABASE, postcheck, snapshot: snapshotTotals, google: googleResult })}`)
  } finally {
    await platformDb.$disconnect()
  }
}

void main().catch((error: object) => {
  console.error(`PROD-02B FAIL: ${error instanceof Error ? error.message : 'Error no identificable'}`)
  process.exitCode = 1
})
