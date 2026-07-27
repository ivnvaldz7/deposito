import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(process.cwd(), '../../../.env.test') })

import { URL } from 'url'

export function validateTestEnvironment(env: NodeJS.ProcessEnv): { testDbUrl: string, dbName: string } {
  // 1. Verify NODE_ENV
  if (env.NODE_ENV !== 'test') {
    throw new Error('NODE_ENV debe ser "test" para correr tests de integración.')
  }

  // 2. Load test database url
  const testDbUrl = env.PLATFORM_DATABASE_URL_TEST || env.DATABASE_URL_TEST
  if (!testDbUrl) {
    throw new Error('PLATFORM_DATABASE_URL_TEST o DATABASE_URL_TEST no están definidos.')
  }

  // 3. Prevent fallback
  if (testDbUrl === env.PLATFORM_DATABASE_URL || testDbUrl === env.DATABASE_URL) {
    throw new Error('La URL de test no puede ser idéntica a la de desarrollo/producción.')
  }

  // 4. Require explicit allow flag
  if (env.ALLOW_TEST_DB_RESET !== 'true') {
    throw new Error('Debe configurar ALLOW_TEST_DB_RESET="true" para permitir operaciones destructivas.')
  }

  // 5. Parse and validate test URL to prevent mistakes
  let parsed: URL
  try {
    parsed = new URL(testDbUrl)
  } catch (error) {
    throw new Error('La URL de test no pudo ser parseada correctamente.')
  }

  const dbName = decodeURIComponent(parsed.pathname.slice(1)) // remove leading slash and decode

  if (!dbName) {
    throw new Error('El nombre de la base de datos está vacío.')
  }

  if (dbName === 'test') {
    throw new Error('El nombre de la base de datos no puede ser exactamente "test".')
  }

  if (!dbName.endsWith('_test') && !dbName.startsWith('test_')) {
    throw new Error(`El nombre de la base de datos "${dbName}" no cumple la convención estricta (debe terminar en _test o empezar con test_). Abortando por seguridad.`)
  }

  return { testDbUrl, dbName: `${parsed.hostname}:${parsed.port}/${dbName}` }
}

// Only execute the validation and overriding if this file is imported as a setup file during integration testing.
if (process.env.VITEST_ENV === 'integration') {
  try {
    const { testDbUrl, dbName } = validateTestEnvironment(process.env)
    console.log(`[Integration Setup] Usando DB: ${dbName}`)

    // Override connection for the current process so @platform/db uses the test DB
    process.env.PLATFORM_DATABASE_URL = testDbUrl
    process.env.DATABASE_URL = testDbUrl
    process.env.PLATFORM_JWT_SECRET = 'test-secret'
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
