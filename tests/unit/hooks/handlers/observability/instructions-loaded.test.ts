import { describe, expect, it } from 'vitest'
import { buildInstructionsLoadedResult } from '../../../../../src/hooks/handlers/observability/instructions-loaded.js'

describe('buildInstructionsLoadedResult', () => {
  it('produces an info directive + snapshot from a rule list', () => {
    const fixed = new Date('2026-05-15T10:30:00.000Z')
    const result = buildInstructionsLoadedResult(
      [
        { name: 'AGENTS.md', bytes: 4096 },
        { name: '.claude/rules/anvil-routing.md', bytes: 1024 },
      ],
      fixed,
    )
    expect(result.snapshot).toEqual({
      capturedAt: fixed.toISOString(),
      totalBytes: 5120,
      sourceNames: ['AGENTS.md', '.claude/rules/anvil-routing.md'],
    })
    expect(result.directive.kind).toBe('instructions-loaded')
    expect(result.directive.severity).toBe('info')
    if (result.directive.kind === 'instructions-loaded') {
      expect(result.directive.payload.ruleCount).toBe(2)
      expect(result.directive.payload.totalBytes).toBe(5120)
      expect(result.directive.payload.sourceNames).toEqual([
        'AGENTS.md',
        '.claude/rules/anvil-routing.md',
      ])
    }
  })

  it('handles an empty rule list', () => {
    const result = buildInstructionsLoadedResult([])
    expect(result.snapshot.totalBytes).toBe(0)
    expect(result.snapshot.sourceNames).toEqual([])
    expect(result.directive.kind).toBe('instructions-loaded')
  })
})
