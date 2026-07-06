/**
 * ANV-0218 — Adapter-tier Vitest config.
 *
 * Runs all adapter and OpenCode-plugin test suites:
 *   - tests/adapters/**         — top-level adapter tests
 *   - tests/opencode-plugin/**  — top-level opencode-plugin tests
 *   - tests/integration/adapters/**        — adapter integration tests
 *   - tests/integration/opencode-plugin/** — opencode-plugin integration tests
 *   - tests/integration/adapter-parity.test.ts — cross-adapter parity check
 *
 * Usage:
 *   bun run test:adapter   (calls: vitest run --config vitest.adapter.config.ts)
 */
import { defineConfig } from 'vitest/config'

const rawMaxForks = process.env.VITEST_MAX_FORKS
const maxForks =
  rawMaxForks !== undefined ? Number.parseInt(rawMaxForks, 10) : 3

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './tests/global-teardown.ts',
    setupFiles: ['./tests/setup-isolated-home.ts'],
    include: [
      'tests/adapters/**/*.test.ts',
      'tests/opencode-plugin/**/*.test.ts',
      'tests/integration/adapters/**/*.test.ts',
      'tests/integration/opencode-plugin/**/*.test.ts',
      'tests/integration/adapter-parity.test.ts',
    ],
    exclude: ['node_modules', 'dist', 'references', 'tests/experimental/**'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks,
        minForks: 1,
      },
    },
  },
})
