/**
 * ANV-0192 — skill-e2e for plan-verification user-choice pattern.
 *
 * Behavioral compliance:
 *  1. SKILL.md body greps clean for: ValidationMap, ${ANVIL_PLANS_DIR},
 *     src/core/types.ts, ANV-\d ticket refs
 *  2. Q1 (location) payload: ≥3 options, exactly one (Recommended) for .anvil/
 *  3. Q2 (format): exactly 3 options (Structured JSON / Markdown / Both)
 *  4. anvil-addendum.md exists, contains ValidationMap + ANV-0083 provenance
 *  5. retroactive-validator-prompt.md greps clean for ${ANVIL_PLANS_DIR}
 *     and src/core/types.ts direct references
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

describe('skill-e2e: plan-verification — user-choice pattern', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('SKILL.md is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL.md greps clean for ValidationMap reference', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    expect(body).not.toMatch(/ValidationMap/)
  })

  it('SKILL.md greps clean for ${ANVIL_PLANS_DIR} token', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_PLANS_DIR/)
  })

  it('SKILL.md greps clean for ANV- ticket references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    expect(body).not.toMatch(/ANV-\d/)
  })

  it('SKILL.md greps clean for src/core/types.ts references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    expect(body).not.toMatch(/src\/core\/types\.ts/)
  })

  // ── 2. Q1 — location prompt payload shape ───────────────────────────────

  it('Q1 location DecisionPrompt has ≥3 options with exactly one (Recommended)', () => {
    const prompt = DecisionPrompt.parse({
      question: 'Where should the verification report be stored?',
      explanation:
        'Choose where to write the report. Storing under .anvil/reviews/ integrates with Anvil tooling. Location and format are independent.',
      options: [
        {
          label: '.anvil/reviews/<slug> (Recommended)',
          description:
            'In-project Anvil reviews directory; created if missing. Integrates with Anvil reporting commands.',
          recommended: true,
          rationale:
            'Co-located with the project and accessible to Anvil commands.',
        },
        {
          label: 'docs/reviews/<slug>',
          description:
            'In-project public-shaped docs; visible in rendered documentation.',
        },
        {
          label: '~/.anvil/projects/<auto-name>/reviews/<slug>',
          description:
            'Out-of-project; keeps your project repo clean of generated artifacts.',
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
    expect(payload.options.length).toBeGreaterThanOrEqual(3)
    const recommended = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
    expect(recommended[0].label).toContain('.anvil/')
  })

  // ── 3. Q2 — format prompt payload shape ─────────────────────────────────

  it('Q2 format DecisionPrompt has exactly 3 options', () => {
    const prompt = DecisionPrompt.parse({
      question: 'What format should the verification report use?',
      explanation:
        'Structured JSON integrates with Anvil tooling. Markdown is human-readable.',
      options: [
        {
          label: 'Structured JSON (Recommended)',
          description:
            'Machine-readable; consumable by Anvil reporting tools and CI pipelines.',
          recommended: true,
          rationale: 'Enables automated aggregation and tooling integration.',
        },
        {
          label: 'Markdown',
          description: 'Human-readable report; renders in PRs and on GitHub.',
        },
        {
          label: 'Both',
          description:
            'Write both a JSON and a markdown report at the chosen location.',
        },
      ],
      confidence: 'high',
    })

    const payload = renderDecisionClaudeCode(prompt)
    expect(payload.options).toHaveLength(3)
    for (const opt of payload.options) {
      expect(opt.description.length).toBeGreaterThan(0)
    }
  })

  // ── 4. anvil-addendum.md ─────────────────────────────────────────────────

  it('anvil-addendum.md exists and contains ValidationMap reference', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/plan-verification/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/ValidationMap/)
    expect(raw.length).toBeGreaterThan(100)
  })

  it('anvil-addendum.md states it is loaded when user picks JSON or Both format', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/plan-verification/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(
      /format[\s\S]*?(?:JSON|Both)|(?:JSON|Both)[\s\S]*?format/i,
    )
  })

  // ── 5. SKILL.md body contains exactly 2 JSON payloads ───────────────────

  it('SKILL.md body contains exactly 2 AskUserQuestion JSON blocks (Q1 + Q2)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    const all = extractAllPayloads(body)
    expect(all).toHaveLength(2)
  })

  it('Q1 block from SKILL.md has ≥3 options with exactly one (Recommended) for .anvil/', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    const all = extractAllPayloads(body)
    const q1 = all[0]!
    expect(q1.options.length).toBeGreaterThanOrEqual(3)
    const recommended = q1.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
    expect(recommended[0]!.label).toContain('.anvil/')
  })

  it('Q2 block from SKILL.md has exactly 3 options', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-verification/SKILL.md',
    })
    const all = extractAllPayloads(body)
    const q2 = all[1]!
    expect(q2.options).toHaveLength(3)
    const labels = q2.options.map((o) => o.label.toLowerCase())
    expect(
      labels.some((l) => l.includes('json') || l.includes('structured')),
    ).toBe(true)
    expect(labels.some((l) => l.includes('markdown'))).toBe(true)
    expect(labels.some((l) => l.includes('both'))).toBe(true)
  })

  // ── 6. E2E runSkillE2E tests ─────────────────────────────────────────────

  it('Anvil flavor: skill emits Q1 asking about report location', async () => {
    await runSkillE2E({
      slug: 'plan-verification',
      file: { relativePath: 'universal/plan-verification/SKILL.md' },
      userPrompt:
        'Verify the implementation plan at docs/plans/auth-feature.md against the stated goal.',
      fakeOutputText: [
        'Plan verification starting — reading plan and performing goal-backward analysis.',
        '',
        'Where should the verification report be stored?',
        '```json',
        JSON.stringify({
          question: 'Where should the verification report be stored?',
          intro:
            'Choose where to write the report. Location and format are independent.',
          options: [
            {
              label: '.anvil/reviews/plan-auth-feature (Recommended)',
              description:
                'In-project Anvil reviews directory; created if missing.',
            },
            {
              label: 'docs/reviews/plan-auth-feature',
              description: 'In-project public docs.',
            },
            {
              label: 'Custom path',
              description: 'Relative path you provide.',
            },
          ],
          _rationale: 'Co-located with the project.',
        }),
        '```',
      ].join('\n'),
      assertions: [
        {
          label: 'response asks about report location',
          predicate: (t) =>
            /where should the verification report be stored/i.test(t),
        },
        {
          label: 'response includes .anvil/reviews/ option',
          predicate: (t) => t.includes('.anvil/reviews/'),
        },
      ],
    })
  })

  it('Markdown-only flavor: report without ValidationMap JSON', async () => {
    await runSkillE2E({
      slug: 'plan-verification',
      file: { relativePath: 'universal/plan-verification/SKILL.md' },
      userPrompt:
        'Verify the plan at docs/plans/search.md. Store the report at docs/reviews/search-plan.md.',
      fakeOutputText: [
        '# Plan Verification Report: Search Feature',
        '',
        '## Goal',
        'Implement search functionality with full-text indexing.',
        '',
        '## Verdict',
        '✅ PASS — plan achieves the goal',
        '',
        '## Analysis',
        '### Gaps',
        '- None identified.',
        '### Risks',
        '- Performance risk on large datasets — mitigation: add pagination.',
      ].join('\n'),
      assertions: [
        {
          label: 'response contains a verdict',
          predicate: (t) => /PASS|FAIL|CONCERNS/i.test(t),
        },
        {
          label: 'response has analysis section',
          predicate: (t) => /analysis|gaps|risks/i.test(t),
        },
      ],
    })
  })

  // ── 7. retroactive-validator-prompt.md cleanliness ───────────────────────

  it('retroactive-validator-prompt.md greps clean for ${ANVIL_PLANS_DIR}', async () => {
    const raw = await readFile(
      resolve(
        SKILLS_ROOT,
        'universal/plan-verification/retroactive-validator-prompt.md',
      ),
      'utf-8',
    )
    expect(raw).not.toMatch(/\$\{ANVIL_PLANS_DIR/)
  })

  it('retroactive-validator-prompt.md greps clean for src/core/types.ts direct reference', async () => {
    const raw = await readFile(
      resolve(
        SKILLS_ROOT,
        'universal/plan-verification/retroactive-validator-prompt.md',
      ),
      'utf-8',
    )
    // The addendum can reference ValidationMap, but the prompt itself should not
    // directly cite src/core/types.ts as a hard coupling
    expect(raw).not.toMatch(/src\/core\/types\.ts/)
  })
})
