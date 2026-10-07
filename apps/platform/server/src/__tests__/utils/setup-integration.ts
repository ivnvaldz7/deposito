import { URL } from 'url'

export const AUTOMATION_TEST_DATABASE = 'platform_test_automation'
export const AUTOMATION_TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/platform_test_automation'

function parseDatabaseUrl(value: string, message: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new Error(message)
  }
}

export function assertAutomationDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('La URL de la base automática no está definida. Abortando truncate por seguridad.')
  }
  const parsed = parseDatabaseUrl(databaseUrl, 'La URL de la base automática no pudo ser parseada correctamente.')
  const dbName = decodeURIComponent(parsed.pathname.slice(1))
  if (databaseUrl !== AUTOMATION_TEST_DATABASE_URL) {
    throw new Error(`TRUNCATE permitido únicamente con la URL local exacta de "${AUTOMATION_TEST_DATABASE}"; se recibió "${dbName || '(vacía)'}". Abortando por seguridad.`)
  }
  return databaseUrl
}

export function validateTestEnvironment(env: NodeJS.ProcessEnv): { testDbUrl: string, dbName: string } {
  // 1. Verify NODE_ENV
  if (env.NODE_ENV !== 'test') {
    throw new Error('NODE_ENV debe ser "test" para correr tests de integración.')
  }

  // 2. Require both effective URLs explicitly. Never derive them from .env or *_TEST fallbacks.
  const testDbUrl = env.DATABASE_URL
  const platformDbUrl = env.PLATFORM_DATABASE_URL
  if (!testDbUrl || !platformDbUrl) {
    throw new Error('DATABASE_URL y PLATFORM_DATABASE_URL deben definirse explícitamente para automation.')
  }
  if (testDbUrl !== platformDbUrl) {
    throw new Error('DATABASE_URL y PLATFORM_DATABASE_URL deben apuntar a la misma base automática.')
  }

  // 4. Require explicit allow flag
  if (env.ALLOW_TEST_DB_RESET !== 'true') {
    throw new Error('Debe configurar ALLOW_TEST_DB_RESET="true" para permitir operaciones destructivas.')
  }

  // 5. Parse and validate the exact automation target before any destructive test starts.
  const parsed = parseDatabaseUrl(testDbUrl, 'La URL de test no pudo ser parseada correctamente.')

  const dbName = decodeURIComponent(parsed.pathname.slice(1)) // remove leading slash and decode

  if (!dbName) {
    throw new Error('El nombre de la base de datos está vacío.')
  }

  assertAutomationDatabaseUrl(testDbUrl)
  assertAutomationDatabaseUrl(platformDbUrl)

  return { testDbUrl, dbName: `${parsed.hostname}:${parsed.port}/${dbName}` }
}

// Only execute the validation and overriding if this file is imported as a setup file during integration testing.
if (process.env.VITEST_ENV === 'integration') {
  try {
    const { testDbUrl, dbName } = validateTestEnvironment(process.env)
    console.log(`[Integration Setup] Usando DB: ${dbName}`)

    process.env.PLATFORM_JWT_SECRET = 'test-secret'
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
