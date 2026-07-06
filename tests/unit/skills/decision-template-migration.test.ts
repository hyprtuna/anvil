import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ANV-0136 — Parity test for the 4 skills migrated to ${TEMPLATE:decisions}.
 *
 * Each skill must:
 *  - Declare 'decisions' in its frontmatter `templates:` array.
 *  - Render the `${TEMPLATE:decisions}` token in its body at the decision-
 *    emission point.
 *  - Still contain its pre-migration anchor strings so downstream agents
 *    that grep the skill text don't break.
 */

const REPO_ROOT = process.cwd()
const SKILLS = [
  {
    file: 'skills/universal/brainstorming.md',
    anchors: ['Phase 3: Propose Approaches', 'Phase 4: Refine'],
  },
  {
    file: 'skills/universal/plan-writing/SKILL.md',
    anchors: ['## No Placeholders Rule', '## Plan Structure'],
  },
  {
    file: 'skills/universal/architecture-decision-record.md',
    anchors: ['## ADR Format', '## Workflow', '## ADR Lifecycle'],
  },
  {
    file: 'skills/universal/framework-selection.md',
    anchors: ['## Evaluation Process', '## Output Format'],
  },
] as const

describe('skill migration parity', () => {
  for (const skill of SKILLS) {
    describe(skill.file, () => {
      const body = readFileSync(join(REPO_ROOT, skill.file), 'utf-8')

      it('declares decisions in frontmatter templates:', () => {
        const fmMatch = body.match(/^---\n([\s\S]*?)\n---/)
        expect(fmMatch).not.toBeNull()
        const fm = fmMatch?.[1] ?? ''
        // ANV-0206: `templates:` may be at root (pre-migration) or indented
        // under `x-anvil:` (post-migration). Accept either form.
        // Either `templates: [decisions]`, `[decisions, ...]`,
        // `[..., decisions]`, or a YAML list with `- decisions`.
        const hasInline =
          /^\s*templates\s*:\s*\[[^\]]*\bdecisions\b[^\]]*\]/m.test(fm)
        const hasBlock =
          /^\s*templates\s*:\s*\n(?:\s*-\s*[\w-]+\s*\n)*\s*-\s*decisions\s*\n/m.test(
            fm,
          )
        expect(hasInline || hasBlock).toBe(true)
      })

      it('renders ${TEMPLATE:decisions} in its body', () => {
        // Strip frontmatter so the test inspects body only.
        const fmEnd = body.indexOf('\n---\n', 4)
        const bodyOnly = fmEnd === -1 ? body : body.slice(fmEnd + 5)
        expect(bodyOnly).toContain('${TEMPLATE:decisions}')
      })

      for (const anchor of skill.anchors) {
        it(`preserves pre-migration anchor: "${anchor}"`, () => {
          expect(body).toContain(anchor)
        })
      }
    })
  }
})

describe('end-to-end render through resolveTemplate', () => {
  it('renders ${TEMPLATE:decisions} via the resolver chain for brainstorming', async () => {
    const { substituteTemplateRefs } = await import(
      '../../../src/core/templates/index.js'
    )
    const body = readFileSync(
      join(REPO_ROOT, 'skills/universal/brainstorming.md'),
      'utf-8',
    )
    const rendered = substituteTemplateRefs(body, {
      anvilRoot: REPO_ROOT,
    })
    // Substituted-in text from templates/decisions/default.md.
    expect(rendered).toContain('Each decision must contain four parts')
    // The token is gone after substitution.
    expect(rendered).not.toContain('${TEMPLATE:decisions}')
  })
})
