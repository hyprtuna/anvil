import { describe, expect, it } from 'vitest'
import {
  type HookSafetyInput,
  computeHookSafetyCoverage,
} from '../../../../src/commands/cli/common/hook-safety-check.js'
import { getHookSafetyRecords } from '../../../../src/hooks/load-all.js'

/**
 * ANV-0051 (hooks only) — Hook safety annotations (MCP-canonical 4-tuple).
 *
 * ANV-0216: Agent safety coverage retired — the 4-tuple is not consumed by
 * any agent dispatcher. Hook coverage continues unchanged.
 *
 * Uses the production loader (getHookSafetyRecords) so that changes to the
 * defaults registry are automatically reflected here.
 */

// ─── computeHookSafetyCoverage tests ─────────────────────────────────────────

describe('computeHookSafetyCoverage', () => {
  it('returns pass for live hook DEFAULTS — all hooks are annotated', () => {
    const hooks = getHookSafetyRecords()
    const r = computeHookSafetyCoverage(hooks)
    expect(r.status).toBe('pass')
    expect(r.covered).toBe(r.total)
    expect(r.contradictory).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('live hook DEFAULTS are non-empty', () => {
    expect(getHookSafetyRecords().length).toBeGreaterThan(0)
  })

  it('returns warn when a hook is missing safety annotations', () => {
    const hooks: HookSafetyInput[] = [{ name: 'unannotated-hook' }]
    const r = computeHookSafetyCoverage(hooks)
    expect(r.status).toBe('warn')
    expect(r.covered).toBe(0)
    expect(r.missing).toContain('unannotated-hook')
  })

  it('returns skip when no hooks provided', () => {
    const r = computeHookSafetyCoverage([])
    expect(r.status).toBe('skip')
  })

  it('flags contradictory hook annotations', () => {
    const hooks: HookSafetyInput[] = [
      {
        name: 'bad-hook',
        safety: {
          readOnlyHint: true,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
    ]
    const r = computeHookSafetyCoverage(hooks)
    expect(r.contradictory).toContain('bad-hook')
  })

  it('requires all four fields for full coverage (warn if any missing)', () => {
    const hooks: HookSafetyInput[] = [
      {
        name: 'partial',
        safety: {
          readOnlyHint: true,
          destructiveHint: false,
          // idempotentHint and openWorldHint intentionally absent
        },
      },
    ]
    const r = computeHookSafetyCoverage(hooks)
    expect(r.status).toBe('warn')
    expect(r.covered).toBe(0)
    expect(r.missing).toContain('partial')
  })
})
