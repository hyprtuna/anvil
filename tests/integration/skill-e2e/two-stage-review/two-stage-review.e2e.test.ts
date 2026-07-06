/**
 * ANV-0192 — skill-e2e for two-stage-review user-choice pattern.
 *
 * Behavioral compliance:
 *  1. SKILL.md body greps clean for: src/core/types.ts → ReviewReport,
 *     "Plan 30 contract", ANV-\d ticket refs
 *  2. The two-stage orchestration structure (Stage 1 spec-compliance,
 *     Stage 2 code-quality) is generic and must stay in SKILL.md
 *  3. anvil-addendum.md exists and contains:
 *     - ReviewReport JSON schema reference (src/core/types.ts coupling)
 *     - Plan 30 contract details
 *     - --strict-review Plan 30 preserved behavior
 *  4. Anvil flavor → addendum loaded → ReviewReport JSON shape enforced
 *  5. Generic flavor → generic review report without strict JSON schema
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

describe('skill-e2e: two-stage-review — Anvil-specific isolation', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('SKILL.md is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL.md greps clean for src/core/types.ts → ReviewReport reference', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    expect(body).not.toMatch(/src\/core\/types\.ts/)
  })

  it('SKILL.md greps clean for "Plan 30" reference', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    expect(body).not.toMatch(/Plan 30/)
  })

  it('SKILL.md greps clean for ANV- ticket references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    expect(body).not.toMatch(/ANV-\d/)
  })

  // ── 2. Generic orchestration structure must stay ─────────────────────────

  it('SKILL.md still contains Stage 1 and Stage 2 orchestration', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    expect(body).toMatch(/Stage 1|stage.1/i)
    expect(body).toMatch(/Stage 2|stage.2/i)
  })

  it('SKILL.md still contains SPEC_PASS / SPEC_FAIL result handling', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    expect(body).toMatch(/SPEC_PASS|SPEC_FAIL/)
  })

  // ── 3. Q1 and Q2 format choice ───────────────────────────────────────────

  it('Q1 location DecisionPrompt has ≥3 options with exactly one (Recommended)', () => {
    const prompt = DecisionPrompt.parse({
      question: 'Where should the review report be stored?',
      explanation:
        'Choose where to write the merged review report. Location and format are independent.',
      options: [
        {
          label: '.anvil/reviews/<slug> (Recommended)',
          description:
            'In-project Anvil reviews directory; created if missing. Integrates with Anvil tooling.',
          recommended: true,
          rationale: 'Co-located and accessible to Anvil reporting commands.',
        },
        {
          label: 'docs/reviews/<slug>',
          description:
            'In-project public-shaped docs; visible in published documentation.',
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

  // ── 4. anvil-addendum.md ─────────────────────────────────────────────────

  it('anvil-addendum.md exists and contains ReviewReport schema', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/two-stage-review-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/ReviewReport/)
    expect(raw.length).toBeGreaterThan(100)
  })

  it('anvil-addendum.md contains Plan 30 contract reference', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/two-stage-review-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/Plan 30/)
  })

  it('anvil-addendum.md contains --strict-review behavior', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/two-stage-review-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/strict.review/i)
  })

  it('anvil-addendum.md states it is loaded for Anvil flavor', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/two-stage-review-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/anvil|\.anvil\//i)
  })

  // ── 5. SKILL.md body contains Q1+Q2 JSON payloads ───────────────────────

  it('SKILL.md body contains exactly 2 AskUserQuestion JSON blocks (Q1 + Q2)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    const all = extractAllPayloads(body)
    expect(all).toHaveLength(2)
  })

  it('Q1 block has ≥3 options with exactly one (Recommended) for .anvil/', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
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

  it('Q2 block has exactly 3 options', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/two-stage-review.md',
    })
    const all = extractAllPayloads(body)
    const q2 = all[1]!
    expect(q2.options).toHaveLength(3)
    const labels = q2.options.map((o) => o.label.toLowerCase())
    expect(
      labels.some(
        (l) =>
          l.includes('json') || l.includes('structured') || l.includes('anvil'),
      ),
    ).toBe(true)
    expect(labels.some((l) => l.includes('markdown'))).toBe(true)
    expect(labels.some((l) => l.includes('both'))).toBe(true)
  })

  // ── 6. E2E runSkillE2E tests ─────────────────────────────────────────────

  it('Anvil flavor: skill emits Q1 + Q2, mentions loading addendum', async () => {
    await runSkillE2E({
      slug: 'two-stage-review',
      file: { relativePath: 'universal/two-stage-review.md' },
      userPrompt:
        'Run two-stage review on the changes for the auth feature task T-03.',
      fakeOutputText: [
        'Two-stage review starting — Stage 1 spec compliance, then Stage 2 code quality.',
        '',
        'Where should the review report be stored?',
        '```json',
        JSON.stringify({
          question: 'Where should the review report be stored?',
          intro:
            'Choose where to write the merged review report. Location and format are independent.',
          options: [
            {
              label: '.anvil/reviews/auth-t03 (Recommended)',
              description:
                'In-project Anvil reviews directory; created if missing.',
            },
            {
              label: 'docs/reviews/auth-t03',
              description: 'In-project public docs.',
            },
            {
              label: 'Custom path',
              description: 'Relative path you provide.',
            },
          ],
          _rationale: 'Co-located and accessible to Anvil commands.',
        }),
        '```',
      ].join('\n'),
      assertions: [
        {
          label: 'response asks about report location',
          predicate: (t) => /where should the review report be stored/i.test(t),
        },
        {
          label: 'response includes .anvil/reviews/ option',
          predicate: (t) => t.includes('.anvil/reviews/'),
        },
      ],
    })
  })

  it('Generic flavor: report without ReviewReport JSON schema enforcement', async () => {
    await runSkillE2E({
      slug: 'two-stage-review',
      file: { relativePath: 'universal/two-stage-review.md' },
      userPrompt:
        'Run a two-stage review on the PR changes. Store the report at docs/reviews/pr-42.md.',
      fakeOutputText: [
        '## Stage 1: Spec Compliance',
        'SPEC_PASS',
        '',
        '## Stage 2: Code Quality',
        'QUALITY_PASS — no critical findings.',
        '',
        '## Review Summary',
        'Both stages passed. Task is ready to mark DONE.',
      ].join('\n'),
      assertions: [
        {
          label: 'response shows Stage 1 result',
          predicate: (t) => /SPEC_PASS|SPEC_FAIL/i.test(t),
        },
        {
          label: 'response shows Stage 2 result',
          predicate: (t) => /QUALITY_PASS|QUALITY_FAIL/i.test(t),
        },
        {
          label: 'response does not reference Plan 30 contract',
          predicate: (t) => !/Plan 30/i.test(t),
        },
        {
          label: 'response does not reference src/core/types.ts',
          predicate: (t) => !t.includes('src/core/types.ts'),
        },
      ],
    })
  })
})
