import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@platform/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyInitialLogisticsLoad, buildTechnicalSku, LOGISTICA_INITIAL_ROWS, LogisticsLoadConflict, preflightInitialLogisticsLoad } from '../../routes/ale-bet/logistica-initial-load-service'

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const catalogReconciliationMigration = '20261001160000_reconcile_alebet_product_catalog'
const catalogReconciliationFixture = resolve(process.cwd(), '../../../packages/db/scripts/catalog-reconciliation-test-fixture.sql')
let admin: Client
let databaseName = ''
let db: PrismaClient
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

describe('initial logistics load physical PostgreSQL contract', () => {
  beforeAll(async () => {
    const testUrl = process.env.PLATFORM_DATABASE_URL
    if (!testUrl) throw new Error('PLATFORM_DATABASE_URL de integración no está configurada')
    databaseName = `logistics_${process.pid}_${Date.now()}_test`
    const adminUrl = new URL(testUrl); adminUrl.pathname = '/postgres'
    admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect()
    await admin.query(`CREATE DATABASE ${quote(databaseName)}`)
    const url = new URL(testUrl); url.pathname = `/${databaseName}`
    const migrationClient = new Client({ connectionString: url.toString() }); await migrationClient.connect()
    try {
      const names = (await readdir(migrationsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
      for (const name of names) {
        if (name === catalogReconciliationMigration) await migrationClient.query(await readFile(catalogReconciliationFixture, 'utf8'))
        await migrationClient.query(await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'))
      }
    } finally { await migrationClient.end() }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  }, 30000)

  afterAll(async () => {
    await db?.$disconnect(); await admin?.query(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`); await admin?.end()
  })

  it('applies and replays without touching demo rows or creating movements', async () => {
    const demo = await db.producto.create({ data: { nombre: 'DEMO EXISTENTE', sku: 'DEMO-001', unidadesPorCaja: 6 } })
    expect(await preflightInitialLogisticsLoad(db)).toMatchObject({ newProducts: 43, newLots: 38, conflicts: [] })
    expect(await applyInitialLogisticsLoad(db)).toEqual({ productsCreated: 43, lotsCreated: 38, totalStock: 17014 })
    expect(await applyInitialLogisticsLoad(db)).toEqual({ productsCreated: 0, lotsCreated: 0, totalStock: 17014 })
    expect(await db.producto.findUnique({ where: { id: demo.id } })).toMatchObject({ nombre: 'DEMO EXISTENTE', sku: 'DEMO-001' })
    const products = await db.producto.findMany({ where: { nombre: { in: [...new Set(LOGISTICA_INITIAL_ROWS.map((row) => row.product))] } }, include: { lotes: true } })
    expect(products).toHaveLength(43)
    expect(products.flatMap((product) => product.lotes)).toHaveLength(38)
    expect(products.flatMap((product) => product.lotes).every((lot) => lot.fechaProduccion === null && lot.fechaVencimiento === null)).toBe(true)
    expect(await db.movimientoStock.count({ where: { productoId: { in: products.map((product) => product.id) } } })).toBe(0)
    expect(products.reduce((sum, product) => sum + product.lotes.reduce((inner, lot) => inner + lot.cajas * product.unidadesPorCaja + lot.sueltos, 0), 0)).toBe(17014)
  }, 15000)

  it('detects divergence and rolls the whole replay back', async () => {
    const product = await db.producto.findFirstOrThrow({ where: { nombre: 'AMANTINA 250 ML' } })
    await db.producto.update({ where: { id: product.id }, data: { unidadesPorCaja: 99 } })
    const before = { products: await db.producto.count(), lots: await db.lote.count() }
    await expect(applyInitialLogisticsLoad(db)).rejects.toBeInstanceOf(LogisticsLoadConflict)
    expect({ products: await db.producto.count(), lots: await db.lote.count() }).toEqual(before)
    await db.producto.update({ where: { id: product.id }, data: { unidadesPorCaja: 15 } })
    expect(buildTechnicalSku(product.nombre)).toMatch(/^LOG-/)
  })
})
