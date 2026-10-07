import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@platform/db'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: null as PrismaClient | null }))
vi.mock('../../deposito/lib/prisma', () => ({ get prisma() { return state.db } }))
vi.mock('../../deposito/middleware/auth', () => ({ authenticate: (req: any, _res: any, next: any) => {
  req.user = { sub: '00000000-0000-4000-8000-000000000001', apps: { deposito: { rol: 'encargado', activo: true } } }
  req.depositoUser = { id: '00000000-0000-4000-8000-000000000001', role: 'encargado' }
  next()
} }))
vi.mock('../../deposito/middleware/require-role', () => ({ requireRole: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../../deposito/lib/sse-manager', () => ({ sseManager: { broadcastGlobal: vi.fn() } }))
vi.mock('@platform/core', () => ({ eventBus: { emit: vi.fn() }, hasPermission: () => true }))

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const migrations = [
  '20260721160000_init_platform', '20260721164308_add_estado_and_is_platform_admin', '20260726163214_pr_b3a_idempotency',
  '20260727125700_inventory_constraints_metadata', '20260727125701_inventory_constraints_validate', '20260730111000_mvp01_expand_catalogo',
  '20260730111100_mvp01_migrate_catalogo', '20260730152750_mvp01_correct_codigo_rules', '20260811101500_deposito_initial_estuches_import',
  '20260824140000_centralize_deposito_stock_minimo',
  '20260812120000_deposito_producto_market_identity', '20260812143000_enforce_estuche_canonical_market', '20260812160000_add_etiqueta_catalog_sequence',
  '20260813102000_add_export_etiqueta_catalog_sequences', '20260813102500_sync_export_etiqueta_catalog_sequences', '20260813130000_add_frasco_catalog_sequence',
  '20260813133000_preserve_legacy_frasco_identity', '20260813170000_add_inventario_droga_created_at',
]

let admin: Client
let databaseName = ''
let db: PrismaClient
let app: express.Express
const userId = '00000000-0000-4000-8000-000000000001'
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

describe('ingress expiry month HTTP + PostgreSQL', () => {
  beforeAll(async () => {
    const testUrl = process.env.PLATFORM_DATABASE_URL
    if (!testUrl) throw new Error('PLATFORM_DATABASE_URL de integración no está configurada')
    databaseName = `ingress_month_${process.pid}_${Date.now()}_test`
    const adminUrl = new URL(testUrl); adminUrl.pathname = '/postgres'
    admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect()
    await admin.query(`CREATE DATABASE ${quote(databaseName)}`)
    const url = new URL(testUrl); url.pathname = `/${databaseName}`
    const migrationClient = new Client({ connectionString: url.toString() }); await migrationClient.connect()
    try { for (const name of migrations) await migrationClient.query(await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8')) } finally { await migrationClient.end() }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) }); state.db = db
    await db.user.create({ data: { id: userId, email: 'ingress@test.local', passwordHash: 'test', name: 'Test', role: 'encargado' } })
    const router = (await import('../../deposito/routes/ingresos')).default
    app = express(); app.use(express.json()); app.use('/api/deposito/ingresos', router)
  }, 30000)

  afterAll(async () => { await db?.$disconnect(); await admin?.query(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`); await admin?.end() })

  it('rejects the old impossible full-date payload without side effects', async () => {
    const product = await db.depositoProducto.create({ data: { nombreBase: 'ATP', nombreCompleto: 'ATP', categoria: 'droga', estado: 'ACTIVO' } })
    const before = { actas: await db.acta.count(), items: await db.actaItem.count(), movements: await db.movimiento.count(), lots: await db.inventarioDroga.count() }
    const response = await request(app).post('/api/deposito/ingresos').send({ fecha: '2026-08-13', productoId: product.id, lote: 'BAD', vencimientoMes: '2027-02-31', cantidad: 1 })
    expect(response.status).toBe(400)
    expect({ actas: await db.acta.count(), items: await db.actaItem.count(), movements: await db.movimiento.count(), lots: await db.inventarioDroga.count() }).toEqual(before)
  })

  it('persists the new contract at UTC month end through the real endpoint', async () => {
    const product = await db.depositoProducto.create({ data: { nombreBase: 'EDTA', nombreCompleto: 'EDTA', categoria: 'droga', estado: 'ACTIVO' } })
    const response = await request(app).post('/api/deposito/ingresos').send({ fecha: '2026-08-13', productoId: product.id, lote: 'OK', vencimientoMes: '2028-02', cantidad: 2 })
    expect(response.status).toBe(201)
    const lot = await db.inventarioDroga.findUniqueOrThrow({ where: { productoId_lote: { productoId: product.id, lote: 'OK' } } })
    expect(lot.vencimiento).toEqual(new Date('2028-02-29T00:00:00.000Z'))
  })
})
