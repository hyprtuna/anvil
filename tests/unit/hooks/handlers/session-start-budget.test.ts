/**
 * ANV-0056 — Unit tests for SessionStart aggregate context budget.
 */
import { describe, expect, it } from 'vitest'
import {
  SESSION_START_BUDGET_CHARS,
  type SessionStartFragment,
  aggregateSessionStartContext,
} from '../../../../src/hooks/handlers/session-start/budget.js'

const frag = (
  name: string,
  priority: number,
  text: string,
): SessionStartFragment => ({ name, priority, systemInsert: text })

describe('aggregateSessionStartContext', () => {
  it('exports SESSION_START_BUDGET_CHARS = 6000', () => {
    expect(SESSION_START_BUDGET_CHARS).toBe(6000)
  })

  it('returns undefined aggregated when no fragments provided', () => {
    const result = aggregateSessionStartContext([])
    expect(result.aggregated).toBeUndefined()
    expect(result.truncated).toBe(false)
    expect(result.usedChars).toBe(0)
    expect(result.includedCount).toBe(0)
    expect(result.droppedCount).toBe(0)
  })

  it('AC: budget = 0 produces no SessionStart context (all fragments dropped)', () => {
    const fragments = [frag('h1', 0, 'content-a'), frag('h2', 0, 'content-b')]
    const result = aggregateSessionStartContext(fragments, 0)
    expect(result.aggregated).toBeUndefined()
    expect(result.truncated).toBe(true)
    expect(result.droppedCount).toBe(2)
    expect(result.includedCount).toBe(0)
  })

  it('single fragment under budget: included without separator or notice', () => {
    const result = aggregateSessionStartContext([frag('h1', 0, 'hello')], 6000)
    expect(result.aggregated).toBe('hello')
    expect(result.truncated).toBe(false)
    expect(result.usedChars).toBe(5)
    expect(result.includedCount).toBe(1)
    expect(result.droppedCount).toBe(0)
  })

  it('multiple fragments under budget: separated by double newline', () => {
    const result = aggregateSessionStartContext(
      [frag('h1', 1, 'part-one'), frag('h2', 0, 'part-two')],
      6000,
    )
    expect(result.aggregated).toBe('part-one\n\npart-two')
    expect(result.truncated).toBe(false)
    expect(result.includedCount).toBe(2)
    expect(result.droppedCount).toBe(0)
  })

  it('AC: budget = 6000, 4 handlers each emitting 2000 chars → 6000 chars + truncation notice', () => {
    const chunk = 'x'.repeat(2000)
    const fragments = [
      frag('h1', 3, chunk),
      frag('h2', 2, chunk),
      frag('h3', 1, chunk),
      frag('h4', 0, chunk),
    ]
    const result = aggregateSessionStartContext(fragments, 6000)

    // h1 (2000) + separator (2) + h2 (2000) = 4002; + separator (2) + h3 (2000) = 6004 > 6000
    // So h1 (2000) fits, h2 needs separator: 2000+2+2000=4002 fits, h3 needs 2+2000=2002 more → 6004 > 6000 → dropped
    // Actual: h1=2000, h1+sep+h2=4002, h1+sep+h2+sep+h3=6004 > 6000 → h3 dropped, h4 dropped
    expect(result.truncated).toBe(true)
    expect(result.includedCount).toBe(2)
    expect(result.droppedCount).toBe(2)
    expect(result.aggregated).toContain('[truncated to fit 6000 char budget]')
    // The first two chunks are present
    expect(result.usedChars).toBe(4002) // 2000 + 2 (sep) + 2000
  })

  it('priority ordering: high-priority fragment wins budget over low-priority', () => {
    const big = 'B'.repeat(4000)
    const small = 'S'.repeat(100)
    // h-low is listed first in array but has lower priority
    const result = aggregateSessionStartContext(
      [frag('h-low', 0, small), frag('h-high', 10, big)],
      5000,
    )
    // h-high (priority 10) comes first: 4000 chars
    // h-low (priority 0): 2 + 100 = 102; total 4102 <= 5000 → included
    expect(result.truncated).toBe(false)
    expect(result.aggregated).toBe(`${big}\n\n${small}`)
    expect(result.includedCount).toBe(2)
  })

  it('drops lowest-priority fragment when budget exhausted', () => {
    const large = 'L'.repeat(3000)
    // h1 priority 1, h2 priority 0 — h2 gets dropped
    const result = aggregateSessionStartContext(
      [frag('h2', 0, large), frag('h1', 1, large)],
      4000, // 3000 for h1 fits; 3000+2+3000=6002 > 4000 → h2 dropped
    )
    expect(result.truncated).toBe(true)
    expect(result.includedCount).toBe(1)
    expect(result.droppedCount).toBe(1)
    expect(result.aggregated).toContain('L'.repeat(3000))
    expect(result.aggregated).toContain('[truncated to fit 4000 char budget]')
  })

  it('empty systemInsert fragments are included for free (zero chars)', () => {
    const result = aggregateSessionStartContext(
      [frag('h1', 1, ''), frag('h2', 0, 'content')],
      6000,
    )
    expect(result.truncated).toBe(false)
    expect(result.includedCount).toBe(2)
    // Empty fragment contributes no visible content to aggregated
    expect(result.aggregated).toBe('content')
  })

  it('exact budget fit: no truncation notice', () => {
    // Fragment is exactly budgetChars characters
    const text = 'A'.repeat(100)
    const result = aggregateSessionStartContext([frag('h1', 0, text)], 100)
    expect(result.truncated).toBe(false)
    expect(result.aggregated).toBe(text)
    expect(result.usedChars).toBe(100)
  })

  it('one char over budget: fragment dropped, notice added', () => {
    const text = 'A'.repeat(101)
    const result = aggregateSessionStartContext([frag('h1', 0, text)], 100)
    expect(result.truncated).toBe(true)
    expect(result.droppedCount).toBe(1)
    expect(result.aggregated).toContain('[truncated to fit 100 char budget]')
    // No payload content — only the notice
    expect(result.aggregated).not.toContain('A')
  })
})
