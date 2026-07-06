/**
 * ANV-0083 — Collapsed-agent prompt file existence and shape.
 *
 * Four single-use review/audit agents were collapsed into sibling
 * Task(general-purpose) prompts under their consuming skill's subdirectory:
 *
 *   assumptions-surfacer  → skills/universal/brainstorm-spec/
 *   comment-analyzer      → skills/universal/code-review/
 *   type-design-analyzer  → skills/universal/code-review/
 *   retroactive-validator → skills/universal/plan-verification/
 *
 * This test asserts each prompt file exists, contains the expected
 * dispatch-pattern note, opens/closes with the four-state status markers,
 * and the consuming SKILL.md references the prompt.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface CollapsedPrompt {
  readonly former_agent: string
  readonly consumer_skill: string
  readonly prompt_path: string
  readonly skill_path: string
}

const COLLAPSED: ReadonlyArray<CollapsedPrompt> = [
  {
    former_agent: 'assumptions-surfacer',
    consumer_skill: 'brainstorm-spec',
    prompt_path:
      'skills/universal/brainstorm-spec/assumptions-surfacer-prompt.md',
    skill_path: 'skills/universal/brainstorm-spec/SKILL.md',
  },
  {
    former_agent: 'comment-analyzer',
    consumer_skill: 'code-review',
    prompt_path: 'skills/universal/code-review/comment-analyzer-prompt.md',
    skill_path: 'skills/universal/code-review/SKILL.md',
  },
  {
    former_agent: 'type-design-analyzer',
    consumer_skill: 'code-review',
    prompt_path: 'skills/universal/code-review/type-design-analyzer-prompt.md',
    skill_path: 'skills/universal/code-review/SKILL.md',
  },
  {
    former_agent: 'retroactive-validator',
    consumer_skill: 'plan-verification',
    prompt_path:
      'skills/universal/plan-verification/retroactive-validator-prompt.md',
    skill_path: 'skills/universal/plan-verification/SKILL.md',
  },
]

describe('collapsed-agent sibling prompts', () => {
  for (const row of COLLAPSED) {
    describe(`${row.former_agent} → ${row.consumer_skill}`, () => {
      it('prompt file exists at the documented path', () => {
        expect(
          existsSync(row.prompt_path),
          `missing prompt file: ${row.prompt_path}`,
        ).toBe(true)
      })

      it('prompt body contains the Task(general-purpose) dispatch note', () => {
        const body = readFileSync(row.prompt_path, 'utf-8')
        expect(body).toContain('Task(general-purpose)')
      })

      it(`prompt opens with the "${row.former_agent} starting" status marker`, () => {
        const body = readFileSync(row.prompt_path, 'utf-8')
        expect(body).toContain(`## Status: ${row.former_agent} starting`)
      })

      it(`prompt closes with the "${row.former_agent} done" status marker`, () => {
        const body = readFileSync(row.prompt_path, 'utf-8')
        expect(body).toContain(`## Status: ${row.former_agent} done`)
        expect(body).toMatch(/status:\s*DONE/)
      })

      it('consuming SKILL.md references the sibling prompt file', () => {
        const skillBody = readFileSync(row.skill_path, 'utf-8')
        const promptBasename = row.prompt_path.split('/').pop()
        expect(skillBody).toContain(promptBasename ?? '')
      })

      it('former agent file no longer exists in agents/', () => {
        expect(
          existsSync(`agents/${row.former_agent}.md`),
          `agents/${row.former_agent}.md should be removed`,
        ).toBe(false)
      })
    })
  }
})
