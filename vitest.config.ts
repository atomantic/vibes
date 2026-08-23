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
      // Deterministic web modules are unit-tested here; React/WebGL composition
      // is exercised by the production Playwright suite.
      include: [
        'packages/*/src/**/*.{ts,tsx}',
        'apps/web/src/settings.ts',
        'apps/web/src/game/audio/SynthAudio.ts',
        'apps/web/src/game/input/KeyboardInput.ts',
        'apps/web/src/game/persistence.ts',
        'apps/web/src/game/render/avatarAnimation.ts',
        'apps/web/src/game/render/shardVisibility.ts',
      ],
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
