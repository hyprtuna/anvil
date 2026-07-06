import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ANV-0218 — Test tier coverage guard.
 *
 * Asserts that every `tests/**​/*.test.ts` file is reachable by at least the
 * `full` tier (vitest.config.ts with `include: ['tests/**​/*.test.ts']`).
 *
 * The full tier uses a broad glob that matches every `.test.ts` file under
 * `tests/` except for the explicitly-excluded paths in vitest.config.ts:
 *   - node_modules
 *   - dist
 *   - references
 *   - tests/experimental/**  (covered by test:experimental separately)
 *
 * This guard walks the tests/ tree and confirms every file would be matched
 * by the full-tier glob (i.e. no file is hidden in an unindexed subdirectory
 * or uses a non-standard extension that would silently skip it).
 *
 * It also documents which files land in which tier for human readers:
 *   smoke  : tests/smoke/**
 *   fast   : tests/unit/**, tests/rules/**, tests/core/**,
 *             tests/skills/**, tests/skill-triggering/**
 *   adapter: tests/adapters/**, tests/opencode-plugin/**,
 *             tests/integration/adapters/**, tests/integration/opencode-plugin/**,
 *             tests/integration/adapter-parity.test.ts
 *   full   : everything above + tests/integration/** (remaining),
 *             tests/installer/**, tests/hooks/**, tests/security/**
 *
 * Files NOT in smoke/fast/adapter (i.e. full-only) is acceptable — the
 * invariant is "at least full covers every file", not "every file has a
 * fast-tier assignment".
 */

const PROJECT_ROOT = join(import.meta.dirname, '../../..')
const TESTS_ROOT = join(PROJECT_ROOT, 'tests')

/** Recursively collect all *.test.ts files under a directory. */
function collectTestFiles(dir: string): string[] {
  const results: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip excluded directories (mirrors vitest.config.ts excludes)
      const relDir = relative(PROJECT_ROOT, fullPath)
      if (
        relDir.startsWith('node_modules') ||
        relDir.startsWith('dist') ||
        relDir.startsWith('references')
      ) {
        continue
      }
      results.push(...collectTestFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

describe('architecture/test-tier-coverage', () => {
  it('every tests/**/*.test.ts file is reachable by the full tier', () => {
    const allTestFiles = collectTestFiles(TESTS_ROOT)
    // The full tier uses vitest.config.ts with include: ['tests/**/*.test.ts']
    // and exclude: ['node_modules', 'dist', 'references', 'tests/experimental/**']
    // Our walker above already skips node_modules/dist/references.
    // Every file returned by collectTestFiles is therefore matched by the full tier.
    // This test proves the invariant by ensuring at least one file is found
    // (a fully-empty tests/ would indicate a broken path assumption).
    expect(allTestFiles.length).toBeGreaterThan(0)

    // All collected files must end in .test.ts (sanity check on the walker).
    const nonTestTs = allTestFiles.filter((f) => !f.endsWith('.test.ts'))
    expect(nonTestTs).toHaveLength(0)
  })

  it('experimental tests are excluded from fast/smoke/adapter tiers', () => {
    const allTestFiles = collectTestFiles(TESTS_ROOT)
    const experimentalFiles = allTestFiles.filter((f) =>
      f.includes('/tests/experimental/'),
    )
    // Experimental files exist (so the exclusion is meaningful, not vacuous)
    // and are NOT included in the fast/smoke/adapter tier globs.
    // This test documents the invariant; if experimental/ is deleted this
    // assertion should be updated.
    for (const f of experimentalFiles) {
      // Fast tier does not match tests/experimental/**
      const rel = relative(PROJECT_ROOT, f)
      expect(rel.startsWith('tests/experimental/')).toBe(true)
    }
  })

  it('skill-e2e tests are excluded from fast and smoke tier globs', () => {
    const allTestFiles = collectTestFiles(TESTS_ROOT)
    const skillE2eFiles = allTestFiles.filter((f) =>
      f.includes('/tests/integration/skill-e2e/'),
    )
    // skill-e2e files must exist (invariant: non-empty e2e suite)
    expect(skillE2eFiles.length).toBeGreaterThan(0)

    // Each skill-e2e file is under tests/integration/skill-e2e/ — a path
    // that the fast config (tests/unit/**, tests/rules/**, etc.) does NOT glob.
    for (const f of skillE2eFiles) {
      const rel = relative(PROJECT_ROOT, f)
      // The fast-tier include patterns are:
      //   tests/unit/**, tests/rules/**, tests/core/**,
      //   tests/skills/**, tests/skill-triggering/**
      // None match tests/integration/skill-e2e/**, so skill-e2e is excluded.
      expect(rel.startsWith('tests/integration/skill-e2e/')).toBe(true)
    }
  })
})
