/**
 * ANV-0218 — Smoke-tier Vitest config.
 *
 * Runs only the smoke tests: a small set of end-to-end sanity checks that
 * verify the built binary responds correctly. No disk installs, no subprocess
 * spawning beyond `--version`/`--help`.
 *
 * Target: ≤10s on a warm machine (build already done).
 *
 * Usage:
 *   bun run test:smoke   (calls: vitest run --config vitest.smoke.config.ts)
 *
 * Tier membership:
 *   tests/smoke/**   — the one smoke test file (cli-version.test.ts)
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './tests/global-teardown.ts',
    setupFiles: ['./tests/setup-isolated-home.ts'],
    include: ['tests/smoke/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'references'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 3,
        minForks: 1,
      },
    },
  },
})
