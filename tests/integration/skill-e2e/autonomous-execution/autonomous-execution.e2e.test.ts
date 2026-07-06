/**
 * ANV-0192 — skill-e2e for autonomous-execution Anvil-specific isolation.
 *
 * Behavioral compliance:
 *  1. The body of autonomous-execution.md is largely generic — it must stay
 *     as-is. The only Anvil-specific content is the frontmatter comment
 *     "# ANV-0086: declared asset paths — doctor checks these exist on disk."
 *     and the references: field.
 *  2. The frontmatter comment ANV-0086 is in frontmatter (stripped by loadSkillBody)
 *     so the body itself is already clean.
 *  3. SKILL body greps clean for Anvil-specific path references in prose.
 *  4. The execution loop, escalation triggers, quality standards, and anti-patterns
 *     are generic and must stay.
 *
 * NOTE: autonomous-execution is flat form (not subdirectory), so the
 * "addendum" for this skill is handled via the frontmatter doctor-asset
 * comment only — the body is already clean. This test verifies cleanliness
 * and that generic content is intact.
 */

import { describe, expect, it } from 'vitest'
import { runSkillE2E } from '../helpers.js'
import { loadSkillBody } from '../load-skill.js'

describe('skill-e2e: autonomous-execution — Anvil-specific isolation', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('SKILL.md is loadable', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL body greps clean for ANV- ticket references in prose', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    // ANV-0086 is in frontmatter (stripped); prose must be clean
    expect(body).not.toMatch(/ANV-\d/)
  })

  it('SKILL body greps clean for ${ANVIL_ env var references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_/)
  })

  it('SKILL body greps clean for src/agents/ path references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body).not.toMatch(/src\/agents\//)
  })

  it('SKILL body greps clean for src/core/types.ts references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body).not.toMatch(/src\/core\/types\.ts/)
  })

  // ── 2. Generic content integrity ─────────────────────────────────────────

  it('SKILL body still contains the execution loop', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body).toMatch(/Execution Loop|execution.loop/i)
  })

  it('SKILL body still contains escalation triggers', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body).toMatch(/Escalation Trigger|escalation/i)
  })

  it('SKILL body still contains quality standards', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body).toMatch(/Quality Standard|quality/i)
  })

  it('SKILL body still contains anti-patterns section', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    expect(body).toMatch(/Anti.Pattern|anti.pattern/i)
  })

  // ── 3. E2E runSkillE2E tests ─────────────────────────────────────────────

  it('Generic context: skill runs autonomous loop and escalates correctly', async () => {
    await runSkillE2E({
      slug: 'autonomous-execution',
      file: { relativePath: 'universal/autonomous-execution.md' },
      userPrompt:
        'Autonomously add a search endpoint to the Express API. Write tests first.',
      fakeOutputText: [
        'I am using the ultra-worker skill for autonomous multi-step execution.',
        '',
        '## Plan',
        '1. Write failing test for GET /search endpoint',
        '2. Implement the search endpoint',
        '3. Verify tests pass',
        '',
        '## Step 1: Write failing test',
        'Writing test at tests/search.test.ts...',
        '',
        '## Step 2: Implement endpoint',
        'Creating src/routes/search.ts...',
        '',
        '## Step 3: Verify',
        'All tests pass.',
        '',
        '## Done — status: DONE',
      ].join('\n'),
      assertions: [
        {
          label: 'response announces autonomous execution',
          predicate: (t) =>
            /autonomous|ultra.worker|plan.*execute|execution/i.test(t),
        },
        {
          label: 'response does not reference Anvil-internal paths',
          predicate: (t) =>
            !t.includes('${ANVIL_') && !t.includes('src/agents/'),
        },
      ],
    })
  })

  it('Anvil context: skill body is clean (no Anvil coupling in prose)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/autonomous-execution.md',
    })
    // The body must be clean — all Anvil coupling is in frontmatter only
    expect(body).not.toMatch(/\$\{ANVIL_/)
    expect(body).not.toMatch(/ANV-\d/)
    expect(body).not.toMatch(/src\/agents\//)
  })
})
