import { describe, expect, it } from 'vitest'
import {
  ANV_0023_OBSERVABILITY_HANDLER_NAMES,
  pushContextObservabilityHooksWiredCheck,
} from '../../../../src/commands/cli/doctor-checks/hooks.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

describe('context-observability/hooks-wired doctor row', () => {
  it('passes when all three observability handlers are registered', async () => {
    const checks: Check[] = []
    await pushContextObservabilityHooksWiredCheck(checks)
    expect(checks).toHaveLength(1)
    const row = checks[0]
    if (!row) throw new Error('expected a row')
    expect(row.name).toBe('context-observability/hooks-wired')
    expect(row.status).toBe('pass')
    expect(row.detail).toContain('3/3 observability handlers registered')
  })

  it('lists exactly the three handler names', () => {
    expect([...ANV_0023_OBSERVABILITY_HANDLER_NAMES].sort()).toEqual(
      [
        'observability:instructions-loaded',
        'observability:post-compact',
        'observability:pre-compact',
      ].sort(),
    )
  })
})
