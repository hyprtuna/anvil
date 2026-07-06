import chalk from 'chalk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  badge,
  printCheckList,
  printInstallSummary,
  printKv,
  printRemovalSummary,
} from '../../../../../src/commands/cli/common/report.js'

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// badge()
// ---------------------------------------------------------------------------

describe('badge', () => {
  it('returns a string for each status', () => {
    expect(typeof badge('pass')).toBe('string')
    expect(typeof badge('warn')).toBe('string')
    expect(typeof badge('fail')).toBe('string')
  })

  it('contains the correct glyph', () => {
    expect(stripAnsi(badge('pass'))).toBe('✓')
    expect(stripAnsi(badge('warn'))).toBe('⚠')
    expect(stripAnsi(badge('fail'))).toBe('✗')
  })
})

// ---------------------------------------------------------------------------
// printKv()
// ---------------------------------------------------------------------------

describe('printKv', () => {
  it('prints label and value on one line', () => {
    const lines = captureLog(() => printKv('location', '/home/user/.anvil'))
    expect(lines).toHaveLength(1)
    expect(stripAnsi(lines[0])).toContain('location:')
    expect(stripAnsi(lines[0])).toContain('/home/user/.anvil')
  })
})

// ---------------------------------------------------------------------------
// printCheckList()
// ---------------------------------------------------------------------------

describe('printCheckList', () => {
  it('tally line counts correct for mixed-status rows', () => {
    const rows = [
      { status: 'pass' as const, label: 'A', detail: 'ok' },
      { status: 'pass' as const, label: 'B' },
      { status: 'pass' as const, label: 'C' },
      { status: 'warn' as const, label: 'D', detail: 'be careful' },
      { status: 'warn' as const, label: 'E' },
      { status: 'fail' as const, label: 'F', detail: 'broken' },
    ]
    const lines = captureLog(() => printCheckList(rows))
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('3 ok')
    expect(allText).toContain('2 warns')
    expect(allText).toContain('1 fail')
  })

  it('uses "warn" (singular) when exactly one warning', () => {
    const rows = [
      { status: 'pass' as const, label: 'A' },
      { status: 'warn' as const, label: 'B' },
    ]
    const lines = captureLog(() => printCheckList(rows))
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('1 warn')
    expect(allText).not.toContain('1 warns')
  })

  it('allRows param controls tally counts when display rows are filtered', () => {
    // Quiet-mode: display only fails/warns, but tally uses full row set
    const displayRows = [
      { status: 'warn' as const, label: 'D', detail: 'be careful' },
    ]
    const allRows = [
      { status: 'pass' as const, label: 'A' },
      { status: 'pass' as const, label: 'B' },
      { status: 'warn' as const, label: 'D', detail: 'be careful' },
    ]
    const lines = captureLog(() => printCheckList(displayRows, allRows))
    const allText = lines.map(stripAnsi).join('\n')
    // Only 1 warn displayed but tally shows counts from all 3 rows
    expect(allText).toContain('2 ok')
    expect(allText).toContain('1 warn')
    // Only the warn row should be in the displayed rows section
    expect(allText).not.toContain('A')
    expect(allText).toContain('D')
  })

  it('prints the exit-code legend', () => {
    const rows = [{ status: 'pass' as const, label: 'X' }]
    const lines = captureLog(() => printCheckList(rows))
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('Exit codes:')
  })

  it('prints one row per check', () => {
    const rows = [
      { status: 'pass' as const, label: 'one' },
      { status: 'warn' as const, label: 'two' },
      { status: 'fail' as const, label: 'three' },
    ]
    const lines = captureLog(() => printCheckList(rows))
    // 3 rows + blank line + tally + legend = 6 lines minimum
    expect(lines.length).toBeGreaterThanOrEqual(6)
  })
})

// ---------------------------------------------------------------------------
// printInstallSummary()
// ---------------------------------------------------------------------------

describe('printInstallSummary', () => {
  it('categorizes files correctly', () => {
    const lines = captureLog(() =>
      printInstallSummary({
        anvilHome: '/home/user/.anvil',
        version: '0.2.1+local',
        filesWritten: [
          'skills/a.md',
          'skills/b.md',
          'agents/b.md',
          'hooks/c.json',
          'bin/anvil.cjs',
        ],
      }),
    )
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toMatch(/skills\s+2 files/)
    expect(allText).toMatch(/agents\s+1 file/)
    expect(allText).toMatch(/hooks\s+1 file/)
    expect(allText).toMatch(/bin\s+1 file/)
  })

  it('shows the version and location', () => {
    const lines = captureLog(() =>
      printInstallSummary({
        anvilHome: '/home/user/.anvil',
        version: '0.2.1+abc123',
        filesWritten: [],
      }),
    )
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('0.2.1+abc123')
    expect(allText).toContain('/home/user/.anvil')
  })

  it('prints the next-step hint', () => {
    const lines = captureLog(() =>
      printInstallSummary({
        anvilHome: '/home/user/.anvil',
        version: '0.2.1',
        filesWritten: [],
      }),
    )
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('anvil doctor')
  })

  it('prints per-target status when targets supplied', () => {
    const lines = captureLog(() =>
      printInstallSummary({
        anvilHome: '/home/user/.anvil',
        version: '0.2.1',
        filesWritten: [],
        targets: [
          { id: 'cc-user', status: 'wrote' },
          { id: 'oc-user', status: 'skipped', detail: 'not requested' },
        ],
      }),
    )
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('cc-user')
    expect(allText).toContain('oc-user')
    expect(allText).toContain('skipped')
  })
})

// ---------------------------------------------------------------------------
// printRemovalSummary()
// ---------------------------------------------------------------------------

describe('printRemovalSummary', () => {
  it('groups paths by parent directory', () => {
    const lines = captureLog(() =>
      printRemovalSummary({
        removed: ['skills/a.md', 'skills/b.md', 'agents/x.md'],
      }),
    )
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('skills/')
    expect(allText).toContain('2 files')
    expect(allText).toContain('agents/')
    expect(allText).toContain('1 file')
  })

  it('handles empty removal gracefully', () => {
    const lines = captureLog(() => printRemovalSummary({ removed: [] }))
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('Nothing removed')
  })

  it('shows total count', () => {
    const lines = captureLog(() =>
      printRemovalSummary({ removed: ['a/b.md', 'a/c.md', 'b/d.md'] }),
    )
    const allText = lines.map(stripAnsi).join('\n')
    expect(allText).toContain('Total: 3 removed')
  })
})

// ---------------------------------------------------------------------------
// No-color mode
// ---------------------------------------------------------------------------

describe('no-color mode', () => {
  let originalLevel: number

  beforeEach(() => {
    originalLevel = chalk.level
    chalk.level = 0
  })

  afterEach(() => {
    chalk.level = originalLevel
  })

  it('badge produces no ANSI escapes when chalk.level=0', () => {
    expect(badge('pass')).not.toContain('\x1b[')
    expect(badge('warn')).not.toContain('\x1b[')
    expect(badge('fail')).not.toContain('\x1b[')
  })

  it('printCheckList output contains no ANSI escapes when chalk.level=0', () => {
    const rows = [
      { status: 'pass' as const, label: 'A' },
      { status: 'warn' as const, label: 'B' },
      { status: 'fail' as const, label: 'C' },
    ]
    const lines = captureLog(() => printCheckList(rows))
    for (const line of lines) {
      expect(line).not.toContain('\x1b[')
    }
  })

  it('printInstallSummary output contains no ANSI escapes when chalk.level=0', () => {
    const lines = captureLog(() =>
      printInstallSummary({
        anvilHome: '/tmp/.anvil',
        version: '1.0.0',
        filesWritten: ['skills/a.md', 'agents/b.md'],
      }),
    )
    for (const line of lines) {
      expect(line).not.toContain('\x1b[')
    }
  })
})
