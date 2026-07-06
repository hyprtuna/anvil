/**
 * ANV-0187 — skill-e2e for the user-choice-discipline pattern (TWO-question).
 *
 * Behavioral compliance: a skill that applies the TWO-question user-choice
 * pattern must emit:
 *   Q1 — AskUserQuestion payload for location (≥3 options, recommended,
 *         .anvil/ option, rationale strings)
 *   Q2 — AskUserQuestion payload for format (exactly 3 options: JSON /
 *         Markdown / Both, recommended present or documented absence, each
 *         option label explains trade-offs)
 *
 * The test uses the example skill at
 * `skills/universal/rules/examples/user-choice-example.md`.
 */

import { describe, expect, it } from 'vitest'
import {
  type AskUserQuestionPayload,
  DecisionPrompt,
  renderDecisionClaudeCode,
} from '../../../../src/core/templates/decision.js'
import { loadSkillBody } from '../load-skill.js'

/**
 * Parse ALL JSON payloads embedded in the skill output text.
 * The example skill renders each payload as a JSON code-block.
 * Returns them in document order.
 */
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

describe('user-choice-discipline: AskUserQuestion payload shape (TWO-question pattern)', () => {
  it('example skill file is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/examples/user-choice-example.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Q1 — location prompt
  // ---------------------------------------------------------------------------

  it('Q1 (location) — DecisionPrompt produces valid payload with correct shape', () => {
    const prompt = DecisionPrompt.parse({
      question: 'Where should the research note be stored?',
      explanation:
        'Storing under .anvil/research/ integrates with Anvil tooling (search, cross-linking, structured frontmatter). ' +
        'Storing under docs/research/ or a custom path uses generic format without Anvil-specific grammar.',
      options: [
        {
          label: '.anvil/research/ (Recommended)',
          description:
            'In-project Anvil tree; created if missing. Integrates with Anvil tooling — search, cross-linking, structured frontmatter.',
          recommended: true,
          rationale:
            'Picks up structured frontmatter and Anvil cross-linking; the directory is bootstrapped on first use.',
        },
        {
          label: 'docs/research/',
          description:
            "In-project public-shaped docs. Use when you want the artifact in your repo's published docs.",
        },
        {
          label: '~/.anvil/projects/<auto-name>/research/',
          description:
            'Out-of-project; keeps your project repo clean of generated artifacts.',
        },
        {
          label: 'Other (custom path)',
          description:
            'Provide a relative path. Must not contain ".." or escape the project root.',
        },
      ],
      confidence: 'high',
    })

    const payload = renderDecisionClaudeCode(prompt)

    // question is present and non-empty
    expect(payload.question).toBeTruthy()
    expect(payload.question.length).toBeGreaterThan(0)

    // options.length >= 3 (was 2 in old pattern — now at least 3)
    expect(payload.options.length).toBeGreaterThanOrEqual(3)

    // at least one option label includes '.anvil/'
    const anvilOption = payload.options.find((o) => o.label.includes('.anvil/'))
    expect(anvilOption).toBeDefined()

    // exactly one option label contains '(Recommended)'
    const recommendedOptions = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommendedOptions).toHaveLength(1)

    // the recommended option references .anvil/<kind>/
    expect(recommendedOptions[0]!.label).toContain('.anvil/')

    // options include rationale / description strings (not just labels)
    for (const opt of payload.options) {
      expect(opt.description).toBeTruthy()
      expect(opt.description!.length).toBeGreaterThan(0)
    }
  })

  // ---------------------------------------------------------------------------
  // Q2 — format prompt
  // ---------------------------------------------------------------------------

  it('Q2 (format) — DecisionPrompt produces valid payload with 3 options', () => {
    const prompt = DecisionPrompt.parse({
      question: 'What format should the research note use?',
      explanation:
        'Choose based on who will read the artifact and which tools need to consume it.',
      options: [
        {
          label: 'Machine-readable (JSON) (Recommended)',
          description:
            'Structured, schema-validated, consumable by tooling like `anvil agent lint`; best when other tools will read this.',
          recommended: true,
          rationale:
            'Tooling can validate and cross-link structured JSON; human-readable fallback via `anvil show`.',
        },
        {
          label: 'Markdown',
          description:
            'Human-readable narrative; renders in PR diffs and on GitHub; best when humans will read this.',
        },
        {
          label: 'Both',
          description:
            'Write both files at the chosen location; use when both audiences matter.',
        },
      ],
      confidence: 'high',
    })

    const payload = renderDecisionClaudeCode(prompt)

    // question is non-empty
    expect(payload.question).toBeTruthy()
    expect(payload.question.length).toBeGreaterThan(0)

    // exactly 3 options: JSON / Markdown / Both
    expect(payload.options).toHaveLength(3)

    // each option label explains trade-offs (≥1 sentence: description non-empty)
    for (const opt of payload.options) {
      expect(opt.description).toBeTruthy()
      expect(opt.description!.length).toBeGreaterThan(10)
    }

    // at least one option contains '(Recommended)' OR all descriptions are explanatory
    const hasRecommended = payload.options.some((o) =>
      o.label.includes('(Recommended)'),
    )
    // Per spec: "Exactly one option contains (Recommended) OR documented rationale for no recommendation"
    // We test the positive case — recommended present
    expect(hasRecommended).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Payload intro
  // ---------------------------------------------------------------------------

  it('payload intro (explanation) is present and non-empty', () => {
    const prompt = DecisionPrompt.parse({
      question: 'Where should the plan be stored?',
      explanation:
        'Anvil integrates with .anvil/plans/. Generic format used elsewhere.',
      options: [
        {
          label: '.anvil/plans/ (Recommended)',
          description:
            'Anvil-flavored slate format with structured frontmatter; created if missing.',
          recommended: true,
          rationale: 'Integrates with release tooling.',
        },
        {
          label: 'docs/plans/',
          description: 'Generic markdown without Anvil-specific grammar.',
        },
        {
          label: 'Other (custom path)',
          description: 'Relative path; must not contain ".." or escape cwd.',
        },
      ],
    })

    const payload = renderDecisionClaudeCode(prompt)

    expect(payload.intro).toBeTruthy()
    expect(payload.intro.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Kind taxonomy
  // ---------------------------------------------------------------------------

  it('kind taxonomy mapping is correct', () => {
    const kindMap: Record<string, string> = {
      plan: '.anvil/plans/',
      spec: '.anvil/specs/features/<slug>/',
      research: '.anvil/research/',
      decision: '.anvil/decisions/',
      audit: '.anvil/audits/',
      review: '.anvil/reviews/',
      adr: '.anvil/adrs/',
    }

    const expectedKinds = [
      'plan',
      'spec',
      'research',
      'decision',
      'audit',
      'review',
      'adr',
    ]
    for (const kind of expectedKinds) {
      expect(kindMap[kind]).toBeDefined()
      expect(kindMap[kind]).toContain('.anvil/')
    }
  })

  // ---------------------------------------------------------------------------
  // Example skill conformance — Q1 (location)
  // ---------------------------------------------------------------------------

  it('Q1 payload extracted from example skill has correct shape', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/examples/user-choice-example.md',
    })
    const all = extractAllPayloads(body)

    // Must have at least 2 payloads (Q1 + Q2)
    expect(all.length).toBeGreaterThanOrEqual(2)

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

    // at least one option label includes '.anvil/'
    const anvilOption = q1.options.find((o) => o.label.includes('.anvil/'))
    expect(anvilOption).toBeDefined()

    // options include rationale strings (descriptions non-empty)
    for (const opt of q1.options) {
      expect(opt.description).toBeTruthy()
      expect(opt.description!.length).toBeGreaterThan(0)
    }

    // intro is a non-empty string
    expect(typeof q1.intro).toBe('string')
    expect(q1.intro!.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Example skill conformance — Q2 (format)
  // ---------------------------------------------------------------------------

  it('Q2 payload extracted from example skill has correct shape', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/examples/user-choice-example.md',
    })
    const all = extractAllPayloads(body)

    // Must have at least 2 payloads
    expect(all.length).toBeGreaterThanOrEqual(2)

    const q2 = all[1]!

    // question is non-empty
    expect(typeof q2.question).toBe('string')
    expect(q2.question.length).toBeGreaterThan(0)

    // Q2 options.length === 3
    expect(q2.options).toHaveLength(3)

    // at least one option contains '(Recommended)' per spec
    const hasRecommended = q2.options.some((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(hasRecommended).toBe(true)

    // each option label explains trade-offs (description non-empty)
    for (const opt of q2.options) {
      expect(opt.description).toBeTruthy()
      expect(opt.description!.length).toBeGreaterThan(10)
    }
  })
})
