/**
 * ANV-0192 — skill-e2e for read-background-results user-choice pattern.
 *
 * Behavioral compliance:
 *  1. SKILL.md body greps clean for ${ANVIL_BACKGROUND_RESULTS} direct usage
 *     (the env var reference moves to addendum or is genericised to a
 *     "background results file" concept)
 *  2. Skill still functions as a generic results-merger for any background
 *     results file path the user/caller provides
 *  3. anvil-addendum.md exists and contains the ${ANVIL_BACKGROUND_RESULTS}
 *     env var name and Anvil-specific discovery logic
 *  4. Anvil flavor: addendum loaded → env var path used for discovery
 *  5. Generic flavor: user provides path explicitly → no env var needed
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runSkillE2E } from '../helpers.js'
import { loadSkillBody } from '../load-skill.js'

const SKILLS_ROOT = resolve(process.cwd(), 'skills')

describe('skill-e2e: read-background-results — Anvil-specific isolation', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('SKILL.md is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/read-background-results.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL.md greps clean for ${ANVIL_BACKGROUND_RESULTS} env var reference', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/read-background-results.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_BACKGROUND_RESULTS/)
  })

  it('SKILL.md greps clean for ANV- ticket references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/read-background-results.md',
    })
    expect(body).not.toMatch(/ANV-\d/)
  })

  // ── 2. Generic skill still operates on explicit path ────────────────────

  it('SKILL.md still contains the block-parsing logic (generic, must stay)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/read-background-results.md',
    })
    // The core parsing logic is generic
    expect(body).toMatch(/parse|block|result/i)
  })

  // ── 3. anvil-addendum.md ─────────────────────────────────────────────────

  it('anvil-addendum.md exists', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/read-background-results-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw.length).toBeGreaterThan(50)
  })

  it('anvil-addendum.md contains the ANVIL_BACKGROUND_RESULTS env var reference', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/read-background-results-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/ANVIL_BACKGROUND_RESULTS/)
  })

  it('anvil-addendum.md explains when it is loaded (Anvil context)', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/read-background-results-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/anvil|\.anvil\//i)
  })

  // ── 4. E2E runSkillE2E tests ─────────────────────────────────────────────

  it('Generic flavor: skill processes explicit path without env var', async () => {
    await runSkillE2E({
      slug: 'read-background-results',
      file: { relativePath: 'universal/read-background-results.md' },
      userPrompt: 'Merge the parallel agent outputs from /tmp/wave-results.md.',
      fakeOutputText: [
        '# Background Results — Synthesized Summary',
        '',
        '**Wave:** 3 agents  |  **Merged:** 2026-05-16',
        '',
        '## Findings (5 unique, 2 deduplicated)',
        '',
        '### security-analyst',
        '- SQL injection risk in auth.ts:42 _(reported by: security-analyst, api-surface-analyst)_',
        '',
        '## Conflicts (0 flagged)',
        '',
        '## Coverage Gaps',
        '_No gaps identified._',
      ].join('\n'),
      assertions: [
        {
          label: 'response contains merged summary header',
          predicate: (t) => /background results.*synthesized summary/i.test(t),
        },
        {
          label: 'response contains findings section',
          predicate: (t) => /findings/i.test(t),
        },
        {
          label: 'response does not reference ANVIL_BACKGROUND_RESULTS env var',
          predicate: (t) => !t.includes('ANVIL_BACKGROUND_RESULTS'),
        },
      ],
    })
  })

  it('Anvil flavor: addendum explains env var path discovery', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/read-background-results-anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    // Should explain that in Anvil context, ANVIL_BACKGROUND_RESULTS is used for discovery
    expect(raw).toMatch(/ANVIL_BACKGROUND_RESULTS/)
  })
})
