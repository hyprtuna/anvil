import { describe, expect, it } from 'vitest'
import { pushGeneratedFileGuardCheck } from '../../../../src/commands/cli/doctor.js'

/**
 * ANV-0054 — Generated-file guard coverage doctor row.
 *
 * Verifies that the pushGeneratedFileGuardCheck function produces the
 * expected pass/warn/skip rows based on handler opt-in state.
 */

describe('pushGeneratedFileGuardCheck', () => {
  it('reports pass when all disk-mutating handlers have respectGenerated', async () => {
    const checks: Array<{
      name: string
      status: 'pass' | 'warn' | 'fail' | 'skip'
      detail: string
    }> = []
    await pushGeneratedFileGuardCheck(checks)
    const row = checks.find((c) => c.name === 'Generated-file guard coverage')
    expect(row).toBeDefined()
    // All 3 handlers (session-start, session-end, pre-compact) must opt in.
    expect(row?.status).toBe('pass')
    expect(row?.detail).toContain('3/3')
  })
})
