/**
 * ANV-0160 Phase 4 — Architecture guard: HOME isolation discipline.
 *
 * Asserts:
 *  1. vitest.config.ts wires tests/setup-isolated-home.ts in setupFiles.
 *  2. tests/setup-isolated-home.ts sets AND restores process.env.HOME.
 *  3. Any test file that mutates process.env.HOME MUST also restore it
 *     (assignment to origHome or delete). Broadened per plan-verifier Q7
 *     to cover all test files, not just dispatcher/wrap/doctor.
 *  4. Negative guards: the regex matches synthetic positive cases.
 *
 * REVERT-BUNDLE note: this file depends on setup-isolated-home.ts being
 * wired. If Phase 3 is reverted as a bundle, this file must also be removed.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Root helpers
// ---------------------------------------------------------------------------

const ROOT = import.meta.url.replace('file://', '').replace(/\/tests\/.*$/, '')

function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8')
}

// ---------------------------------------------------------------------------
// 1. vitest.config.ts wires setup-isolated-home.ts
// ---------------------------------------------------------------------------

describe('architecture: HOME isolation — vitest.config.ts wiring', () => {
  it('vitest.config.ts includes setup-isolated-home.ts in setupFiles', () => {
    const config = readFile('vitest.config.ts')
    expect(config).toContain('setup-isolated-home.ts')
    expect(config).toContain('setupFiles')
  })
})

// ---------------------------------------------------------------------------
// 2. setup-isolated-home.ts sets AND restores process.env.HOME
// ---------------------------------------------------------------------------

describe('architecture: HOME isolation — setup file shape', () => {
  let setupContent: string

  try {
    setupContent = readFile('tests/setup-isolated-home.ts')
  } catch {
    throw new Error(
      'tests/setup-isolated-home.ts not found — Phase 3 must be applied',
    )
  }

  it('sets process.env.HOME to an isolated tmpdir', () => {
    // Must assign process.env.HOME = fakeHome (the isolated tmpdir)
    expect(setupContent).toMatch(/process\.env\.HOME\s*=\s*fakeHome/)
  })

  it('restores process.env.HOME in afterAll', () => {
    // Must have an afterAll that restores origHome
    expect(setupContent).toMatch(/afterAll/)
    expect(setupContent).toMatch(/process\.env\.HOME\s*=\s*origHome/)
  })

  it('captures the original HOME before overriding', () => {
    // Must save origHome = process.env.HOME before overriding
    expect(setupContent).toMatch(/origHome\s*=\s*process\.env\.HOME/)
  })

  it('cleans up the fake tmpdir in afterAll', () => {
    // Must rmSync the fakeHome directory
    expect(setupContent).toMatch(/rmSync/)
    expect(setupContent).toMatch(/fakeHome/)
  })
})

// ---------------------------------------------------------------------------
// 3. Any test file that mutates process.env.HOME MUST also restore it.
//
// Detection: regex scan for `process.env.HOME = ` (mutation) without a
// paired restore pattern (origHome assignment, delete, or assignment back).
// Exclude: setup-isolated-home.ts (the canonical isolation setup itself).
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .test.ts files under a directory.
 */
function collectTestFiles(dir: string): string[] {
  const result: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectTestFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      result.push(full)
    }
  }
  return result
}

const testsDir = join(ROOT, 'tests')
const allTestFiles = collectTestFiles(testsDir)

describe('architecture: HOME isolation — per-test-file restore discipline', () => {
  // Files that mutate process.env.HOME must also restore it.
  // Mutation pattern: assignment to a non-fake value (not the setup file pattern).
  const MUTATION_RE = /process\.env\.HOME\s*=/

  // Restore patterns: any of these indicates proper cleanup
  const RESTORE_PATTERNS = [
    /origHome\s*[\w.]*\s*=/, // captures origHome = ...
    /process\.env\.HOME\s*=\s*orig/, // restores to origHome
    /delete\s+process\.env\.HOME/, // delete-based restore (process.env.HOME absent)
    /process\.env\s*=\s*original/, // full env-object restore (process.env = originalEnv)
  ]

  for (const filePath of allTestFiles) {
    // Skip the canonical setup file itself
    if (filePath.endsWith('setup-isolated-home.ts')) continue

    const rel = filePath.replace(`${ROOT}/`, '')
    const content = readFileSync(filePath, 'utf-8')

    if (!MUTATION_RE.test(content)) continue

    it(`${rel}: mutates process.env.HOME and has a restore pattern`, () => {
      const hasRestore = RESTORE_PATTERNS.some((re) => re.test(content))
      expect(
        hasRestore,
        `${rel} assigns process.env.HOME without a restore pattern. Add origHome capture + restore or use setup-isolated-home.ts.`,
      ).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------
// 4. Negative guards: the regex matches synthetic positive cases.
// ---------------------------------------------------------------------------

describe('architecture: HOME isolation — regex sanity guards', () => {
  it('MUTATION_RE matches process.env.HOME assignment', () => {
    const MUTATION_RE = /process\.env\.HOME\s*=/
    expect(MUTATION_RE.test("process.env.HOME = '/tmp/test'")).toBe(true)
    expect(MUTATION_RE.test('  process.env.HOME = fakeHome')).toBe(true)
  })

  it('MUTATION_RE does not match read-only access', () => {
    const MUTATION_RE = /process\.env\.HOME\s*=/
    expect(MUTATION_RE.test('const h = process.env.HOME')).toBe(false)
    expect(MUTATION_RE.test('if (process.env.HOME !== undefined)')).toBe(false)
  })

  it('restore pattern matches origHome capture', () => {
    const RESTORE_RE = /origHome\s*[\w.]*\s*=/
    expect(RESTORE_RE.test('  origHome = process.env.HOME')).toBe(true)
    expect(RESTORE_RE.test('let origHome: string | undefined')).toBe(false)
  })

  it('restore pattern matches origHome reassignment', () => {
    const RESTORE_RE = /process\.env\.HOME\s*=\s*orig/
    expect(RESTORE_RE.test('process.env.HOME = origHome')).toBe(true)
    expect(RESTORE_RE.test('process.env.HOME = fakeHome')).toBe(false)
  })
})
