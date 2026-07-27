import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/integration/**/*.test.ts'],
    setupFiles: ['src/__tests__/utils/setup-integration.ts'],
    env: {
      VITEST_ENV: 'integration'
    },
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    hookTimeout: 30000,
    testTimeout: 10000
  }
})
