import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    exclude: ['tests/browser/**', '**/dist/**', '**/node_modules/**'],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    passWithNoTests: false,
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/src/index.ts', '**/src/types.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      reportOnFailure: true,
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
        'packages/game-core/src/**': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 85,
        },
      },
    },
  },
});
