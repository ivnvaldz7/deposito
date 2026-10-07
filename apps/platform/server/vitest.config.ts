import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Manual probes require a live platform database and are not part of the
    // hermetic CI contract. The misspelled legacy folder only contains an
    // empty placeholder, so excluding it prevents Vitest from treating it as
    // a failed suite.
    exclude: [
      'src/**/__tests__/integration/**/*.test.ts',
      'src/__tests__/test-desmarcar.test.ts',
      'src/__tests__/test-post-cliente.test.ts',
      'src/depos ito/**',
    ],
    clearMocks: true,
    restoreMocks: true,
    server: {
      deps: {
        inline: ['@platform/core', '@platform/db'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/generated/**',
        'src/deposito/lib/lote-generator.ts',
        'src/deposito/lib/producto-catalogo.ts',
        'src/deposito/scripts/**',
      ],
    },
  },
})
