import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@platform/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APPROVED_DRUG_NAMES, CatalogoInicialDrogasService } from '../../deposito/services/catalogo-inicial-drogas-service'
import { addDrugLotInventory, DrugLotConflictError } from '../../deposito/services/droga-inventory-service'

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const migrationNames = [
  '20260721160000_init_platform', '20260721164308_add_estado_and_is_platform_admin',
  '20260726163214_pr_b3a_idempotency', '20260727125700_inventory_constraints_metadata',
  '20260727125701_inventory_constraints_validate', '20260730111000_mvp01_expand_catalogo',
  '20260730111100_mvp01_migrate_catalogo', '20260730152750_mvp01_correct_codigo_rules',
  '20260811101500_deposito_initial_estuches_import', '20260824140000_centralize_deposito_stock_minimo', '20260812120000_deposito_producto_market_identity',
  '20260812143000_enforce_estuche_canonical_market', '20260812160000_add_etiqueta_catalog_sequence',
  '20260813102000_add_export_etiqueta_catalog_sequences', '20260813102500_sync_export_etiqueta_catalog_sequences',
  '20260813130000_add_frasco_catalog_sequence', '20260813133000_preserve_legacy_frasco_identity',
  '20260813170000_add_inventario_droga_created_at',
]

let admin: Client
let databaseName = ''
let db: PrismaClient
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`

describe('initial drug catalog physical PostgreSQL contract', () => {
  beforeAll(async () => {
    const testUrl = process.env.PLATFORM_DATABASE_URL
    if (!testUrl) throw new Error('PLATFORM_DATABASE_URL de integración no está configurada')
    databaseName = `drug_catalog_${process.pid}_${Date.now()}_test`
    const adminUrl = new URL(testUrl); adminUrl.pathname = '/postgres'
    admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect()
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    const databaseUrl = new URL(testUrl); databaseUrl.pathname = `/${databaseName}`
    const migrationClient = new Client({ connectionString: databaseUrl.toString() }); await migrationClient.connect()
    try {
      for (const name of migrationNames) await migrationClient.query(await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'))
    } finally { await migrationClient.end() }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.toString() }) })
  }, 30000)

  afterAll(async () => {
    await db?.$disconnect(); await admin?.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`); await admin?.end()
  })

  it('adds created_at and persists exactly 55 catalog-only drugs with idempotent replay', async () => {
    const columns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'deposito' AND table_name = 'inventario_drogas' AND column_name = 'created_at'
    `
    expect(columns.map((row) => row.column_name)).toEqual(['created_at'])

    const before = { lots: await db.inventarioDroga.count(), movements: await db.movimiento.count(), acts: await db.acta.count() }
    const service = new CatalogoInicialDrogasService(db)
    expect(await service.apply()).toEqual({ created: 55, total: 55, replay: false })
    expect(await service.apply()).toEqual({ created: 0, total: 55, replay: true })

    const products = await db.depositoProducto.findMany({ where: { categoria: 'droga' }, orderBy: { nombreCompleto: 'asc' } })
    expect(products).toHaveLength(55)
    expect(products.map((product) => product.nombreCompleto).sort()).toEqual([...APPROVED_DRUG_NAMES].sort())
    expect(products.every((product) => product.estado === 'ACTIVO' && product.activo && product.codigo === null && product.mercado === null && product.mercadosHabilitados.length === 0)).toBe(true)
    expect({ lots: await db.inventarioDroga.count(), movements: await db.movimiento.count(), acts: await db.acta.count() }).toEqual(before)
  }, 15000)

  it('serializes concurrent same-lot receipts, sums stock, and rejects expiry conflicts', async () => {
    await new CatalogoInicialDrogasService(db).apply()
    const product = await db.depositoProducto.findFirstOrThrow({ where: { nombreCompleto: 'ATP', categoria: 'droga' } })
    const vencimiento = new Date('2028-10-15T00:00:00.000Z')
    await Promise.all([
      db.$transaction((tx) => addDrugLotInventory(tx, { productoId: product.id, nombre: product.nombreCompleto, lote: 'A23', vencimiento, cantidad: 500 })),
      db.$transaction((tx) => addDrugLotInventory(tx, { productoId: product.id, nombre: product.nombreCompleto, lote: 'A23', vencimiento, cantidad: 750 })),
    ])
    const lots = await db.inventarioDroga.findMany({ where: { productoId: product.id } })
    expect(lots).toHaveLength(1)
    expect(lots[0]?.cantidad).toBe(1250)
    await expect(db.$transaction((tx) => addDrugLotInventory(tx, {
      productoId: product.id,
      nombre: product.nombreCompleto,
      lote: 'A23',
      vencimiento: new Date('2029-10-15T00:00:00.000Z'),
      cantidad: 1,
    }))).rejects.toBeInstanceOf(DrugLotConflictError)
  }, 15000)
})
