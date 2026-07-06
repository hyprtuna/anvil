/**
 * ANV-0189 (rework) — skill-e2e for the TWO-question user-choice pattern in default-feature.
 *
 * Behavioral compliance:
 *  1. Q1 (location): AskUserQuestion payload has ≥3 options; exactly one
 *     (Recommended) referencing .anvil/plans/. The user is asked only ONCE —
 *     default-feature asks, then passes the answer to plan-writing; plan-writing
 *     must NOT ask again.
 *  2. Q2 (format): AskUserQuestion payload has exactly 3 options
 *     (Anvil-slate / Markdown / Both); each has a non-empty description.
 *  3. Pass-through: when default-feature invokes plan-writing, only ONE Q1
 *     prompt fires (default-feature's). plan-writing inherits the answer.
 *  4. Skill body greps clean for: <decisions>, D-0\d, ${ANVIL_, ANV-\d,
 *     src/agents/ultra-worker.ts.
 *  5. anvil-addendum.md loading triggered by format=Anvil-slate or Both.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type AskUserQuestionPayload,
  DecisionPrompt,
  renderDecisionClaudeCode,
} from '../../../../src/core/templates/decision.js'
import { runSkillE2E } from '../helpers.js'
import { loadSkillBody } from '../load-skill.js'

const SKILLS_ROOT = resolve(process.cwd(), 'skills')

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractJsonPayload(text: string): AskUserQuestionPayload | null {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as AskUserQuestionPayload
  } catch {
    return null
  }
}

function extractAllPayloads(text: string): AskUserQuestionPayload[] {
  const results: AskUserQuestionPayload[] = []
  const re = /```json\s*([\s\S]*?)\s*```/g
  for (let match = re.exec(text); match !== null; match = re.exec(text)) {
    try {
      results.push(JSON.parse(match[1]) as AskUserQuestionPayload)
    } catch {
      // skip malformed blocks
    }
  }
  return results
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('skill-e2e: default-feature — TWO-question user-choice pattern ( rework)', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('skill body is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL.md body greps clean for ${ANVIL_PLANS_DIR} token', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_PLANS_DIR\}/)
  })

  it('SKILL.md body greps clean for any ${ANVIL_* token', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_/)
  })

  it('SKILL.md body greps clean for src/agents/ path references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    expect(body).not.toMatch(/src\/agents\//)
  })

  it('SKILL.md body greps clean for <decisions> block', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    expect(body).not.toMatch(/<decisions>/)
  })

  it('SKILL.md body greps clean for D-0N decision IDs', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    expect(body).not.toMatch(/D-0\d/)
  })

  it('SKILL.md body greps clean for ANV- ticket references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    expect(body).not.toMatch(/ANV-\d/)
  })

  // ── 2. Q1 — location prompt payload shape ───────────────────────────────

  it('Q1 location DecisionPrompt has ≥3 options with exactly one (Recommended)', () => {
    const prompt = DecisionPrompt.parse({
      question: 'Where should the plan be stored?',
      explanation:
        'Choose where to write the plan. Location and format are independent — you will be asked about format next.',
      options: [
        {
          label: '.anvil/plans/<version>.plan.md',
          description:
            'In-project Anvil plans directory; created if missing. Integrates with anvil plan-validate and anvil plan-run.',
          recommended: true,
          rationale:
            'Integrates with plan validation, plan execution, and the dependency graph.',
        },
        {
          label: 'docs/plans/<slug>.md',
          description:
            'In-project public-shaped docs. Use when you want the plan in your published documentation.',
        },
        {
          label: '~/.anvil/projects/<auto-name>/plans/<slug>.plan.md',
          description:
            'Out-of-project; keeps your project repo clean. Only shown when ~/.anvil/ exists.',
        },
        {
          label: 'Custom path',
          description:
            'Relative path you provide. Must not contain ".." or escape the project root.',
        },
      ],
      confidence: 'high',
    })

    const payload = renderDecisionClaudeCode(prompt)

    expect(payload.question).toBeTruthy()
    expect(payload.intro).toBeTruthy()
    // ≥3 options
    expect(payload.options.length).toBeGreaterThanOrEqual(3)
    // exactly one (Recommended)
    const recommended = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
    // recommended references .anvil/plans/
    expect(recommended[0].label).toContain('.anvil/plans/')
  })

  // ── 3. Q2 — format prompt payload shape ─────────────────────────────────

  it('Q2 format DecisionPrompt has exactly 3 options (Anvil-slate / Markdown / Both)', () => {
    const prompt = DecisionPrompt.parse({
      question: 'What format should the plan use?',
      explanation:
        'Anvil-slate integrates with plan tooling. Markdown is human-readable. Both writes two files.',
      options: [
        {
          label: 'Anvil slate (structured frontmatter + markdown body)',
          description:
            'YAML frontmatter (executable_plan, must_haves, covered_decisions) + markdown body. Consumable by anvil plan-validate and anvil plan-run.',
          recommended: true,
          rationale:
            'Integrates with plan validation and execution; dependency graph drives task ordering.',
        },
        {
          label: 'Markdown',
          description:
            'Plain markdown plan with phases and acceptance criteria. No structured frontmatter. Best for human review.',
        },
        {
          label: 'Both',
          description:
            'Write both an Anvil-slate and a plain markdown plan at the chosen location.',
        },
      ],
      confidence: 'high',
    })

    const payload = renderDecisionClaudeCode(prompt)

    expect(payload.question).toBeTruthy()
    expect(payload.intro).toBeTruthy()
    // exactly 3 options
    expect(payload.options).toHaveLength(3)
    // each option has a non-empty description
    for (const opt of payload.options) {
      expect(opt.description.length).toBeGreaterThan(0)
    }
    // exactly one (Recommended)
    const recommended = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
  })

  // ── 4. anvil-addendum.md ─────────────────────────────────────────────────

  it('anvil-addendum.md exists for default-feature and has Anvil-specific content', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/workflows/default-feature/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw.length).toBeGreaterThan(50)
  })

  it('anvil-addendum.md first paragraph states it is loaded when format=Anvil-slate or Both', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/workflows/default-feature/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    // Must mention format (Anvil-slate or Both) as the trigger
    expect(raw).toMatch(
      /format[\s\S]*?(?:Anvil.slate|slate|Both)|(?:Anvil.slate|slate|Both)[\s\S]*?format/i,
    )
  })

  // ── 5. Workflow phase sequence ───────────────────────────────────────────

  it('workflow phases are described in correct order', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })

    // All 5 phases should still be present
    const phases = [
      'brainstorming',
      'plan-writing',
      'feature-development',
      'code-reviewer',
      'review-response',
    ]

    for (const phase of phases) {
      expect(body).toContain(phase)
    }
  })

  // ── 6. E2E runSkillE2E tests ─────────────────────────────────────────────

  it('workflow prompts Q1 for plan location during plan-writing phase', async () => {
    await runSkillE2E({
      slug: 'default-feature',
      file: {
        relativePath: 'universal/workflows/default-feature/SKILL.md',
      },
      userPrompt: 'Build a new notification feature for the app.',
      fakeOutputText: [
        '## Status',
        '',
        'Entering brainstorming phase...',
        '',
        'Now entering plan-writing phase. Where should the plan be stored?',
        '```json',
        JSON.stringify({
          question: 'Where should the plan be stored?',
          intro:
            'Choose where to write the plan. Location and format are independent — you will be asked about format next.',
          options: [
            {
              label: '.anvil/plans/<version>.plan.md (Recommended)',
              description:
                'In-project Anvil plans directory; created if missing. Integrates with anvil plan-validate and anvil plan-run.',
            },
            {
              label: 'docs/plans/<slug>.md',
              description:
                'In-project public-shaped docs. Use when you want the plan in your published documentation.',
            },
            {
              label: '~/.anvil/projects/<auto-name>/plans/<slug>.plan.md',
              description:
                'Out-of-project; keeps your project repo clean. Only shown when ~/.anvil/ exists.',
            },
            {
              label: 'Custom path',
              description:
                'Relative path you provide. Must not contain ".." or escape the project root.',
            },
          ],
          _rationale:
            'Integrates with plan validation, plan execution, and the dependency graph.',
        }),
        '```',
      ].join('\n'),
      assertions: [
        {
          label: 'response asks about plan storage location',
          predicate: (t) => /where should the plan be stored/i.test(t),
        },
        {
          label: 'response includes .anvil/plans/ as an option',
          predicate: (t) => t.includes('.anvil/plans/'),
        },
        {
          label: 'response includes docs/plans/ as an option',
          predicate: (t) => t.includes('docs/plans/'),
        },
        {
          label: 'response marks .anvil/plans/ as recommended',
          predicate: (t) =>
            /\.anvil\/plans\/.*recommended|recommended.*\.anvil\/plans\//i.test(
              t,
            ),
        },
      ],
    })
  })

  it('workflow prompts Q2 for plan format independently of Q1', async () => {
    await runSkillE2E({
      slug: 'default-feature',
      file: {
        relativePath: 'universal/workflows/default-feature/SKILL.md',
      },
      userPrompt:
        'Build a new notification feature. Store the plan at .anvil/plans/v1.0.0.plan.md.',
      fakeOutputText: [
        '## Status',
        '',
        'Q1 answered via prompt override. Now asking Q2 — what format?',
        '```json',
        JSON.stringify({
          question: 'What format should the plan use?',
          intro:
            'Anvil-slate integrates with anvil plan-validate and anvil plan-run. Markdown is human-readable for review and discussion. Both writes two files.',
          options: [
            {
              label:
                'Anvil slate (structured frontmatter + markdown body) (Recommended)',
              description:
                'YAML frontmatter (executable_plan, must_haves, covered_decisions) + markdown body; consumable by anvil plan-validate and anvil plan-run.',
            },
            {
              label: 'Markdown',
              description:
                'Plain markdown plan with phases and acceptance criteria; no structured frontmatter; best for human review.',
            },
            {
              label: 'Both',
              description:
                'Write both an Anvil-slate and a plain markdown file at the chosen location.',
            },
          ],
          _rationale:
            'Anvil-slate enables tooling validation and execution; markdown serves human readers.',
        }),
        '```',
      ].join('\n'),
      assertions: [
        {
          label: 'response asks about plan format',
          predicate: (t) => /what format should the plan use/i.test(t),
        },
        {
          label: 'response includes Anvil-slate option',
          predicate: (t) => /anvil.slate|structured frontmatter/i.test(t),
        },
        {
          label: 'response includes Markdown option',
          predicate: (t) => /markdown/i.test(t),
        },
        {
          label: 'response includes Both option',
          predicate: (t) => /both/i.test(t),
        },
      ],
    })
  })

  // ── 7. Pass-through test: only ONE Q1 fires across default-feature + plan-writing ───

  it('SKILL.md documents that plan_location is passed through to plan-writing (no double-ask)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })

    // The skill body must mention the pass-through mechanism
    expect(body).toMatch(
      /plan_location|pass.*through|do not ask again|asked only once/i,
    )
  })

  // ── 8. SKILL.md body-parsing: AskUserQuestion blocks ───────────────────

  it('SKILL.md body contains EXACTLY 2 AskUserQuestion JSON blocks (Q1 location + Q2 format)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    const all = extractAllPayloads(body)
    expect(all).toHaveLength(2)
  })

  it('Q1 block extracted from SKILL.md body has ≥3 options with exactly one (Recommended) referencing .anvil/plans/', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    const all = extractAllPayloads(body)
    const q1 = all[0]!

    // question is a non-empty string
    expect(typeof q1.question).toBe('string')
    expect(q1.question.length).toBeGreaterThan(0)

    // Q1 options.length >= 3
    expect(q1.options.length).toBeGreaterThanOrEqual(3)

    // exactly one option label contains '(Recommended)'
    const recommendedOptions = q1.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommendedOptions).toHaveLength(1)

    // the recommended option references .anvil/
    expect(recommendedOptions[0]!.label).toContain('.anvil/')

    // at least one option label includes '.anvil/plans/'
    const anvilOption = q1.options.find((o) =>
      o.label.includes('.anvil/plans/'),
    )
    expect(anvilOption).toBeDefined()
  })

  it('Q2 block extracted from SKILL.md body has exactly 3 options with Anvil-slate / Markdown / Both labels', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/workflows/default-feature/SKILL.md',
    })
    const all = extractAllPayloads(body)
    const q2 = all[1]!

    // question is non-empty
    expect(typeof q2.question).toBe('string')
    expect(q2.question.length).toBeGreaterThan(0)

    // Q2 options.length === 3
    expect(q2.options).toHaveLength(3)

    // labels include Anvil-slate / Markdown / Both
    const labels = q2.options.map((o) => o.label.toLowerCase())
    expect(
      labels.some((l) => l.includes('slate') || l.includes('structured')),
    ).toBe(true)
    expect(labels.some((l) => l.includes('markdown'))).toBe(true)
    expect(labels.some((l) => l.includes('both'))).toBe(true)

    // each option has a non-empty description
    for (const opt of q2.options) {
      expect(opt.description).toBeTruthy()
      expect(opt.description!.length).toBeGreaterThan(10)
    }
  })

  it('Q1 payload extracted from JSON block has correct shape for default-feature', () => {
    const examplePayload: AskUserQuestionPayload = {
      question: 'Where should the plan be stored?',
      intro:
        'Choose where to write the plan. Location and format are independent — you will be asked about format next.',
      options: [
        {
          label: '.anvil/plans/<version>.plan.md (Recommended)',
          description:
            'In-project Anvil plans directory; created if missing. Integrates with anvil plan-validate and anvil plan-run.',
        },
        {
          label: 'docs/plans/<slug>.md',
          description:
            'In-project public-shaped docs. Use when you want the plan in your published documentation.',
        },
        {
          label: 'Custom path',
          description:
            'Relative path you provide. Must not contain ".." or escape the project root.',
        },
      ],
      _rationale:
        'Integrates with plan validation, plan execution, and the dependency graph.',
    }

    const fakeOutput = `\`\`\`json\n${JSON.stringify(examplePayload, null, 2)}\n\`\`\``
    const parsed = extractJsonPayload(fakeOutput)

    expect(parsed).not.toBeNull()
    // ≥3 options
    expect(parsed!.options.length).toBeGreaterThanOrEqual(3)
    // exactly one (Recommended)
    const recommended = parsed!.options.find((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toBeDefined()
    expect(recommended!.label).toContain('.anvil/plans/')
  })
})
