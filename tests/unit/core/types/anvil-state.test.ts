import { describe, expect, it } from 'vitest'
import { AnvilState } from '../../../../src/core/types.js'

const BASE_STATE = {
  schema_version: 1 as const,
  updated_at: '2026-04-26T12:00:00.000Z',
}

describe('AnvilState', () => {
  it('parses a minimal valid state with all defaults applied', () => {
    const result = AnvilState.parse(BASE_STATE)
    expect(result.schema_version).toBe(1)
    expect(result.phase).toBe('none') // default
    expect(result.completed_tasks).toEqual([]) // default
    expect(result.pending_tasks).toEqual([]) // default
    expect(result.updated_at).toBe('2026-04-26T12:00:00.000Z')
  })

  it('schema_version must be the literal 1 — rejects 2', () => {
    expect(() =>
      AnvilState.parse({ ...BASE_STATE, schema_version: 2 }),
    ).toThrow()
  })

  it('schema_version must be the literal 1 — rejects string "1"', () => {
    expect(() =>
      AnvilState.parse({ ...BASE_STATE, schema_version: '1' }),
    ).toThrow()
  })

  it('phase defaults to "none" when not provided', () => {
    const result = AnvilState.parse(BASE_STATE)
    expect(result.phase).toBe('none')
  })

  it('accepts every valid phase enum value', () => {
    const phases = [
      'research',
      'spec',
      'plan',
      'tasks',
      'implement',
      'verify',
      'review',
      'finish',
      'none',
    ] as const
    for (const phase of phases) {
      const result = AnvilState.parse({ ...BASE_STATE, phase })
      expect(result.phase).toBe(phase)
    }
  })

  it('rejects an invalid phase value', () => {
    expect(() => AnvilState.parse({ ...BASE_STATE, phase: 'deploy' })).toThrow()
  })

  it('optional fields are absent when not provided', () => {
    const result = AnvilState.parse(BASE_STATE)
    expect(result.feature_slug).toBeUndefined()
    expect(result.current_task).toBeUndefined()
    expect(result.last_command).toBeUndefined()
  })

  it('accepts all optional string fields', () => {
    const result = AnvilState.parse({
      ...BASE_STATE,
      feature_slug: 'my-feature',
      current_task: 'Phase A — Type foundations',
      last_command: 'anvil plan my-feature',
    })
    expect(result.feature_slug).toBe('my-feature')
    expect(result.current_task).toBe('Phase A — Type foundations')
    expect(result.last_command).toBe('anvil plan my-feature')
  })

  it('accepts completed_tasks and pending_tasks arrays', () => {
    const result = AnvilState.parse({
      ...BASE_STATE,
      completed_tasks: ['Phase A', 'Phase B'],
      pending_tasks: ['Phase C', 'Phase D'],
    })
    expect(result.completed_tasks).toEqual(['Phase A', 'Phase B'])
    expect(result.pending_tasks).toEqual(['Phase C', 'Phase D'])
  })

  it('round-trips through parse — output re-parses to same shape', () => {
    const input = {
      schema_version: 1 as const,
      feature_slug: 'sdd-layer',
      phase: 'implement' as const,
      current_task: 'Wire resolver',
      completed_tasks: ['Phase A'],
      pending_tasks: ['Phase B'],
      last_command: 'anvil implement',
      updated_at: '2026-04-26T15:30:00.000Z',
    }
    const first = AnvilState.parse(input)
    const second = AnvilState.parse(first)
    expect(second).toEqual(first)
  })

  it('requires updated_at — rejects when absent', () => {
    const { updated_at: _, ...withoutUpdatedAt } = BASE_STATE
    expect(() => AnvilState.parse(withoutUpdatedAt)).toThrow()
  })
})
