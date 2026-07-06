import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Plan 40 Phase F — anti-sycophancy in code-reviewer agent.
 *
 * The body must:
 *   - NOT contain banned praise-sandwich phrasing
 *   - PRESERVE the severity-graded review rubric (Plan 30) and confidence
 *     threshold (>=80%) and ReviewReport schema mention
 */

const BANNED_PATTERNS: { name: string; pattern: RegExp }[] = [
  {
    name: 'always acknowledge what was done well',
    pattern: /always acknowledge what was done well/i,
  },
  { name: 'highlight strengths first', pattern: /highlight strengths first/i },
  { name: 'lead with positives', pattern: /lead with (the )?positives?/i },
  { name: 'open with praise', pattern: /open with praise/i },
  { name: 'compliment sandwich', pattern: /compliment sandwich/i },
  // Strengths section template — removed in v0.10.3.
  { name: '## Strengths section template', pattern: /^##\s*Strengths\s*$/m },
]

// The agent uses a 3-level rubric (Critical / Important / Suggestion); the
// fine-grained 5-level taxonomy (CRITICAL / MAJOR / MINOR / NIT / QUESTION)
// lives in the renamed code-review skill, not the agent.
const PRESERVED_MARKERS = [
  'Critical',
  'Important',
  'Suggestion',
  'review_type',
  'ReviewReport',
  'confidence',
  'min_confidence',
]

describe('agents/code-reviewer — anti-sycophancy (Plan 40 Phase F)', () => {
  const body = readFileSync('agents/code-reviewer.md', 'utf-8')

  for (const { name, pattern } of BANNED_PATTERNS) {
    it(`body does NOT contain "${name}"`, () => {
      expect(pattern.test(body), `banned pattern present: ${name}`).toBe(false)
    })
  }

  for (const marker of PRESERVED_MARKERS) {
    it(`body still contains rubric marker "${marker}"`, () => {
      expect(body).toContain(marker)
    })
  }

  it('body explicitly opts out of praise sandwich', () => {
    expect(body).toMatch(/No praise sandwich/i)
  })
})
