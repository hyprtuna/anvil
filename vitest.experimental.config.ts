/**
 * ANV-0248 — Experimental Vitest config.
 *
 * Runs tests under tests/experimental/. These test the experimental feature
 * code in src/experimental/ and require the experimental build to be present.
 *
 * Usage:
 *   bun run test:experimental   (calls: vitest run --config vitest.experimental.config.ts)
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './tests/global-teardown.ts',
    setupFiles: ['./tests/setup-isolated-home.ts'],
    include: ['tests/experimental/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'references'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
      },
    },
  },
})
