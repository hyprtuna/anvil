import { describe, expect, it } from 'vitest'
import {
  ValidationAssertion,
  ValidationEntry,
  ValidationMap,
} from '../../../src/core/types.js'

describe('ValidationMap Zod schema', () => {
  const validAssertion = {
    description: 'Exit code is 0',
    expected_signal: 'exit code 0',
  }

  const validEntry = {
    task_id: 'C2',
    test_command: 'npm test -- **/c2*.test.ts',
    file_paths: ['tests/unit/core/validation-schema.test.ts'],
    assertions: [validAssertion],
  }

  const validMap = {
    plan_path:
      '.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md',
    generated_at: new Date().toISOString(),
    detected_runners: ['vitest'],
    entries: [validEntry],
    uncovered_tasks: [],
  }

  // ─── ValidationAssertion ───────────────────────────────────────────────────

  it('parses a valid ValidationAssertion', () => {
    const a = ValidationAssertion.parse(validAssertion)
    expect(a.description).toBe('Exit code is 0')
    expect(a.expected_signal).toBe('exit code 0')
  })

  it('parses ValidationAssertion without expected_signal', () => {
    const a = ValidationAssertion.parse({ description: 'No diff output' })
    expect(a.expected_signal).toBeUndefined()
  })

  it('rejects ValidationAssertion with empty description', () => {
    expect(() => ValidationAssertion.parse({ description: '' })).toThrow()
  })

  // ─── ValidationEntry ───────────────────────────────────────────────────────

  it('parses a valid ValidationEntry', () => {
    const e = ValidationEntry.parse(validEntry)
    expect(e.task_id).toBe('C2')
    expect(e.test_command).toBe('npm test -- **/c2*.test.ts')
    expect(e.file_paths).toHaveLength(1)
    expect(e.assertions).toHaveLength(1)
  })

  it('applies default empty arrays for file_paths and assertions', () => {
    const e = ValidationEntry.parse({
      task_id: 'A1',
      test_command: 'npm test',
    })
    expect(e.file_paths).toEqual([])
    expect(e.assertions).toEqual([])
  })

  it('rejects ValidationEntry with empty task_id', () => {
    expect(() =>
      ValidationEntry.parse({ task_id: '', test_command: 'npm test' }),
    ).toThrow()
  })

  it('rejects ValidationEntry with empty test_command', () => {
    expect(() =>
      ValidationEntry.parse({ task_id: 'A1', test_command: '' }),
    ).toThrow()
  })

  it('rejects ValidationEntry missing task_id', () => {
    expect(() => ValidationEntry.parse({ test_command: 'npm test' })).toThrow()
  })

  // ─── ValidationMap ─────────────────────────────────────────────────────────

  it('parses a valid ValidationMap', () => {
    const m = ValidationMap.parse(validMap)
    expect(m.plan_path).toBe(
      '.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md',
    )
    expect(m.detected_runners).toEqual(['vitest'])
    expect(m.entries).toHaveLength(1)
    expect(m.uncovered_tasks).toEqual([])
  })

  it('applies defaults for optional arrays', () => {
    const m = ValidationMap.parse({
      plan_path: 'docs/plan.md',
      generated_at: new Date().toISOString(),
    })
    expect(m.detected_runners).toEqual([])
    expect(m.entries).toEqual([])
    expect(m.uncovered_tasks).toEqual([])
  })

  it('parses a map with uncovered tasks', () => {
    const m = ValidationMap.parse({
      plan_path: 'docs/plan.md',
      generated_at: new Date().toISOString(),
      uncovered_tasks: ['D1', 'D2'],
    })
    expect(m.uncovered_tasks).toEqual(['D1', 'D2'])
  })

  it('rejects a map with empty plan_path', () => {
    expect(() =>
      ValidationMap.parse({
        plan_path: '',
        generated_at: new Date().toISOString(),
      }),
    ).toThrow()
  })

  it('rejects a map missing plan_path', () => {
    expect(() =>
      ValidationMap.parse({ generated_at: new Date().toISOString() }),
    ).toThrow()
  })

  it('rejects a map with invalid generated_at (not ISO datetime)', () => {
    expect(() =>
      ValidationMap.parse({
        plan_path: 'docs/plan.md',
        generated_at: 'not-a-date',
      }),
    ).toThrow()
  })

  it('rejects malformed entries (entry missing test_command)', () => {
    expect(() =>
      ValidationMap.parse({
        plan_path: 'docs/plan.md',
        generated_at: new Date().toISOString(),
        entries: [{ task_id: 'A1' }],
      }),
    ).toThrow()
  })
})
