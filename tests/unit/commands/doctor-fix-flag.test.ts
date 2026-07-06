import { describe, expect, it } from 'vitest'
import {
  FIXABLE_WARNS,
  planDoctorFixes,
} from '../../../src/commands/cli/doctor.js'

/**
 * Plan 42 Phase B — anvil doctor --fix and --dry-run.
 *
 * D-03: --fix runs the documented remediation per known warn row.
 * --dry-run prints without executing. fail rows are NEVER auto-fixed.
 */
describe('doctor — FIXABLE_WARNS table', () => {
  it('covers all 5 documented fixable warns', () => {
    expect(FIXABLE_WARNS).toHaveProperty(
      'CC project wiring (.claude/settings.json)',
    )
    expect(FIXABLE_WARNS).toHaveProperty(
      'CC statusline wiring (.claude/settings.json → statusLine)',
    )
    expect(FIXABLE_WARNS).toHaveProperty(
      'CC settings template (.claude/settings.json)',
    )
    expect(FIXABLE_WARNS).toHaveProperty(
      'OC project wiring (.opencode/opencode.json)',
    )
    expect(FIXABLE_WARNS).toHaveProperty(
      '.claude/rules/anvil-routing.md (standing instructions)',
    )
  })

  it('every entry is an executable command string', () => {
    for (const cmd of Object.values(FIXABLE_WARNS)) {
      expect(typeof cmd).toBe('string')
      expect(cmd).toMatch(/^anvil /)
    }
  })
})

describe('doctor — planDoctorFixes', () => {
  it('returns a remediation per fixable warn row', () => {
    const checks = [
      {
        name: 'CC project wiring (.claude/settings.json)',
        status: 'warn' as const,
        detail: 'not wired',
      },
      {
        name: 'CC statusline wiring (.claude/settings.json → statusLine)',
        status: 'warn' as const,
        detail: 'not wired',
      },
    ]
    const plan = planDoctorFixes(checks)
    expect(plan).toHaveLength(2)
    expect(plan[0].command).toBe('anvil init --scope project')
    expect(plan[1].command).toBe('anvil statusline install --scope project')
  })

  it('skips fail rows entirely (never auto-fix a fail)', () => {
    const checks = [
      {
        name: 'models.json registry references',
        status: 'fail' as const,
        detail: 'unknown skill: foo',
      },
    ]
    const plan = planDoctorFixes(checks)
    expect(plan).toHaveLength(0)
  })

  it('skips warns that are not in the FIXABLE_WARNS table', () => {
    const checks = [
      {
        name: 'Hook latency budget',
        status: 'warn' as const,
        detail: 'p95 over budget',
      },
    ]
    const plan = planDoctorFixes(checks)
    expect(plan).toHaveLength(0)
  })

  it('skips pass rows', () => {
    const checks = [
      {
        name: 'CC project wiring (.claude/settings.json)',
        status: 'pass' as const,
        detail: 'wired',
      },
    ]
    const plan = planDoctorFixes(checks)
    expect(plan).toHaveLength(0)
  })
})
