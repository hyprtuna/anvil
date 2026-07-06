/**
 * ANV-0175 Phase C — parallelism-cap helper unit tests.
 *
 * Validates how `resolveParallelismCap` reads `ANVIL_PARALLELISM_CAP` and
 * applies bounds-checking. The default 5 is locked in to mirror the
 * orchestrator rule in skills/universal/orchestration.md.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARALLELISM_CAP,
  resolveParallelismCap,
} from '../../../../src/commands/cli/plan-run.js'

describe('resolveParallelismCap', () => {
  it('returns 5 by default when env is unset', () => {
    expect(resolveParallelismCap({})).toBe(DEFAULT_PARALLELISM_CAP)
    expect(DEFAULT_PARALLELISM_CAP).toBe(5)
  })

  it('honors a positive integer from the env', () => {
    expect(resolveParallelismCap({ ANVIL_PARALLELISM_CAP: '3' })).toBe(3)
    expect(resolveParallelismCap({ ANVIL_PARALLELISM_CAP: '12' })).toBe(12)
  })

  it('rejects zero and falls back to default', () => {
    expect(resolveParallelismCap({ ANVIL_PARALLELISM_CAP: '0' })).toBe(
      DEFAULT_PARALLELISM_CAP,
    )
  })

  it('rejects negative values and falls back to default', () => {
    expect(resolveParallelismCap({ ANVIL_PARALLELISM_CAP: '-1' })).toBe(
      DEFAULT_PARALLELISM_CAP,
    )
  })

  it('rejects non-numeric values and falls back to default', () => {
    expect(resolveParallelismCap({ ANVIL_PARALLELISM_CAP: 'abc' })).toBe(
      DEFAULT_PARALLELISM_CAP,
    )
    expect(resolveParallelismCap({ ANVIL_PARALLELISM_CAP: '' })).toBe(
      DEFAULT_PARALLELISM_CAP,
    )
  })
})
