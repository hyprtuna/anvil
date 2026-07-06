import { describe, expect, it } from 'vitest'
import { parseDecisionsBlock } from '../../../../src/core/validation/decisions.js'

// ─── Fixture helpers ─────────────────────────────────────────────────────────

const BLOCK_TWO_DECISIONS = `
# Plan

Some intro text.

<decisions>
- id: D-001
  title: Use Zod for validation
  rationale: Consistent with existing types.ts conventions.

- id: D-002
  title: Parser in core/validation
  rationale: Pure function, no I/O — fits Layer 0.
</decisions>

## Phase A

D-001 is referenced here.
`

const BLOCK_SINGLE_DECISION = `
<decisions>
- id: review-vocab
  title: Standardise review vocabulary
  rationale: Prevents ambiguity between spec-compliance and code-quality passes.
</decisions>

The rest of the body does not mention review-vocab explicitly.
`

const NO_BLOCK = `
# Plan without decisions

A1. First task.
A2. Second task.
`

const MALFORMED_ENTRY = `
<decisions>
- id: D-001
  title: Valid entry
  rationale: Has all fields.

- id:
  title: Missing id value
  rationale: This entry should be skipped.

- title: No id at all
  rationale: Also skipped.
</decisions>
`

const CASE_INSENSITIVE = `
<DECISIONS>
- id: D-001
  title: Case test
  rationale: Tags are matched case-insensitively.
</DECISIONS>
`

const BLOCK_UPPERCASE_TAG = `
<Decisions>
- id: D-100
  title: Mixed case tag
  rationale: Should be parsed regardless of tag casing.
</Decisions>

D-100 referenced here.
`

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseDecisionsBlock', () => {
  describe('block present with multiple decisions', () => {
    it('returns all decisions', () => {
      const { decisions } = parseDecisionsBlock(BLOCK_TWO_DECISIONS)
      expect(decisions).toHaveLength(2)
      expect(decisions[0]?.id).toBe('D-001')
      expect(decisions[1]?.id).toBe('D-002')
    })

    it('removes the block from bodyWithoutBlock', () => {
      const { bodyWithoutBlock } = parseDecisionsBlock(BLOCK_TWO_DECISIONS)
      expect(bodyWithoutBlock).not.toContain('<decisions>')
      expect(bodyWithoutBlock).not.toContain('</decisions>')
    })

    it('preserves body text outside the block', () => {
      const { bodyWithoutBlock } = parseDecisionsBlock(BLOCK_TWO_DECISIONS)
      expect(bodyWithoutBlock).toContain('Some intro text.')
      expect(bodyWithoutBlock).toContain('D-001 is referenced here.')
    })
  })

  describe('block with single decision', () => {
    it('returns one decision', () => {
      const { decisions } = parseDecisionsBlock(BLOCK_SINGLE_DECISION)
      expect(decisions).toHaveLength(1)
      expect(decisions[0]?.id).toBe('review-vocab')
      expect(decisions[0]?.title).toBe('Standardise review vocabulary')
    })
  })

  describe('no block in markdown', () => {
    it('returns empty decisions array', () => {
      const { decisions } = parseDecisionsBlock(NO_BLOCK)
      expect(decisions).toEqual([])
    })

    it('returns the full markdown as bodyWithoutBlock', () => {
      const { bodyWithoutBlock } = parseDecisionsBlock(NO_BLOCK)
      expect(bodyWithoutBlock).toContain('A1. First task.')
    })
  })

  describe('malformed entries', () => {
    it('skips entries with empty or missing id', () => {
      const { decisions } = parseDecisionsBlock(MALFORMED_ENTRY)
      // Only the first entry is fully valid
      expect(decisions).toHaveLength(1)
      expect(decisions[0]?.id).toBe('D-001')
    })
  })

  describe('case-insensitive tag matching', () => {
    it('parses <DECISIONS> (all caps)', () => {
      const { decisions } = parseDecisionsBlock(CASE_INSENSITIVE)
      expect(decisions).toHaveLength(1)
      expect(decisions[0]?.id).toBe('D-001')
    })

    it('parses <Decisions> (mixed case)', () => {
      const { decisions } = parseDecisionsBlock(BLOCK_UPPERCASE_TAG)
      expect(decisions).toHaveLength(1)
      expect(decisions[0]?.id).toBe('D-100')
    })

    it('removes the mixed-case block from bodyWithoutBlock', () => {
      const { bodyWithoutBlock } = parseDecisionsBlock(BLOCK_UPPERCASE_TAG)
      expect(bodyWithoutBlock).not.toContain('<Decisions>')
      expect(bodyWithoutBlock).toContain('D-100 referenced here.')
    })
  })

  describe('field parsing', () => {
    it('populates title and rationale correctly', () => {
      const { decisions } = parseDecisionsBlock(BLOCK_TWO_DECISIONS)
      expect(decisions[0]?.title).toBe('Use Zod for validation')
      expect(decisions[0]?.rationale).toBe(
        'Consistent with existing types.ts conventions.',
      )
      expect(decisions[1]?.title).toBe('Parser in core/validation')
    })
  })
})
