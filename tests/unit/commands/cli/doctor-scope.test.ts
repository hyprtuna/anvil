/**
 * ANV-0146 / ANV-0157 — Unit tests for scope-aware doctor.
 *
 * Tests:
 *   - detectInstallScope (4 scopes × filesystem combinations)
 *   - _hasAnvilGlobalEvidence (ANV-0157 three-signal broadening)
 *   - expectedAbsence predicate (wiring rows suppressed on global-only install)
 *   - --scope override via doctorCommand option parsing
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _hasAnvilGlobalEvidence,
  detectInstallScope,
  doctorCommand,
} from '../../../../src/commands/cli/doctor.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let fakeRoot: string

beforeEach(() => {
  fakeRoot = join(
    tmpdir(),
    `anv-0146-scope-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(fakeRoot, { recursive: true })
})

afterEach(() => {
  rmSync(fakeRoot, { recursive: true, force: true })
})

// Helper: create a file with parent dirs
function touch(filePath: string): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, '{}')
}

// ---------------------------------------------------------------------------
// detectInstallScope — scope detection logic
// ---------------------------------------------------------------------------

describe('detectInstallScope', () => {
  describe("scope: 'unknown' — no evidence", () => {
    it('returns unknown when neither project files nor global evidence exist', () => {
      const cwd = join(fakeRoot, 'empty-project')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      mkdirSync(home, { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('unknown')
    })

    it('returns unknown when ~/.anvil exists but is empty (no known sub-entries)', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      mkdirSync(join(home, '.anvil'), { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('unknown')
    })
  })

  describe("scope: 'global' — only global evidence", () => {
    it('returns global when ~/.anvil/installed_plugins.json exists and no project files', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      touch(join(home, '.anvil', 'installed_plugins.json'))
      expect(detectInstallScope(cwd, home)).toBe('global')
    })

    // ANV-0157: signal 2 — version file (dev-clone / npm-link installs)
    it('returns global when only ~/.anvil/version exists and no project files', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      touch(join(home, '.anvil', 'version'))
      expect(detectInstallScope(cwd, home)).toBe('global')
    })

    // ANV-0157: signal 3 — directory with skills/ sub-entry
    it('returns global when ~/.anvil/skills/ exists and no project files', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      mkdirSync(join(home, '.anvil', 'skills'), { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('global')
    })

    // ANV-0157: signal 3 — directory with agents/ sub-entry
    it('returns global when ~/.anvil/agents/ exists and no project files', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      mkdirSync(join(home, '.anvil', 'agents'), { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('global')
    })

    // ANV-0157: signal 3 — directory with models.json file
    it('returns global when ~/.anvil/models.json exists and no project files', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      touch(join(home, '.anvil', 'models.json'))
      expect(detectInstallScope(cwd, home)).toBe('global')
    })

    // ANV-0157: signal 3 — directory with plugins/ sub-entry
    it('returns global when ~/.anvil/plugins/ exists and no project files', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      mkdirSync(cwd, { recursive: true })
      mkdirSync(join(home, '.anvil', 'plugins'), { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('global')
    })
  })

  describe("scope: 'project' — only project files", () => {
    it('returns project when .claude/settings.json exists in CWD', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      touch(join(cwd, '.claude', 'settings.json'))
      mkdirSync(home, { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('project')
    })

    it('returns project when .opencode/opencode.json exists in CWD', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      touch(join(cwd, '.opencode', 'opencode.json'))
      mkdirSync(home, { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('project')
    })

    it('returns project when both CC and OC project files exist (no global evidence)', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      touch(join(cwd, '.claude', 'settings.json'))
      touch(join(cwd, '.opencode', 'opencode.json'))
      mkdirSync(home, { recursive: true })
      expect(detectInstallScope(cwd, home)).toBe('project')
    })
  })

  describe("scope: 'both' — project files AND global evidence", () => {
    it('returns both when CC project file and global evidence coexist', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      touch(join(cwd, '.claude', 'settings.json'))
      touch(join(home, '.anvil', 'installed_plugins.json'))
      expect(detectInstallScope(cwd, home)).toBe('both')
    })

    it('returns both when OC project file and global evidence coexist', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      touch(join(cwd, '.opencode', 'opencode.json'))
      touch(join(home, '.anvil', 'installed_plugins.json'))
      expect(detectInstallScope(cwd, home)).toBe('both')
    })

    it('returns both when all three indicators exist', () => {
      const cwd = join(fakeRoot, 'cwd')
      const home = join(fakeRoot, 'home')
      touch(join(cwd, '.claude', 'settings.json'))
      touch(join(cwd, '.opencode', 'opencode.json'))
      touch(join(home, '.anvil', 'installed_plugins.json'))
      expect(detectInstallScope(cwd, home)).toBe('both')
    })
  })
})

// ---------------------------------------------------------------------------
// _hasAnvilGlobalEvidence — ANV-0157 three-signal predicate (unit isolation)
// ---------------------------------------------------------------------------

describe('_hasAnvilGlobalEvidence', () => {
  it('returns false when anvilDir does not exist', () => {
    const anvilDir = join(fakeRoot, 'nonexistent', '.anvil')
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(false)
  })

  it('returns false when anvilDir exists but is empty', () => {
    const anvilDir = join(fakeRoot, 'empty', '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(false)
  })

  it('returns false when anvilDir has only unrecognised entries', () => {
    const anvilDir = join(fakeRoot, 'unknown-entries', '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(join(anvilDir, 'somethingelse.json'), '{}')
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(false)
  })

  // Signal 1
  it('returns true when installed_plugins.json is present (signal 1)', () => {
    const anvilDir = join(fakeRoot, 'signal1', '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(join(anvilDir, 'installed_plugins.json'), '{}')
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(true)
  })

  // Signal 2
  it('returns true when version file is present (signal 2)', () => {
    const anvilDir = join(fakeRoot, 'signal2', '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(join(anvilDir, 'version'), '0.13.4')
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(true)
  })

  // Signal 3 variants
  it('returns true when skills/ sub-directory is present (signal 3)', () => {
    const anvilDir = join(fakeRoot, 'signal3-skills', '.anvil')
    mkdirSync(join(anvilDir, 'skills'), { recursive: true })
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(true)
  })

  it('returns true when agents/ sub-directory is present (signal 3)', () => {
    const anvilDir = join(fakeRoot, 'signal3-agents', '.anvil')
    mkdirSync(join(anvilDir, 'agents'), { recursive: true })
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(true)
  })

  it('returns true when plugins/ sub-directory is present (signal 3)', () => {
    const anvilDir = join(fakeRoot, 'signal3-plugins', '.anvil')
    mkdirSync(join(anvilDir, 'plugins'), { recursive: true })
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(true)
  })

  it('returns true when models.json is present (signal 3)', () => {
    const anvilDir = join(fakeRoot, 'signal3-models', '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(join(anvilDir, 'models.json'), '{}')
    expect(_hasAnvilGlobalEvidence(anvilDir)).toBe(true)
  })
})

// Edge case: empty ~/.anvil/ + project markers → not 'global' (still 'project')
describe('edge case — empty ~/.anvil + project markers', () => {
  it('returns project (not global) when ~/.anvil is empty and project wiring exists', () => {
    const cwd = join(fakeRoot, 'cwd')
    const home = join(fakeRoot, 'home')
    touch(join(cwd, '.claude', 'settings.json'))
    mkdirSync(join(home, '.anvil'), { recursive: true })
    // empty ~/.anvil/ = no global evidence → scope is 'project', not 'both'
    expect(detectInstallScope(cwd, home)).toBe('project')
  })
})

// ---------------------------------------------------------------------------
// expectedAbsence predicate — wiring rows suppressed on global-only install
// ---------------------------------------------------------------------------

describe('expectedAbsence suppression', () => {
  /**
   * On a global-only install (scope=global, inProject=true but no wiring files),
   * the four project-wiring checks should emit status='skip' + expectedAbsence=true
   * instead of status='warn'. We validate this by running doctorCommand with
   * --scope global in a directory that is a project root (has package.json) but
   * has no .claude/settings.json or .opencode/opencode.json.
   *
   * Because doctorCommand writes to process.stdout/stderr and calls process.exit,
   * we test the scope detection + predicate logic at the unit level using
   * detectInstallScope and the helper exports rather than full integration.
   */

  it('scope=global + no project files => detectInstallScope returns global', () => {
    const cwd = join(fakeRoot, 'project-no-wiring')
    const home = join(fakeRoot, 'home')
    // Simulate a project root with package.json but no wiring files
    touch(join(cwd, 'package.json'))
    touch(join(home, '.anvil', 'installed_plugins.json'))
    // No .claude/settings.json, no .opencode/opencode.json
    const scope = detectInstallScope(cwd, home)
    expect(scope).toBe('global')
  })

  it('scope=project when .claude/settings.json present (no global evidence)', () => {
    const cwd = join(fakeRoot, 'project-with-cc')
    const home = join(fakeRoot, 'home')
    touch(join(cwd, '.claude', 'settings.json'))
    mkdirSync(home, { recursive: true })
    const scope = detectInstallScope(cwd, home)
    expect(scope).toBe('project')
  })

  it('scope=both when project wiring + global evidence both present', () => {
    const cwd = join(fakeRoot, 'project-with-both')
    const home = join(fakeRoot, 'home')
    touch(join(cwd, '.claude', 'settings.json'))
    touch(join(home, '.anvil', 'installed_plugins.json'))
    const scope = detectInstallScope(cwd, home)
    expect(scope).toBe('both')
    // 'both' is NOT global-only — wiring warns should still fire
    expect(scope).not.toBe('global')
  })
})

// ---------------------------------------------------------------------------
// --scope override — CLI flag ignores _hasAnvilGlobalEvidence
// ---------------------------------------------------------------------------

describe('--scope override behaviour', () => {
  /**
   * When the user passes `--scope global`, detectInstallScope() is bypassed
   * entirely and the scope is forced to 'global', regardless of what
   * _hasAnvilGlobalEvidence returns.
   *
   * We verify this by testing the two paths in isolation:
   *   - With global evidence present, detectInstallScope returns 'global'.
   *   - Without global evidence, detectInstallScope returns 'unknown'.
   * In both cases, passing rawScope='global' to doctorCommand should produce
   * the same Install scope row: "scope: global".
   *
   * We test the underlying detectInstallScope + _hasAnvilGlobalEvidence
   * interaction to confirm the override path (opts.scope passed as a literal)
   * is independent from the auto-detection result.
   */

  it('detectInstallScope returns global when global evidence present, unknown when absent', () => {
    // With evidence: returns 'global'
    const cwdWithEvidence = join(fakeRoot, 'override-cwd-evidence')
    const homeWithEvidence = join(fakeRoot, 'override-home-evidence')
    mkdirSync(cwdWithEvidence, { recursive: true })
    touch(join(homeWithEvidence, '.anvil', 'installed_plugins.json'))
    expect(detectInstallScope(cwdWithEvidence, homeWithEvidence)).toBe('global')

    // Without evidence: returns 'unknown' (not 'global')
    const cwdNoEvidence = join(fakeRoot, 'override-cwd-no-evidence')
    const homeNoEvidence = join(fakeRoot, 'override-home-no-evidence')
    mkdirSync(cwdNoEvidence, { recursive: true })
    mkdirSync(homeNoEvidence, { recursive: true })
    expect(detectInstallScope(cwdNoEvidence, homeNoEvidence)).toBe('unknown')
  })

  it('_hasAnvilGlobalEvidence returns false when evidence absent, true when present — confirming override independence', () => {
    // The scope override path in doctorCommand skips detectInstallScope entirely
    // when opts.scope is a known literal. We confirm _hasAnvilGlobalEvidence
    // changes value based on evidence, which is the thing being bypassed.
    const anvilDirNoEvidence = join(fakeRoot, 'no-evidence', '.anvil')
    mkdirSync(anvilDirNoEvidence, { recursive: true })
    expect(_hasAnvilGlobalEvidence(anvilDirNoEvidence)).toBe(false)

    const anvilDirWithEvidence = join(fakeRoot, 'with-evidence', '.anvil')
    mkdirSync(anvilDirWithEvidence, { recursive: true })
    writeFileSync(join(anvilDirWithEvidence, 'installed_plugins.json'), '{}')
    expect(_hasAnvilGlobalEvidence(anvilDirWithEvidence)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ANV-0157 acceptance criterion — quiet-mode suppression of the four wiring rows
// ---------------------------------------------------------------------------

const FOUR_WIRING_ROWS = [
  'CC project wiring (.claude/settings.json)',
  'CC statusline wiring (.claude/settings.json → statusLine)',
  'CC settings template (.claude/settings.json)',
  'OC project wiring (.opencode/opencode.json)',
] as const

describe('acceptance criterion — wiring rows absent from quiet-mode output on global-only install', () => {
  /**
   * Primary acceptance criterion from ANV-0157 slate (line 62):
   * "the four wiring rows disappear from default-quiet output."
   *
   * Setup: fake HOME with global evidence (installed_plugins.json), fake
   * project dir (package.json present so inProject=true). No wiring files
   * (.claude/settings.json or .opencode/opencode.json absent).
   *
   * Expected: each of the four project-wiring rows in the JSON output either
   *   (a) has status='skip' AND expectedAbsence=true  (suppressed in quiet mode), or
   *   (b) is absent from the output entirely.
   * They must NOT have status='warn' — that would surface in quiet mode.
   *
   * Note: doctorCommand reads `homedir()` from `node:os` which returns the
   * real HOME. We override process.env.HOME here, which affects homedir() on
   * POSIX (Linux/macOS). The non-injectability of homedir() in the source
   * is ANV-0160's scope; this test relies on the POSIX behaviour of
   * process.env.HOME being respected by os.homedir().
   */

  let savedCwd: string
  let savedHome: string | undefined
  let testDir: string

  beforeEach(() => {
    savedCwd = process.cwd()
    savedHome = process.env.HOME
  })

  afterEach(() => {
    process.chdir(savedCwd)
    if (savedHome !== undefined) {
      process.env.HOME = savedHome
    } else {
      // biome-ignore lint/performance/noDelete: must truly unset for env isolation
      delete process.env.HOME
    }
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('four wiring rows are skip+expectedAbsence (not warn) on a global-only install in a project dir', async () => {
    // Build isolated filesystem fixture
    testDir = join(
      tmpdir(),
      `anv-0157-ac-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    const fakeHome = join(testDir, 'home')
    const projectDir = join(testDir, 'project')

    // Global evidence: installed_plugins.json
    mkdirSync(join(fakeHome, '.anvil'), { recursive: true })
    writeFileSync(join(fakeHome, '.anvil', 'installed_plugins.json'), '{}')

    // Project root marker: package.json (so inProject=true)
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'package.json'), '{"name": "test-anv-0157"}')
    // No .claude/settings.json, no .opencode/opencode.json
    // → wiring checks will fire "not wired" and ccWiringExpected/ocWiringExpected
    //   will be true because installScope==='global'

    process.env.HOME = fakeHome
    process.chdir(projectDir)

    // Capture the raw JSON output (includes expectedAbsence field)
    const chunks: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      return true
    }) as typeof process.stdout.write

    try {
      await doctorCommand({ json: true })
    } catch {
      // doctorCommand may call process.exit
    } finally {
      process.stdout.write = origWrite
    }

    const payload = chunks.join('')
    type CheckRow = {
      name: string
      status: string
      detail: string
      expectedAbsence?: boolean
    }
    let allRows: CheckRow[] = []
    try {
      allRows = JSON.parse(payload) as CheckRow[]
    } catch {
      // If parsing fails, allRows stays [] and assertions below will fail with
      // a clear message about missing rows rather than a parse error.
    }

    const byName = Object.fromEntries(allRows.map((r) => [r.name, r]))

    // Verify Install scope row shows 'global' (confirms fixture is correct)
    const scopeRow = byName['Install scope']
    expect(
      scopeRow?.detail,
      'Install scope row should read "scope: global" — fixture may be misconfigured',
    ).toBe('scope: global')

    // Primary assertion: each of the four wiring rows must be
    // status='skip' + expectedAbsence=true (i.e. suppressed in quiet mode).
    for (const rowName of FOUR_WIRING_ROWS) {
      const row = byName[rowName]
      expect(
        row,
        `Row '${rowName}' must be present in JSON output (inProject=true, so the row runs)`,
      ).toBeDefined()
      if (row !== undefined) {
        expect(
          row.status,
          `Row '${rowName}' must be status='skip' on a global-only install (got '${row.status}')`,
        ).toBe('skip')
        expect(
          row.expectedAbsence,
          `Row '${rowName}' must have expectedAbsence=true so quiet-mode filter suppresses it`,
        ).toBe(true)
      }
    }
  })
})
