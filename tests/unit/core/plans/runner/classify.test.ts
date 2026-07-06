/**
 * ANV-0025 Wave 4 — error classification unit tests.
 *
 * Validates the binary "retry vs escalate" decision the runner uses
 * to handle task failures per GSD phase-runner.ts:91-311.
 */

import { describe, expect, it } from 'vitest'
import { classifyError } from '../../../../../src/core/plans/runner/classify.js'

describe('classifyError — explicit caller tag wins', () => {
  it('caller tag "transient" overrides message text', () => {
    expect(
      classifyError({
        taskId: 'A1',
        attempt: 1,
        error: { message: 'assertion failed', classification: 'transient' },
      }),
    ).toBe('transient')
  })

  it('caller tag "deterministic" overrides message text', () => {
    expect(
      classifyError({
        taskId: 'A1',
        attempt: 1,
        error: { message: 'connection reset', classification: 'deterministic' },
      }),
    ).toBe('deterministic')
  })

  it('caller tag "gate-required" wins immediately', () => {
    expect(
      classifyError({
        taskId: 'A1',
        attempt: 1,
        error: { message: 'whatever', classification: 'gate-required' },
      }),
    ).toBe('gate-required')
  })

  it('accepts the underscore variant "gate_required"', () => {
    expect(
      classifyError({
        taskId: 'A1',
        attempt: 1,
        error: { message: 'whatever', classification: 'gate_required' },
      }),
    ).toBe('gate-required')
  })
})

describe('classifyError — pattern-based fallback', () => {
  it.each([
    ['operation timeout', 'transient'],
    ['ECONNRESET socket', 'transient'],
    ['rate limit exceeded 429', 'transient'],
    ['503 service unavailable', 'transient'],
    ['service is temporarily down', 'transient'],
    ['detected a flake', 'transient'],
  ])('"%s" → %s', (message, expected) => {
    expect(
      classifyError({ taskId: 'A1', attempt: 1, error: { message } }),
    ).toBe(expected)
  })

  it.each([
    ['assertion failed: value mismatch', 'deterministic'],
    ['SyntaxError: unexpected token', 'deterministic'],
    ['TypeError: x is undefined', 'deterministic'],
    ['typecheck failed at src/foo.ts', 'deterministic'],
    ['compile error in src/bar.ts', 'deterministic'],
    ['ENOENT: no such file or directory', 'deterministic'],
    ['cannot find module "foo"', 'deterministic'],
  ])('"%s" → %s', (message, expected) => {
    expect(
      classifyError({ taskId: 'A1', attempt: 1, error: { message } }),
    ).toBe(expected)
  })

  it('unmatched message → gate-required (conservative default)', () => {
    expect(
      classifyError({
        taskId: 'A1',
        attempt: 1,
        error: { message: 'something weird happened' },
      }),
    ).toBe('gate-required')
  })

  it('absent error → gate-required', () => {
    expect(classifyError({ taskId: 'A1', attempt: 1 })).toBe('gate-required')
  })
})
