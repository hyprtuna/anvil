import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Plan 39 D-04 chain: brainstorm-spec → plan-writing → subagent-execution → finishing-branch
// (subagent-executor → subagent-execution slug rename in v0.10.3 Plan 40 Group A)
// Each link declares its REQUIRED SUB-SKILL inline; finishing-branch closes with CHAIN END.
const chain = [
  {
    skill: 'brainstorm-spec',
    next: 'plan-writing',
    // ANV-0083: subdir form to colocate assumptions-surfacer prompt body.
    path: 'skills/universal/brainstorm-spec/SKILL.md',
  },
  {
    skill: 'plan-writing',
    next: 'subagent-execution',
    // ANV-0189: plan-writing moved to subdir form to colocate anvil-addendum.md
    path: 'skills/universal/plan-writing/SKILL.md',
  },
  {
    skill: 'subagent-execution',
    next: 'finishing-branch',
    path: 'skills/universal/subagent-execution.md',
  },
] as const

const finishingBranch = readFileSync(
  'skills/universal/finishing-branch.md',
  'utf-8',
)

describe('skills/universal — REQUIRED SUB-SKILL chain (Plan 39 Phase A, D-04)', () => {
  for (const link of chain) {
    describe(`${link.skill} → ${link.next}`, () => {
      const body = readFileSync(link.path, 'utf-8')

      it(`declares "## REQUIRED SUB-SKILL: ${link.next}" as a heading`, () => {
        expect(body).toContain(`## REQUIRED SUB-SKILL: ${link.next}`)
      })

      it('references the full chain by name in the marker block', () => {
        expect(body).toMatch(
          /brainstorm-spec\s*(→|->)\s*plan-writing\s*(→|->)\s*subagent-execution\s*(→|->)\s*finishing-branch/,
        )
      })

      it(`places the marker after the skill's primary handoff section`, () => {
        // Marker must be in the second half of the file (after the body content).
        const lines = body.split('\n')
        const markerLineIdx = lines.findIndex((l) =>
          l.startsWith(`## REQUIRED SUB-SKILL: ${link.next}`),
        )
        expect(markerLineIdx).toBeGreaterThan(lines.length / 2)
      })
    })
  }

  describe('finishing-branch (chain terminator)', () => {
    it('declares "## CHAIN END — return to user"', () => {
      expect(finishingBranch).toContain('## CHAIN END — return to user')
    })

    it('does NOT declare a "## REQUIRED SUB-SKILL" marker (chain terminates here)', () => {
      expect(finishingBranch).not.toMatch(/^## REQUIRED SUB-SKILL:/m)
    })

    it('explicitly tells the model to return control to the user', () => {
      expect(finishingBranch).toMatch(
        /return\s+control\s+to\s+the\s+user|return\s+to\s+the\s+user/i,
      )
    })
  })

  describe('chain integrity', () => {
    it('every non-terminal link points at the next link by exact name', () => {
      // Sanity: the chain[i].next must equal chain[i+1].skill.
      for (let i = 0; i < chain.length - 1; i++) {
        expect(chain[i].next).toBe(chain[i + 1].skill)
      }
    })

    it('the last non-terminal link points at finishing-branch (the terminator)', () => {
      expect(chain[chain.length - 1].next).toBe('finishing-branch')
    })
  })
})
