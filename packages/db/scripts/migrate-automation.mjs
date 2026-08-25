import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const AUTOMATION_DATABASE = 'platform_test_automation'
const AUTOMATION_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/platform_test_automation'

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

try {
  assertAutomationDatabase(process.env.DATABASE_URL)
  const dbDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const prismaCli = resolve(dbDirectory, '../../node_modules/prisma/build/index.js')
  const result = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', resolve(dbDirectory, 'prisma.config.ts')],
    {
      cwd: dbDirectory,
      env: { ...process.env, PLATFORM_DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'inherit',
    },
  )
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
