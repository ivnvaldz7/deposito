import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
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
