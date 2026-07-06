import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Plan 40 Phase D — skill-vs-agent decision tree must render in two surfaces:
 *   - skills/universal/skill-orchestration.md   (teaching surface)
 *   - skills/universal/rules/orchestrator-first.md  (enforced directive)
 */

const FILES = [
  'skills/universal/skill-orchestration.md',
  'skills/universal/rules/orchestrator-first.md',
]

const HEADER = '## Decision tree — skill vs agent vs command'
const FRESH = 'Does this need a fresh context window?'
const DISCIPLINE = 'Is this a discipline / rule / methodology?'
const CLI = 'Is this a CLI / project-state action?'

describe('decision tree rendered (Plan 40 Phase D)', () => {
  for (const f of FILES) {
    describe(f, () => {
      const body = readFileSync(f, 'utf-8')
      it('contains decision-tree section header', () => {
        expect(body).toContain(HEADER)
      })
      it('contains "fresh context window" branch', () => {
        expect(body).toContain(FRESH)
      })
      it('contains "discipline / rule / methodology" branch', () => {
        expect(body).toContain(DISCIPLINE)
      })
      it('contains "CLI / project-state action" branch', () => {
        expect(body).toContain(CLI)
      })
    })
  }
})
