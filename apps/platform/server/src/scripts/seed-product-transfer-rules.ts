import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformDb } from '@platform/db'
import {
  PRODUCT_TRANSFER_CATALOG_IDENTITIES,
  initializeProductTransferRules,
  type CatalogIdentity,
} from './product-transfer-rule-seed-service'

type ManifestRow = { productId: string; canonicalProductName: string; sku: string }
type Manifest = { targetDatabase: string; rows: ManifestRow[] }
const MANIFEST_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/operations/PROD-02B-initial-stock-manifest.json')
const TARGET_DATABASE = process.env.PROD_02_TARGET_DATABASE ?? 'platform_prod'
const ALLOWED_TARGET_DATABASES = new Set(['platform_prod', 'platform_uat'])

if (!ALLOWED_TARGET_DATABASES.has(TARGET_DATABASE)) {
  throw new Error(`Target de reglas no autorizado: ${TARGET_DATABASE}`)
}

const PATCH_IDENTITIES = new Set([
  'cprodaminobase50ml0000001',
  'cprodaminol1equino0000001',
  'cprodaminol1cerdos0000001',
])

function assertManifestIdentity(catalog: Map<string, ManifestRow>, expected: CatalogIdentity): void {
  if (PATCH_IDENTITIES.has(expected.id)) return
  const actual = catalog.get(expected.nombre)
  if (!actual || actual.productId !== expected.id || actual.sku !== expected.sku) {
    throw new Error(`El manifiesto PROD-02B no coincide exactamente: ${expected.id} (${expected.nombre})`)
  }
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest
  if (manifest.targetDatabase !== 'platform_prod') throw new Error('El manifiesto no es la precarga productiva esperada')
  const catalog = new Map<string, ManifestRow>()
  for (const row of manifest.rows) {
    const prior = catalog.get(row.canonicalProductName)
    if (prior && (prior.productId !== row.productId || prior.sku !== row.sku)) throw new Error(`Identidad ambigua en manifiesto: ${row.canonicalProductName}`)
    catalog.set(row.canonicalProductName, row)
  }

  for (const expected of PRODUCT_TRANSFER_CATALOG_IDENTITIES) assertManifestIdentity(catalog, expected)

  const result = await platformDb.$transaction(async (tx) => {
    const [{ database }] = await tx.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
    if (database !== TARGET_DATABASE) throw new Error(`Target rechazado: ${database}`)
    const upserted = await initializeProductTransferRules(tx)
    return { upserted, blocked: [] }
  })
  console.log(JSON.stringify(result, null, 2))
}

void main().finally(async () => platformDb.$disconnect())
