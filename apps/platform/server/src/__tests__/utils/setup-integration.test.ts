import { describe, it, expect, vi } from 'vitest'

// We set SKIP_INTEGRATION_SETUP_EXECUTION before importing so the file doesn't run the side-effects.
process.env.SKIP_INTEGRATION_SETUP_EXECUTION = 'true'
import { validateTestEnvironment } from './setup-integration'

describe('Integration Setup Guard', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    ALLOW_TEST_DB_RESET: 'true',
    PLATFORM_DATABASE_URL: 'postgresql://u:p@l:5/dev',
    DATABASE_URL_TEST: 'postgresql://u:p@l:5/deposito_test'
  }

  it('valida un entorno correcto con sufijo _test', () => {
    expect(() => validateTestEnvironment(validBaseEnv)).not.toThrow()
  })

  it('valida un entorno correcto con prefijo test_', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'postgresql://u:p@l:5/test_deposito'
    })).not.toThrow()
  })

  it('aborta si falta DATABASE_URL_TEST', () => {
    const env: NodeJS.ProcessEnv = { ...validBaseEnv }
    delete env.DATABASE_URL_TEST
    expect(() => validateTestEnvironment(env)).toThrow(/no están definidos/)
  })

  it('aborta si NODE_ENV es incorrecto', () => {
    expect(() => validateTestEnvironment({ ...validBaseEnv, NODE_ENV: 'development' })).toThrow(/NODE_ENV debe ser "test"/)
  })

  it('aborta si falta ALLOW_TEST_DB_RESET', () => {
    const env: NodeJS.ProcessEnv = { ...validBaseEnv }
    delete env.ALLOW_TEST_DB_RESET
    expect(() => validateTestEnvironment(env)).toThrow(/ALLOW_TEST_DB_RESET/)
  })

  it('aborta si URL es igual a desarrollo', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'postgresql://u:p@l:5/dev'
    })).toThrow(/idéntica a la de desarrollo/)
  })

  it('aborta con nombre platform_contest (falso positivo)', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'postgresql://u:p@l:5/platform_contest'
    })).toThrow(/no cumple la convención estricta/)
  })

  it('aborta con nombre platform_testing_prod', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'postgresql://u:p@l:5/platform_testing_prod'
    })).toThrow(/no cumple la convención estricta/)
  })

  it('aborta si nombre es exactamente test', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'postgresql://u:p@l:5/test'
    })).toThrow(/exactamente "test"/)
  })

  it('aborta con nombre latest', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'postgresql://u:p@l:5/latest'
    })).toThrow(/no cumple la convención estricta/)
  })

  it('aborta con nombre vacío', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'postgresql://u:p@l:5/'
    })).toThrow(/está vacío/)
  })

  it('aborta con URL inválida', () => {
    expect(() => validateTestEnvironment({
      ...validBaseEnv,
      DATABASE_URL_TEST: 'not-a-url'
    })).toThrow(/parseada correctamente/)
  })
})
