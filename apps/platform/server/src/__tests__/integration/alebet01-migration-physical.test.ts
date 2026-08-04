import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const baseMigrationNames = [
  '20260721160000_init_platform',
  '20260721164308_add_estado_and_is_platform_admin',
  '20260726163214_pr_b3a_idempotency',
  '20260727125700_inventory_constraints_metadata',
  '20260727125701_inventory_constraints_validate',
  '20260730111000_mvp01_expand_catalogo',
  '20260730111100_mvp01_migrate_catalogo',
  '20260730152750_mvp01_correct_codigo_rules',
]
const operationalMigrationNames = [
  '20260803104500_alebet01_expand_operational_orders',
  '20260803113000_alebet01_preserve_released_reservations',
  '20260803130000_alebet01_reconcile_local_drift',
  '20260804103000_alebet_dynamic_units_per_box',
]

let admin: Client | undefined
let clean: Client | undefined
let blocked: Client | undefined
const databases: string[] = []

function dbName(suffix: string): string { return `alebet01_${process.pid}_${Date.now()}_${suffix}` }
function quote(value: string): string { return `"${value.replace(/"/g, '""')}"` }

async function apply(client: Client, name: string): Promise<void> {
  await client.query(await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'))
}

async function disposable(url: string, suffix: string): Promise<Client> {
  if (!admin) throw new Error('Admin client unavailable')
  const name = dbName(suffix)
  databases.push(name)
  await admin.query(`CREATE DATABASE ${quote(name)}`)
  const target = new URL(url)
  target.pathname = `/${name}`
  const client = new Client({ connectionString: target.toString() })
  await client.connect()
  return client
}

describe('ALEBET-01 physical rollout', () => {
  beforeAll(async () => {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL de integración no está configurada')
    const root = new URL(url); root.pathname = '/postgres'
    admin = new Client({ connectionString: root.toString() }); await admin.connect()
    clean = await disposable(url, 'clean')
    for (const migration of [...baseMigrationNames, ...operationalMigrationNames]) await apply(clean, migration)
    blocked = await disposable(url, 'legacy_guard')
    for (const migration of baseMigrationNames) await apply(blocked, migration)
    await blocked.query(`
      INSERT INTO "ale_bet"."Cliente" ("id", "nombre") VALUES ('legacy-client', 'Legacy client');
      INSERT INTO "ale_bet"."Pedido" ("id", "numero", "clienteId", "vendedorId", "estado", "updatedAt")
      VALUES ('legacy-approved', 'LEGACY-1', 'legacy-client', 'seller-1', 'APROBADO', CURRENT_TIMESTAMP);
    `)
  }, 30000)

  afterAll(async () => {
    await Promise.all([clean?.end(), blocked?.end()])
    if (admin) for (const database of databases) await admin.query(`DROP DATABASE IF EXISTS ${quote(database)}`)
    await admin?.end()
  })

  it('creates additive reservation, audit, remito and transport tables with final states', async () => {
    if (!clean) throw new Error('Clean client unavailable')
    const states = await clean.query<{ enumlabel: string }>(`
      SELECT enumlabel FROM pg_enum WHERE enumtypid = 'ale_bet."EstadoPedido"'::regtype ORDER BY enumsortorder
    `)
    expect(states.rows.map((row) => row.enumlabel)).toEqual(['BORRADOR', 'APROBADO', 'EN_ARMADO', 'PREPARADO', 'DESPACHADO', 'CANCELADO'])
    const tables = await clean.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'ale_bet' AND table_name IN ('ReservaStock', 'PedidoAuditoria', 'Remito', 'Transportista')
      ORDER BY table_name
    `)
    expect(tables.rows.map((row) => row.table_name)).toEqual(['PedidoAuditoria', 'Remito', 'ReservaStock', 'Transportista'])

    const updatedAtDefaults = await clean.query<{ table_name: string, column_default: string | null }>(`
      SELECT table_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'ale_bet'
        AND table_name IN ('Cliente', 'Transportista')
        AND column_name = 'updatedAt'
      ORDER BY table_name
    `)
    expect(updatedAtDefaults.rows).toEqual([
      { table_name: 'Cliente', column_default: null },
      { table_name: 'Transportista', column_default: null },
    ])

    const remitoTransportistaForeignKey = await clean.query<{ confdeltype: string, confupdtype: string }>(`
      SELECT constraint_entry.confdeltype, constraint_entry.confupdtype
      FROM pg_constraint AS constraint_entry
      WHERE constraint_entry.conname = 'Remito_transportistaId_fkey'
        AND constraint_entry.conrelid = 'ale_bet."Remito"'::regclass
    `)
    expect(remitoTransportistaForeignKey.rows).toEqual([{ confdeltype: 'n', confupdtype: 'c' }])

    const unitsColumn = await clean.query<{ is_nullable: string }>(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'ale_bet' AND table_name = 'Producto' AND column_name = 'unidadesPorCaja'
    `)
    expect(unitsColumn.rows).toEqual([{ is_nullable: 'NO' }])

    const lotTrigger = await clean.query<{ trigger_name: string }>(`
      SELECT DISTINCT trigger_name FROM information_schema.triggers
      WHERE event_object_schema = 'ale_bet' AND event_object_table = 'Lote' AND trigger_name = 'Lote_validate_sueltos'
    `)
    expect(lotTrigger.rows).toEqual([{ trigger_name: 'Lote_validate_sueltos' }])
  })

  it('fails closed instead of fabricating reservations for legacy approved orders', async () => {
    if (!blocked) throw new Error('Blocked client unavailable')
    await expect(apply(blocked, '20260803104500_alebet01_expand_operational_orders')).rejects.toThrow('ALEBET-01 preflight blocked')
  })
})
