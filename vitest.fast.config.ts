/**
 * ANV-0218 — Fast-tier Vitest config.
 *
 * Runs the cheap subset of the suite: all unit tests, plus top-level test
 * directories that do not spawn subprocesses or perform disk installs
 * (rules, core, skills, skill-triggering, security).
 *
 * Explicit exclusions:
 *   - tests/integration/skill-e2e/** — opt-in via ANVIL_RUN_SKILL_E2E=1 or test:full
 *   - tests/integration/agent-e2e/** — slow LLM-backed agent tests
 *   - tests/integration/install-* — heavy disk-install tests
 *   - tests/installer/** — real installer integration (disk + process)
 *   - tests/smoke/** — covered by test:smoke
 *   - tests/experimental/** — covered by test:experimental
 *   - tests/adapters/** / tests/opencode-plugin/** — covered by test:adapter
 *
 * Untagged files not matched by any tier config are still covered by test:full
 * (which uses the default vitest.config.ts glob), so no files are orphaned from CI.
 *
 * Target: ≤60s on a warm machine (build already done).
 *
 * Usage:
 *   bun run test:fast   (calls: vitest run --config vitest.fast.config.ts)
 *
 * Env gates:
 *   ANVIL_RUN_SKILL_E2E=1  — runs skill-e2e tests even in fast tier (override)
 *   ANVIL_E2E_AGENT=llm    — selects LLM agent vs FakeAgent within skill-e2e
 *                            (independent of whether skill-e2e runs at all)
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
      'tests/unit/**/*.test.ts',
      'tests/rules/**/*.test.ts',
      'tests/core/**/*.test.ts',
      'tests/skills/**/*.test.ts',
      'tests/skill-triggering/**/*.test.ts',
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
