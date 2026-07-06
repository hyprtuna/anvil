/**
 * Plan 38 Phase D — Sub-D1 test:
 * Every CLI command in the audit list accepts `--tier` without error.
 * Verifies that the option type signatures allow `tier?: string`.
 *
 * ANV-0249: SpecOptions removed — anvil spec CLI deleted; SDD is /sdd-workflow skill.
 */
import { describe, expect, it } from 'vitest'
import type { DebugOptions } from '../../../../src/commands/cli/debug.js'
import type { PlanOptions } from '../../../../src/commands/cli/plan.js'
import type { ReviewOptions } from '../../../../src/commands/cli/review.js'
import type { UltraOptions } from '../../../../src/commands/cli/ultra.js'

// Type-level tests: verify each options interface accepts tier?: string
// These are compile-time checks that also run at runtime for safety.

describe('CLI --tier flag parity (Plan 38 Phase D audit)', () => {
  it('ReviewOptions accepts tier?: string', () => {
    const opts: ReviewOptions = { tier: 'ultra' }
    expect(opts.tier).toBe('ultra')
  })

  it('PlanOptions accepts tier?: string', () => {
    const opts: PlanOptions = { tier: 'planning' }
    expect(opts.tier).toBe('planning')
  })

  it('DebugOptions accepts tier?: string', () => {
    const opts: DebugOptions = { tier: 'coding' }
    expect(opts.tier).toBe('coding')
  })

  it('UltraOptions accepts tier?: string', () => {
    const opts: UltraOptions = { tier: 'ultra' }
    expect(opts.tier).toBe('ultra')
  })

  it('all options accept tier=undefined (field is optional)', () => {
    const review: ReviewOptions = {}
    const plan: PlanOptions = {}
    const debug: DebugOptions = {}
    const ultra: UltraOptions = {}
    expect(review.tier).toBeUndefined()
    expect(plan.tier).toBeUndefined()
    expect(debug.tier).toBeUndefined()
    expect(ultra.tier).toBeUndefined()
  })
})
