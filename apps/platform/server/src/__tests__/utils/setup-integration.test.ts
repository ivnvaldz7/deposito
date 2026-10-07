import { describe, it, expect, vi } from 'vitest'

// We set SKIP_INTEGRATION_SETUP_EXECUTION before importing so the file doesn't run the side-effects.
process.env.SKIP_INTEGRATION_SETUP_EXECUTION = 'true'
import { AUTOMATION_TEST_DATABASE_URL, assertAutomationDatabaseUrl, validateTestEnvironment } from './setup-integration'

describe('Integration Setup Guard', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    ALLOW_TEST_DB_RESET: 'true',
    PLATFORM_DATABASE_URL: AUTOMATION_TEST_DATABASE_URL,
    DATABASE_URL: AUTOMATION_TEST_DATABASE_URL,
  }

  it('acepta únicamente las URLs efectivas explícitas de automation', () => {
    expect(validateTestEnvironment(validBaseEnv).testDbUrl).toBe(validBaseEnv.DATABASE_URL)
  })

  it('aborta si falta DATABASE_URL aunque exista un fallback *_TEST', () => {
    const env: NodeJS.ProcessEnv = { ...validBaseEnv }
    delete env.DATABASE_URL
    env.DATABASE_URL_TEST = 'postgresql://u:p@l:5/platform_test'
    expect(() => validateTestEnvironment(env)).toThrow(/deben definirse explícitamente/)
  })

  it('aborta si NODE_ENV es incorrecto', () => {
    expect(() => validateTestEnvironment({ ...validBaseEnv, NODE_ENV: 'development' })).toThrow(/NODE_ENV debe ser "test"/)
  })

  it('aborta si falta ALLOW_TEST_DB_RESET', () => {
    const env: NodeJS.ProcessEnv = { ...validBaseEnv }
    delete env.ALLOW_TEST_DB_RESET
    expect(() => validateTestEnvironment(env)).toThrow(/ALLOW_TEST_DB_RESET/)
  })

  it('aborta si las dos URLs efectivas no coinciden', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL: 'postgresql://u:p@l:5/otra',
    })).toThrow(/misma base automática/)
  })

  it('aborta si las URLs explícitas apuntan a platform_test', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL: 'postgresql://u:p@l:5/platform_test',
      PLATFORM_DATABASE_URL: 'postgresql://u:p@l:5/platform_test',
    })).toThrow(/TRUNCATE permitido únicamente/)
  })

  it('aborta truncate directo para platform, platform_test y cualquier otro destino', () => {
    expect(() => assertAutomationDatabaseUrl('postgresql://u:p@l:5/platform')).toThrow(/TRUNCATE permitido únicamente/)
    expect(() => assertAutomationDatabaseUrl('postgresql://u:p@l:5/platform_test')).toThrow(/TRUNCATE permitido únicamente/)
    expect(() => assertAutomationDatabaseUrl('postgresql://u:p@l:5/otro')).toThrow(/TRUNCATE permitido únicamente/)
    expect(() => assertAutomationDatabaseUrl('postgresql://u:p@otro-host:5/platform_test_automation')).toThrow(/URL local exacta/)
    expect(() => assertAutomationDatabaseUrl(AUTOMATION_TEST_DATABASE_URL)).not.toThrow()
  })

  it('aborta con URL inválida', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL: 'not-a-url',
      PLATFORM_DATABASE_URL: 'not-a-url',
    })).toThrow(/parseada correctamente/)
  })
})
