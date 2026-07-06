import { defineConfig } from 'vitest/config'

// ANV-0219: lift the maxForks cap that was masking tmpdir races.
// tmpdir races are now fixed in tests/helpers/tmpdir.ts (per-worker subtrees
// keyed on VITEST_POOL_ID) so concurrent forks never share a parent directory.
//
// Default: 2 — the proven-stable cap. ANV-0219 fixed the tmpdir races (per-worker
// VITEST_POOL_ID subtrees) and made the cap CONFIGURABLE, but a separate
// dist/-read race remains: some tests (install-source-resilience, diff) call
// stageAnvilHome / syncAnvilHome which reads dist/ concurrently, and at 3+ workers
// those reads interleave with other dist/-touching operations and produce
// intermittent ENOENT / stale-listing failures (observed flaky in a pre-push gate
// run at default 3). Until that race is fixed (backlog V018-maxforks-cpu-count),
// the DEFAULT stays at 2 so the gate is deterministic.
//
// VITEST_MAX_FORKS=<n> overrides the default — opt into higher parallelism at your
// own risk (e.g. VITEST_MAX_FORKS=8 on a fast desktop) once you accept the dist/
// race, or pin lower on a constrained CI agent.
const rawMaxForks = process.env.VITEST_MAX_FORKS
const maxForks =
  rawMaxForks !== undefined ? Number.parseInt(rawMaxForks, 10) : 2

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './tests/global-teardown.ts',
    setupFiles: ['./tests/setup-isolated-home.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'references', 'tests/experimental/**'],
    // Safety limits: prevent runaway tests from consuming all memory/CPU.
    // Handlers that shell out (pre-commit, pre-push) must mock execSync in tests.
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        // ANV-0200: recursive-spawn hazard eliminated (sentinel + subprocess hop
        // removed). ANV-0219: tmpdir races fixed via per-worker VITEST_POOL_ID
        // subtrees — the cap is now configurable (see comment above).
        // maxForks defaults to 2; override via VITEST_MAX_FORKS env var.
        maxForks,
        minForks: 1,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
})
