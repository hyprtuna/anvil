import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printCheckList } from '../../../../src/commands/cli/common/report.js'
import {
  inspectSettingsTemplate,
  repairMissingDirs,
} from '../../../../src/commands/cli/doctor.js'

describe('commands/cli/doctor --fix', () => {
  let fakeHome: string
  let origHome: string | undefined

  beforeEach(() => {
    fakeHome = join(tmpdir(), `anvil-doctor-home-${Date.now()}`)
    mkdirSync(fakeHome, { recursive: true })
    origHome = process.env.HOME
    process.env.HOME = fakeHome
  })

  afterEach(() => {
    if (origHome !== undefined) {
      process.env.HOME = origHome
    } else {
      // biome-ignore lint/performance/noDelete: process.env.HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
      delete process.env.HOME
    }
    rmSync(fakeHome, { recursive: true, force: true })
  })

  it('creates ~/.anvil directory when missing', () => {
    const repairs = repairMissingDirs(fakeHome)
    expect(existsSync(join(fakeHome, '.anvil'))).toBe(true)
    expect(repairs.some((r: string) => r.includes('.anvil'))).toBe(true)
  })

  it('is idempotent — does not re-create existing ~/.anvil', () => {
    mkdirSync(join(fakeHome, '.anvil'), { recursive: true })
    const repairs = repairMissingDirs(fakeHome)
    // Nothing to repair — dir already exists
    expect(repairs.length).toBe(0)
  })

  it('does NOT fabricate plugin manifests (those must come from `init`)', () => {
    repairMissingDirs(fakeHome)
    expect(existsSync(join(fakeHome, '.anvil', '.claude-plugin'))).toBe(false)
    expect(existsSync(join(fakeHome, '.anvil', '.opencode'))).toBe(false)
  })
})

describe('inspectSettingsTemplate (Plan 28 G4)', () => {
  it('warns when settings is null (file missing or unparseable)', () => {
    const result = inspectSettingsTemplate(null)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('anvil init')
  })

  it('fails when settings is an array (invalid top-level shape)', () => {
    const result = inspectSettingsTemplate([])
    expect(result.status).toBe('fail')
  })

  it('warns when permissions block is absent', () => {
    const result = inspectSettingsTemplate({ effortLevel: 'medium' })
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('permissions')
  })

  it('passes when permissions block is present and reports defaultMode', () => {
    const result = inspectSettingsTemplate({
      permissions: {
        allow: [],
        ask: [],
        deny: [],
        additionalDirectories: [],
        defaultMode: 'acceptEdits',
      },
    })
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('acceptEdits')
  })

  it('still passes when permissions exists but defaultMode is unset', () => {
    const result = inspectSettingsTemplate({ permissions: { allow: [] } })
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('<unset>')
  })

  it('fails when permissions is not an object', () => {
    const result = inspectSettingsTemplate({ permissions: 'broken' })
    expect(result.status).toBe('fail')
  })
})

// ---------------------------------------------------------------------------
// ANV-0140 — quiet-mode output filtering
// ---------------------------------------------------------------------------

function captureLog(fn: () => void): string[] {
  const lines: string[] = []
  const spy = vi
    .spyOn(console, 'log')
    .mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '))
    })
  fn()
  spy.mockRestore()
  return lines
}

function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI codes
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

const SKIP_DETAIL =
  'not in a project root (no package.json / .git / etc.) — run from a project directory for project checks'

describe('quiet-mode filtering logic', () => {
  it('quiet mode: pass rows are hidden, tally still counts them', () => {
    const allRows = [
      { status: 'pass' as const, label: 'Node.js', detail: 'v22' },
      { status: 'pass' as const, label: 'version file', detail: 'v0.13.1' },
      { status: 'warn' as const, label: 'CC user wiring', detail: 'not wired' },
    ]
    const displayRows = allRows.filter(
      (r) =>
        r.status !== 'pass' &&
        !(r.status === 'skip' && r.detail === SKIP_DETAIL),
    )
    const lines = captureLog(() => printCheckList(displayRows, allRows))
    const allText = lines.map(stripAnsi).join('\n')
    // Pass rows should not appear in displayed output
    expect(allText).not.toContain('Node.js')
    expect(allText).not.toContain('version file')
    // Warn row should appear
    expect(allText).toContain('CC user wiring')
    // Footer tally should reflect full set counts
    expect(allText).toContain('2 ok')
    expect(allText).toContain('1 warn')
  })

  it('quiet mode: expected-absence skips are hidden', () => {
    const allRows = [
      {
        status: 'skip' as const,
        label: 'CC project wiring (.claude/settings.json)',
        detail: SKIP_DETAIL,
      },
      {
        status: 'skip' as const,
        label: 'OC project wiring (.opencode/opencode.json)',
        detail: SKIP_DETAIL,
      },
    ]
    const displayRows = allRows.filter(
      (r) =>
        r.status !== 'pass' &&
        !(r.status === 'skip' && r.detail === SKIP_DETAIL),
    )
    expect(displayRows).toHaveLength(0)
  })

  it('quiet mode: unexpected skips (different detail) are shown', () => {
    const allRows = [
      {
        status: 'skip' as const,
        label: 'Hook latency budget',
        detail: 'no data — hook-timings.jsonl not found',
      },
    ]
    const displayRows = allRows.filter(
      (r) =>
        r.status !== 'pass' &&
        !(r.status === 'skip' && r.detail === SKIP_DETAIL),
    )
    // Non-expected-absence skip should still be shown
    expect(displayRows).toHaveLength(1)
    expect(displayRows[0]!.label).toBe('Hook latency budget')
  })

  it('verbose mode: all rows are shown', () => {
    const allRows = [
      { status: 'pass' as const, label: 'Node.js', detail: 'v22' },
      {
        status: 'skip' as const,
        label: 'CC project wiring (.claude/settings.json)',
        detail: SKIP_DETAIL,
      },
      { status: 'fail' as const, label: 'some check', detail: 'broken' },
    ]
    // verbose: no filtering
    const displayRows = allRows
    const lines = captureLog(() => printCheckList(displayRows, allRows))
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('Node.js')
    expect(allText).toContain('CC project wiring (.claude/settings.json)')
    expect(allText).toContain('some check')
  })
})

describe('no ANV-#### ticket IDs in row labels', () => {
  it('FIXABLE_WARNS keys contain no ANV-#### ticket IDs', async () => {
    const { FIXABLE_WARNS } = await import(
      '../../../../src/commands/cli/doctor.js'
    )
    for (const key of Object.keys(FIXABLE_WARNS)) {
      expect(key).not.toMatch(/ANV-\d{4}/i)
    }
  })
})
