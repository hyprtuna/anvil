/**
 * ANV-0171 — Import-side-effect smoke test for scripts/ci/check-rebase-base.ts.
 *
 * Asserts the canonical `fileURLToPath(import.meta.url) === resolve(argv[1])`
 * main-guard prevents the script's main() from running as a side effect when
 * the module is imported (e.g., from another test). This is the same fork-bomb
 * hazard that bit gate.ts under ANV-0153 (substring `argv[1]?.includes(...)`).
 *
 * Two layers of defence:
 *   1. Source-level lock: the file must NOT contain the substring-match
 *      antipattern `argv[1]?.includes`, and MUST contain the canonical
 *      `fileURLToPath(import.meta.url) === resolve(...)` shape.
 *   2. Runtime behaviour: importing the module (under vitest, where argv[1]
 *      is the test runner, not the script itself) must complete without
 *      invoking `execSync` — which `main()` would call via `realRunGit`. We
 *      mock `node:child_process` with a throwing `execSync`; if main() ran,
 *      the import would throw.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'ci',
  'check-rebase-base.ts',
)

// Mock node:child_process with a poisoned execSync. If main() runs on import,
// realRunGit → execSync → throws, the import rejects, and the test fails.
vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process',
    )
  return {
    ...actual,
    execSync: vi.fn(() => {
      throw new Error(
        'execSync must not be called on import of check-rebase-base.ts (main-guard regression)',
      )
    }),
  }
})

describe('check-rebase-base.ts main-guard —', () => {
  it('source does not use the argv[1]?.includes(...) substring antipattern', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf-8')
    // The antipattern that caused the gate.ts fork bomb under ANV-0153.
    expect(/argv\[1\]\?\.includes/.test(src)).toBe(false)
  })

  it('source uses the canonical fileURLToPath === resolve(argv[1]) main-guard', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf-8')
    expect(src).toContain('fileURLToPath(import.meta.url)')
    expect(src).toContain('resolve(process.argv[1]')
  })

  it('importing the module does not trigger execSync (main() does not run on import)', async () => {
    // The mocked execSync above throws on call. If the import rejects, main()
    // ran as an import side effect — the fork-bomb regression. We assert the
    // import resolves cleanly and the named exports are present.
    const mod = await import('../../../scripts/ci/check-rebase-base.js')
    expect(typeof mod.readPackageVersion).toBe('function')
    expect(typeof mod.checkRebaseBase).toBe('function')

    // Cross-check the mock is actually wired (otherwise this test is vacuous).
    const cp = await import('node:child_process')
    expect(vi.isMockFunction(cp.execSync)).toBe(true)
    expect(cp.execSync).not.toHaveBeenCalled()
  })
})
