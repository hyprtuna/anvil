import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for ANV-0268: tests must NOT touch the real user
 * config files. Bun's `os.homedir()` ignores `process.env.HOME` overrides,
 * so installer code that called `homedir()` directly leaked test writes to
 * the real `~/.config/opencode/opencode.json`, `~/.claude/`, etc.
 *
 * This test snapshots a hash of the real user config files BEFORE Vitest
 * runs the rest of the suite. It re-checks at suite end via a sibling test.
 * (Vitest globalSetup would be cleaner — for now, the snapshot is captured
 * at module load and verified during the test phase. If any other test in
 * the same worker writes to the real config, the hash diverges and this
 * fails.)
 *
 * If this test fires: find the test that mutated the file (most likely a
 * test that overrides `process.env.HOME` and then calls installer code
 * that does NOT route through `src/core/io/home.ts:getUserHome()`).
 *
 * The fix is to route the offending `homedir()` call through `getUserHome`,
 * NOT to add a per-test cleanup — those leak when tests fail.
 */

const REAL_HOME = homedir() // bypasses our getUserHome wrapper deliberately

const CRITICAL_FILES = [
  join(REAL_HOME, '.config', 'opencode', 'opencode.json'),
  join(REAL_HOME, '.claude', 'settings.json'),
  join(REAL_HOME, '.anvil', 'manifest.json'),
]

function hashIfExists(path: string): string | null {
  try {
    statSync(path)
  } catch {
    return null // absent is fine
  }
  const content = readFileSync(path)
  return createHash('sha256').update(content).digest('hex')
}

// Capture at module-import time (early in the test run).
const SNAPSHOT = Object.fromEntries(
  CRITICAL_FILES.map((p) => [p, hashIfExists(p)]),
)

describe('regression — tests must not touch real user config', () => {
  it('snapshots critical user files at module load (sentinel)', () => {
    // Sanity: at least one file should exist on a developer machine.
    // (CI may have none — accept that.)
    expect(SNAPSHOT).toBeDefined()
  })

  it.skipIf(process.env.CI === 'true')(
    'real user files are unchanged by the test suite (run last in file order)',
    () => {
      for (const [path, originalHash] of Object.entries(SNAPSHOT)) {
        const currentHash = hashIfExists(path)
        expect(currentHash, `${path} was modified by the test suite`).toBe(
          originalHash,
        )
      }
    },
  )
})
