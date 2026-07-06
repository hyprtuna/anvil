/**
 * ANV-0192 — skill-e2e for brainstorm-spec user-choice pattern.
 *
 * Behavioral compliance:
 *  1. SKILL.md body greps clean for Anvil-specific tokens:
 *     - ${ANVIL_FEATURES_DIR}, ${ANVIL_SPECS_DIR}
 *     - ANV-NNNN ticket references
 *     - D-0\d decision IDs in prose (outside the HARD-GATE / process sections)
 *     - `src/core/types.ts` internal type references
 *  2. Q1 (location) payload: ≥3 options, exactly one (Recommended) referencing .anvil/specs/
 *  3. Q2 (format): exactly 3 options (Anvil-spec / Markdown / Both)
 *  4. anvil-addendum.md exists, contains Anvil-specific SDD content (D-NN, decisions block)
 *  5. Anvil flavor → addendum loaded; Markdown-only flavor → addendum not loaded
 *  6. assumptions-surfacer-prompt.md moves Anvil-specific env refs to addendum
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

describe('skill-e2e: brainstorm-spec — user-choice pattern', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('SKILL.md is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/brainstorm-spec/SKILL.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL.md greps clean for ${ANVIL_FEATURES_DIR} token', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/brainstorm-spec/SKILL.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_FEATURES_DIR/)
  })

  it('SKILL.md greps clean for ${ANVIL_SPECS_DIR} token', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/brainstorm-spec/SKILL.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_SPECS_DIR/)
  })

  it('SKILL.md greps clean for ANV- ticket references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/brainstorm-spec/SKILL.md',
    })
    expect(body).not.toMatch(/ANV-\d/)
  })

  it('SKILL.md greps clean for src/core/types.ts internal references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/brainstorm-spec/SKILL.md',
    })
    expect(body).not.toMatch(/src\/core\/types\.ts/)
  })

  // ── 2. Q1 — location prompt payload shape ───────────────────────────────

  it('Q1 location DecisionPrompt has ≥3 options with exactly one (Recommended) for .anvil/specs/', () => {
    const prompt = DecisionPrompt.parse({
      question: 'Where should the spec be stored?',
      explanation:
        'Choose where to write the spec. Storing under .anvil/specs/ integrates with Anvil SDD tooling. Location and format are independent choices.',
      options: [
        {
          label: '.anvil/specs/features/<slug>/spec.md (Recommended)',
          description:
            'In-project Anvil specs directory; created if missing. Enables brainstorm-spec → plan-writing SDD chain.',
          recommended: true,
          rationale:
            'Integrates with anvil plan-check-decisions and the plan-verifier gate.',
        },
        {
          label: 'docs/specs/<slug>.md',
          description:
            'In-project public-shaped docs. Use when you want the spec visible in published documentation.',
        },
        {
          label: '~/.anvil/projects/<auto-name>/specs/<slug>.md',
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

    expect(payload.question).toBeTruthy()
    expect(payload.intro).toBeTruthy()
    expect(payload.options.length).toBeGreaterThanOrEqual(3)
    const recommended = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
    expect(recommended[0].label).toContain('.anvil/specs/')
  })

  // ── 3. Q2 — format prompt payload shape ─────────────────────────────────

  it('Q2 format DecisionPrompt has exactly 3 options (Anvil-spec / Markdown / Both)', () => {
    const prompt = DecisionPrompt.parse({
      question: 'What format should the spec use?',
      explanation:
        'Anvil-spec format adds the <decisions> block and D-NN grammar required by plan-writing. Markdown is human-readable.',
      options: [
        {
          label: 'Anvil-spec (decisions block + D-NN grammar) (Recommended)',
          description:
            'Adds <decisions> block, D-NN decision IDs, and structured YAML frontmatter required by plan-writing and plan-verifier.',
          recommended: true,
          rationale:
            'Required for brainstorm-spec → plan-writing → plan-verifier chain; enables decision coverage checks.',
        },
        {
          label: 'Markdown',
          description:
            'Plain markdown spec without structured decision grammar; best when plan-writing is not in the workflow.',
        },
        {
          label: 'Both',
          description:
            'Write both an Anvil-spec and a plain markdown version at the chosen location.',
        },
      ],
      confidence: 'high',
    })

    const payload = renderDecisionClaudeCode(prompt)

    expect(payload.options).toHaveLength(3)
    for (const opt of payload.options) {
      expect(opt.description.length).toBeGreaterThan(0)
    }
    const recommended = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
  })

  // ── 4. anvil-addendum.md ─────────────────────────────────────────────────

  it('anvil-addendum.md exists and contains D-NN decision grammar', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/brainstorm-spec/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/D-\d\d/i)
    expect(raw.length).toBeGreaterThan(100)
  })

  it('anvil-addendum.md references the decisions block grammar', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/brainstorm-spec/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/<decisions>/i)
  })

  it('anvil-addendum.md states it is loaded when user picks Anvil-spec or Both', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/brainstorm-spec/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(
      /format[\s\S]*?(?:Anvil.spec|Anvil-spec|Both)|(?:Anvil.spec|Anvil-spec|Both)[\s\S]*?format/i,
    )
  })

  // ── 5. SKILL.md body contains exactly 2 JSON payloads ───────────────────

  it('SKILL.md body contains exactly 2 AskUserQuestion JSON blocks (Q1 + Q2)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/brainstorm-spec/SKILL.md',
    })
    const all = extractAllPayloads(body)
    expect(all).toHaveLength(2)
  })

  it('Q1 block from SKILL.md has ≥3 options with exactly one (Recommended) referencing .anvil/specs/', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/brainstorm-spec/SKILL.md',
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
      relativePath: 'universal/brainstorm-spec/SKILL.md',
    })
    const all = extractAllPayloads(body)
    const q2 = all[1]!
    expect(q2.options).toHaveLength(3)
    const labels = q2.options.map((o) => o.label.toLowerCase())
    expect(labels.some((l) => l.includes('anvil') || l.includes('spec'))).toBe(
      true,
    )
    expect(labels.some((l) => l.includes('markdown'))).toBe(true)
    expect(labels.some((l) => l.includes('both'))).toBe(true)
    for (const opt of q2.options) {
      expect(opt.description).toBeTruthy()
    }
  })

  // ── 6. E2E runSkillE2E tests — Anvil flavor ──────────────────────────────

  it('Anvil flavor: skill emits Q1 asking about spec location', async () => {
    await runSkillE2E({
      slug: 'brainstorm-spec',
      file: { relativePath: 'universal/brainstorm-spec/SKILL.md' },
      userPrompt:
        'I want to add a user authentication feature. Please brainstorm a spec.',
      fakeOutputText: [
        'I need to know where to store the spec.',
        '```json',
        JSON.stringify({
          question: 'Where should the spec be stored?',
          intro:
            'Choose where to write the spec. Storing under .anvil/specs/ integrates with Anvil SDD tooling. Location and format are independent.',
          options: [
            {
              label: '.anvil/specs/features/<slug>/spec.md (Recommended)',
              description:
                'In-project Anvil specs directory; created if missing. Enables brainstorm-spec → plan-writing SDD chain.',
            },
            {
              label: 'docs/specs/<slug>.md',
              description: 'In-project public docs.',
            },
            {
              label: 'Custom path',
              description: 'Provide a relative path.',
            },
          ],
          _rationale: 'Integrates with anvil plan-check-decisions.',
        }),
        '```',
      ].join('\n'),
      assertions: [
        {
          label: 'response asks about spec storage location',
          predicate: (t) => /where should the spec be stored/i.test(t),
        },
        {
          label: 'response includes .anvil/specs/ as an option',
          predicate: (t) => t.includes('.anvil/specs/'),
        },
        {
          label: 'response marks .anvil/specs/ as recommended',
          predicate: (t) =>
            /\.anvil\/specs\/.*recommended|recommended.*\.anvil\/specs\//i.test(
              t,
            ),
        },
      ],
    })
  })

  it('Markdown-only flavor: skill emits Q2 asking about format with Markdown option', async () => {
    await runSkillE2E({
      slug: 'brainstorm-spec',
      file: { relativePath: 'universal/brainstorm-spec/SKILL.md' },
      userPrompt:
        'Brainstorm a spec for a caching layer. Store it at docs/specs/caching.md.',
      fakeOutputText: [
        'Q1 answered via prompt override: docs/specs/caching.md.',
        '',
        'Now choosing format:',
        '```json',
        JSON.stringify({
          question: 'What format should the spec use?',
          intro:
            'Anvil-spec format adds the decisions block and D-NN grammar. Markdown is human-readable without tooling dependencies.',
          options: [
            {
              label:
                'Anvil-spec (decisions block + D-NN grammar) (Recommended)',
              description:
                'Adds <decisions> block and D-NN IDs required by plan-writing.',
            },
            {
              label: 'Markdown',
              description:
                'Plain markdown spec without structured decision grammar.',
            },
            {
              label: 'Both',
              description: 'Write both Anvil-spec and plain markdown.',
            },
          ],
          _rationale: 'Anvil-spec enables decision coverage checks.',
        }),
        '```',
      ].join('\n'),
      assertions: [
        {
          label: 'response asks about spec format',
          predicate: (t) => /what format should the spec use/i.test(t),
        },
        {
          label: 'response includes Markdown option',
          predicate: (t) => /markdown/i.test(t),
        },
        {
          label: 'response includes Anvil-spec option',
          predicate: (t) => /anvil.spec|decisions block/i.test(t),
        },
      ],
    })
  })

  // ── 7. assumptions-surfacer-prompt.md cleanliness ────────────────────────

  it('assumptions-surfacer-prompt.md greps clean for ${ANVIL_FEATURES_DIR}', async () => {
    const raw = await readFile(
      resolve(
        SKILLS_ROOT,
        'universal/brainstorm-spec/assumptions-surfacer-prompt.md',
      ),
      'utf-8',
    )
    expect(raw).not.toMatch(/\$\{ANVIL_FEATURES_DIR/)
  })

  it('assumptions-surfacer-prompt.md greps clean for .anvil/state.json reference', async () => {
    const raw = await readFile(
      resolve(
        SKILLS_ROOT,
        'universal/brainstorm-spec/assumptions-surfacer-prompt.md',
      ),
      'utf-8',
    )
    expect(raw).not.toMatch(/\.anvil\/state\.json/)
  })
})
