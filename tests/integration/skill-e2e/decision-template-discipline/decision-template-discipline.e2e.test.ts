/**
 * ANV-0192 — skill-e2e for decision-template-discipline user-choice pattern.
 *
 * Behavioral compliance:
 *  1. SKILL.md body greps clean for: ${TEMPLATE:decisions}, --accept-defaults
 *     as Anvil-specific CLI flag, .anvil/decisions/ path (these move to addendum)
 *  2. The HARD-GATE rule still fires correctly (rule is generic)
 *  3. anvil-addendum.md exists and contains Anvil-specific auto-mode contract
 *     (.anvil/decisions/<timestamp>.json audit trail reference)
 *  4. The skill is a rule skill — it does NOT generate a storable artifact,
 *     so the Q1/Q2 location/format pattern does NOT apply here.
 *     Instead: the addendum contains Anvil-specific behavior only.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runSkillE2E } from '../helpers.js'
import { loadSkillBody } from '../load-skill.js'

const SKILLS_ROOT = resolve(process.cwd(), 'skills')

describe('skill-e2e: decision-template-discipline — Anvil-specific isolation', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('SKILL.md is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/decision-template-discipline.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL.md greps clean for .anvil/decisions/ audit trail path', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/decision-template-discipline.md',
    })
    // Audit trail writes to .anvil/decisions/ — this belongs in addendum
    expect(body).not.toMatch(/\.anvil\/decisions\//)
  })

  it('SKILL.md greps clean for ANV- ticket references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/decision-template-discipline.md',
    })
    expect(body).not.toMatch(/ANV-\d/)
  })

  it('SKILL.md greps clean for @anvil/core/templates import path', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/decision-template-discipline.md',
    })
    // Internal TypeScript import path belongs in addendum
    expect(body).not.toMatch(/@anvil\/core\/templates/)
  })

  // ── 2. HARD-GATE rule integrity ──────────────────────────────────────────

  it('SKILL.md still contains the HARD-GATE rule (generic, must stay)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/decision-template-discipline.md',
    })
    expect(body).toMatch(/HARD-GATE/)
  })

  it('SKILL.md still explains the two carve-outs (accept-defaults, auto-mode)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/rules/decision-template-discipline.md',
    })
    // These are generic carve-out concepts, not Anvil-specific implementation
    expect(body).toMatch(/accept.defaults|auto.mode/i)
  })

  // ── 3. anvil-addendum.md ─────────────────────────────────────────────────

  it('anvil-addendum.md exists', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/rules/decision-template-discipline-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw.length).toBeGreaterThan(50)
  })

  it('anvil-addendum.md contains the .anvil/decisions/ audit trail reference', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/rules/decision-template-discipline-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/\.anvil\/decisions\//)
  })

  it('anvil-addendum.md contains the TypeScript auto-mode contract code', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/rules/decision-template-discipline-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    // The TS contract with resolveDecisionAutoMode / writeDecisionAuditEntry belongs here
    expect(raw).toMatch(/resolveDecisionAutoMode|writeDecisionAuditEntry/)
  })

  // ── 4. E2E runSkillE2E tests ─────────────────────────────────────────────

  it('Generic context: HARD-GATE fires correctly — skill waits for user answer', async () => {
    await runSkillE2E({
      slug: 'decision-template-discipline',
      file: {
        relativePath: 'universal/rules/decision-template-discipline.md',
      },
      userPrompt:
        'A skill has presented a decision with two options. The agent should wait for my answer.',
      fakeOutputText: [
        'HARD-GATE: decision — waiting for user answer.',
        '',
        'The decision has been rendered with options:',
        '- Option A: Use approach X',
        '- Option B: Use approach Y (Recommended)',
        '',
        'Please select an option before I proceed.',
      ].join('\n'),
      assertions: [
        {
          label: 'response indicates waiting for user answer',
          predicate: (t) => /wait|select|answer|option/i.test(t),
        },
        {
          label: 'response does not auto-select without explicit permission',
          predicate: (t) => !/silently picked|auto-selected without/i.test(t),
        },
      ],
    })
  })

  it('Anvil flavor: addendum referenced correctly when Anvil context detected', async () => {
    await runSkillE2E({
      slug: 'decision-template-discipline',
      file: {
        relativePath: 'universal/rules/decision-template-discipline.md',
      },
      userPrompt:
        'Auto-mode is active with confidence: high and .anvil/ present. Apply the decision auto-mode contract.',
      fakeOutputText: [
        'Auto-mode active; confidence: high. Loading anvil-addendum for audit trail behavior.',
        '',
        'Auto-selected the recommended option.',
        'Audit trail entry written.',
      ].join('\n'),
      assertions: [
        {
          label: 'response references auto-mode behavior',
          predicate: (t) => /auto.mode|audit|auto.selected/i.test(t),
        },
      ],
    })
  })
})
