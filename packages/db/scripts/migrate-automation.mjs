import { spawnSync } from 'node:child_process'
import { readFile, readdir, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { Client } from 'pg'

const AUTOMATION_DATABASE = 'platform_test_automation'
const AUTOMATION_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/platform_test_automation'
const CATALOG_RECONCILIATION_MIGRATION = '20261001160000_reconcile_alebet_product_catalog'

function assertAutomationDatabase(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL es obligatorio para migrar la base automática.')
  }

  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL no es una URL PostgreSQL válida.')
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1))
  if (databaseUrl !== AUTOMATION_DATABASE_URL) {
    throw new Error(`Migraciones automáticas permitidas únicamente con la URL local exacta de "${AUTOMATION_DATABASE}"; se recibió "${databaseName || '(vacía)'}".`)
  }
}

function runPrisma(prismaCli, configPath, dbDirectory) {
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--config', configPath], {
    cwd: dbDirectory, env: { ...process.env, PLATFORM_DATABASE_URL: process.env.DATABASE_URL }, stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`Prisma migrate deploy falló con estado ${result.status ?? 'desconocido'}.`)
}

async function migrationApplied(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl }); await client.connect()
  try {
    const table = await client.query("SELECT to_regclass('public._prisma_migrations') AS name")
    if (!table.rows[0]?.name) return false
    const result = await client.query('SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL LIMIT 1', [CATALOG_RECONCILIATION_MIGRATION])
    return result.rowCount === 1
  } finally { await client.end() }
}

async function assertCatalog(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl }); await client.connect()
  try {
    const result = await client.query('SELECT count(*)::int AS count FROM "ale_bet"."Producto"')
    if (result.rows[0]?.count !== 52) throw new Error(`La reconciliación automática debía dejar 52 productos; encontró ${result.rows[0]?.count ?? 'ninguno'}.`)
  } finally { await client.end() }
}

async function run() {
  assertAutomationDatabase(process.env.DATABASE_URL)
  assertAutomationDatabase(process.env.PLATFORM_DATABASE_URL)
  const dbDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const prismaCli = resolve(dbDirectory, 'node_modules/prisma/build/index.js')
  const configPath = resolve(dbDirectory, 'prisma.config.ts')
  if (await migrationApplied(process.env.DATABASE_URL)) {
    runPrisma(prismaCli, configPath, dbDirectory); await assertCatalog(process.env.DATABASE_URL); return
  }
  const temporaryRoot = await mkdtemp(join(dbDirectory, '.migration-stage-'))
  try {
    const stagedMigrations = join(temporaryRoot, 'migrations')
    await mkdir(stagedMigrations)
    const source = resolve(dbDirectory, 'prisma/migrations')
    const migrations = (await readdir(source, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).filter((name) => name < CATALOG_RECONCILIATION_MIGRATION).sort()
    for (const migration of migrations) await cp(join(source, migration), join(stagedMigrations, migration), { recursive: true })
    const stagedConfig = join(temporaryRoot, 'prisma.config.ts')
    await writeFile(stagedConfig, `import { defineConfig } from 'prisma/config'\nexport default defineConfig({ schema: ${JSON.stringify(resolve(dbDirectory, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(stagedMigrations)} }, datasource: { url: process.env.PLATFORM_DATABASE_URL } })\n`)
    runPrisma(prismaCli, stagedConfig, dbDirectory)
    const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect()
    try { await client.query(await readFile(resolve(dbDirectory, 'scripts/catalog-reconciliation-test-fixture.sql'), 'utf8')) } finally { await client.end() }
    runPrisma(prismaCli, configPath, dbDirectory); await assertCatalog(process.env.DATABASE_URL)
  } finally { await rm(temporaryRoot, { recursive: true, force: true }) }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
