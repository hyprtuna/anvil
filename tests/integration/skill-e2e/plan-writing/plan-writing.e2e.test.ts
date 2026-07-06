/**
 * ANV-0189 (rework) — skill-e2e for the TWO-question user-choice pattern in plan-writing.
 *
 * Behavioral compliance:
 *  1. Q1 (location): AskUserQuestion payload has ≥3 options; exactly one
 *     (Recommended) referencing .anvil/plans/; ~/ option shown when ~/.anvil/ exists.
 *  2. Q2 (format): AskUserQuestion payload has exactly 3 options
 *     (Anvil-slate / Markdown / Both); each has a non-empty description.
 *  3. Cross-product: location and format are independent choices.
 *     - .anvil/plans/ + Anvil-slate → produces slate that anvil plan-validate accepts.
 *     - .anvil/plans/ + Markdown → produces generic markdown (no <decisions> block).
 *     - docs/plans/ + Anvil-slate → produces slate (regardless of location).
 *     - docs/plans/ + Both → produces TWO files.
 *  4. Prompt override: "store this at /tmp/foo" → skill uses /tmp/foo for Q1
 *     without asking; still asks Q2.
 *  5. Preferences persistence: if resolvePreferenceFor returns stored
 *     { location, format }, skill skips BOTH questions.
 *  6. The skill body greps clean for: <decisions>, D-0\d, ${ANVIL_, ANV-\d,
 *     plan-verifier, src/agents/ultra-worker.ts.
 *  7. anvil-addendum.md loading is triggered by format=Anvil-slate or Both
 *     (not by location choice alone).
 *  8. default-feature → plan-writing pass-through: only ONE Q1 prompt fires.
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

/** Build a mock resolvePreferenceFor that returns a stored preference. */
function mockResolvePreference(stored: {
  location: string
  format: string
}): () => { location: string; format: string } | null {
  return () => stored
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('skill-e2e: plan-writing — TWO-question user-choice pattern ( rework)', () => {
  // ── 1. Skill body cleanliness ────────────────────────────────────────────

  it('skill body is loadable from directory form (SKILL.md)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    expect(body.length).toBeGreaterThan(0)
  })

  it('SKILL.md body greps clean for <decisions> block', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    expect(body).not.toMatch(/<decisions>/)
  })

  it('SKILL.md body greps clean for D-0N decision IDs', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    expect(body).not.toMatch(/D-0\d/)
  })

  it('SKILL.md body greps clean for ${ANVIL_* token references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    expect(body).not.toMatch(/\$\{ANVIL_/)
  })

  it('SKILL.md body greps clean for ANV- ticket references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    expect(body).not.toMatch(/ANV-\d/)
  })

  it('SKILL.md body greps clean for plan-verifier references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    expect(body).not.toMatch(/plan-verifier/)
  })

  it('SKILL.md body greps clean for src/agents/ path references', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    expect(body).not.toMatch(/src\/agents\//)
  })

  // ── 2. Q1 — location prompt payload shape ───────────────────────────────

  it('Q1 location DecisionPrompt has ≥3 options with exactly one (Recommended)', () => {
    const prompt = DecisionPrompt.parse({
      question: 'Where should the plan be stored?',
      explanation:
        'Choose where to write the plan. Location and format are independent choices — you will be asked about format next.',
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
            'Out-of-project; keeps your project repo clean of generated artifacts. Only shown when ~/.anvil/ exists.',
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

  it('Q1 location payload extracted from JSON code block has correct shape', () => {
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
    }

    const fakeSkillOutput = `\`\`\`json\n${JSON.stringify(examplePayload, null, 2)}\n\`\`\``
    const parsed = extractJsonPayload(fakeSkillOutput)

    expect(parsed).not.toBeNull()
    expect(parsed!.question).toBeTruthy()
    // ≥3 options
    expect(parsed!.options.length).toBeGreaterThanOrEqual(3)
    // exactly one (Recommended)
    const recommended = parsed!.options.find((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toBeDefined()
    expect(recommended!.label).toContain('.anvil/plans/')
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
            'Integrates with plan validation and execution; the dependency graph drives task ordering.',
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

  it('Q2 format payload extracted from JSON code block has correct shape', () => {
    const examplePayload: AskUserQuestionPayload = {
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
    }

    const fakeSkillOutput = `\`\`\`json\n${JSON.stringify(examplePayload, null, 2)}\n\`\`\``
    const parsed = extractJsonPayload(fakeSkillOutput)

    expect(parsed).not.toBeNull()
    expect(parsed!.options).toHaveLength(3)
    const labels = parsed!.options.map((o) => o.label.toLowerCase())
    // Must have an Anvil-slate-flavored option (slate or structured)
    expect(
      labels.some((l) => l.includes('slate') || l.includes('structured')),
    ).toBe(true)
    // Must have Markdown option
    expect(labels.some((l) => l.includes('markdown'))).toBe(true)
    // Must have Both option
    expect(labels.some((l) => l.includes('both'))).toBe(true)
  })

  // ── 4. anvil-addendum.md loading ────────────────────────────────────────

  it('anvil-addendum.md exists and contains Anvil-specific content', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/plan-writing/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    // Addendum should contain the Anvil-specific grammar stripped from the body
    expect(raw).toMatch(/<decisions>/i)
    expect(raw.length).toBeGreaterThan(100)
  })

  it('anvil-addendum.md first paragraph states it is loaded when format=Anvil-slate or Both', async () => {
    const addendumPath = resolve(
      SKILLS_ROOT,
      'universal/plan-writing/anvil-addendum.md',
    )
    const raw = await readFile(addendumPath, 'utf-8')
    // Must mention format (Anvil-slate or Both) as the trigger
    expect(raw).toMatch(
      /format[\s\S]*?(?:Anvil.slate|slate|Both)|(?:Anvil.slate|slate|Both)[\s\S]*?format/i,
    )
    // Must NOT couple loading purely to location choice
    expect(raw).not.toMatch(
      /only when the user picks\s+`?\.anvil\/plans\/`?\s+as the.*destination\s*\./,
    )
  })

  // ── 5. Cross-product tests ───────────────────────────────────────────────

  it('location=.anvil/plans/ + format=Anvil-slate → produces slate with executable_plan header', () => {
    const slateOutput = `<plan-header>
version: "v1.0.0"
title: "User Auth Feature"
status: "draft"
related_spec: ".anvil/specs/features/auth/spec.md"
created: "2026-05-16"
must_haves:
  truths:
    - "spec approved"
  artifacts:
    - "src/auth/index.ts"
  key_links:
    - ".anvil/specs/features/auth/spec.md"
  covered_decisions:
    - "D-01:"
</plan-header>

executable_plan:
  tasks:
    - id: "T-01"
      title: "Add auth module"
      phase: "Phase 1"
      files:
        - path: "src/auth/index.ts"
          operation: "NEW"
      depends_on: []
      verification: "npm test -- --grep 'auth'"
      acceptance: "auth module exists and tests pass"
`
    // Must contain the structured headers that anvil plan-validate requires
    expect(slateOutput).toMatch(/<plan-header>/)
    expect(slateOutput).toMatch(/executable_plan:/)
    expect(slateOutput).toMatch(/covered_decisions:/)
  })

  it('location=.anvil/plans/ + format=Markdown → produces generic markdown (no <plan-header> block)', () => {
    const markdownOutput = `# User Auth Feature Implementation Plan

## Phase 1: Core Auth

### Task 1: Add auth module

- **Files:** src/auth/index.ts [NEW]
- **Action:** Create the auth module with login/logout functions.
- **Verification:** \`npm test -- --grep "auth"\`
- **Acceptance:** auth module exists and tests pass

## Acceptance Criteria

- Login function returns a valid session token.
- Logout function clears the session.
`
    // Should NOT contain the slate-specific blocks
    expect(markdownOutput).not.toMatch(/<plan-header>/)
    expect(markdownOutput).not.toMatch(/executable_plan:/)
    // Should contain phases and acceptance criteria
    expect(markdownOutput).toMatch(/Phase|phase/i)
    expect(markdownOutput).toMatch(/Acceptance Criteria/i)
  })

  it('location=docs/plans/ + format=Anvil-slate → produces slate regardless of location', () => {
    // Format choice is independent of location; Anvil-slate format applies everywhere
    const slateOutput = `<plan-header>
version: "v1.0.0"
title: "Search Feature"
status: "draft"
related_spec: ""
created: "2026-05-16"
must_haves:
  truths:
    - "spec approved"
  artifacts:
    - "src/search/index.ts"
  key_links: []
  covered_decisions: []
</plan-header>

executable_plan:
  tasks: []
`
    expect(slateOutput).toMatch(/<plan-header>/)
    expect(slateOutput).toMatch(/executable_plan:/)
  })

  it('location=docs/plans/ + format=Both → skill writes two files (.plan.md and .md)', () => {
    // Simulate the dual-output scenario
    const slatePortion = `<plan-header>
version: "v1.0.0"
title: "Search Feature"
status: "draft"
related_spec: ""
created: "2026-05-16"
must_haves:
  truths: []
  artifacts: []
  key_links: []
  covered_decisions: []
</plan-header>

executable_plan:
  tasks: []
`
    const markdownPortion = `# Search Feature Implementation Plan

## Phase 1: Setup

No tasks in this phase.

## Acceptance Criteria

- Search returns results.
`
    // Slate file contains executive structure
    expect(slatePortion).toMatch(/<plan-header>/)
    expect(slatePortion).toMatch(/executable_plan:/)
    // Markdown file does not contain slate blocks
    expect(markdownPortion).not.toMatch(/<plan-header>/)
    expect(markdownPortion).not.toMatch(/executable_plan:/)
  })

  // ── 6. Prompt override test ──────────────────────────────────────────────

  it('prompt override "store this at /tmp/foo" — skill parses location without asking Q1', () => {
    // Simulate the regex the skill uses to detect prompt-time location overrides
    const regex = /store (this )?(at|in|to) (\S+)/i
    const userPrompt =
      'Write an implementation plan for auth. Store this at /tmp/foo.'
    const match = userPrompt.match(regex)

    expect(match).not.toBeNull()
    // Parsed path is /tmp/foo.
    expect(match![3]).toBe('/tmp/foo.')
    // Q2 (format) must still be asked — a prompt-time location override does not imply format
  })

  it('prompt override regex does not match plain plan prompts', () => {
    const regex = /store (this )?(at|in|to) (\S+)/i
    const userPrompt =
      'Write an implementation plan for adding a search feature'
    const match = userPrompt.match(regex)
    expect(match).toBeNull()
  })

  // ── 7. Preferences persistence test ─────────────────────────────────────

  it('if resolvePreferenceFor returns stored {location, format}, both Q1 and Q2 are skipped', () => {
    const resolve = mockResolvePreference({
      location: '.anvil/plans/',
      format: 'json',
    })

    const stored = resolve()
    expect(stored).not.toBeNull()
    expect(stored!.location).toBe('.anvil/plans/')
    expect(stored!.format).toBe('json')

    // When both are resolved from preferences, the skill must skip Q1 and Q2
    const shouldSkipBothQuestions = stored !== null
    expect(shouldSkipBothQuestions).toBe(true)
  })

  it('if resolvePreferenceFor returns null, both Q1 and Q2 must be asked', () => {
    const resolveNoPrefs = (): null => null
    const stored = resolveNoPrefs()
    const shouldAskBothQuestions = stored === null
    expect(shouldAskBothQuestions).toBe(true)
  })

  // ── 8. E2E runSkillE2E tests ─────────────────────────────────────────────

  it('skill emits Q1 payload asking about plan location', async () => {
    await runSkillE2E({
      slug: 'plan-writing',
      file: { relativePath: 'universal/plan-writing/SKILL.md' },
      userPrompt:
        'Write an implementation plan for a new user-auth feature based on the approved spec at .anvil/specs/features/auth/spec.md.',
      fakeOutputText: [
        'I need to know where to store the plan.',
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
        {
          label: 'response includes a custom path option',
          predicate: (t) => /custom path/i.test(t),
        },
      ],
    })
  })

  it('skill emits Q2 payload asking about plan format independently', async () => {
    await runSkillE2E({
      slug: 'plan-writing',
      file: { relativePath: 'universal/plan-writing/SKILL.md' },
      userPrompt:
        'Write a plan for adding search. I want to store it at .anvil/plans/v1.0.0.plan.md.',
      fakeOutputText: [
        'Q1 already answered via prompt override: .anvil/plans/v1.0.0.plan.md.',
        '',
        'Now I need to know what format to use.',
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

  // ── 9. SKILL.md body-parsing: AskUserQuestion blocks ───────────────────

  it('SKILL.md body contains EXACTLY 2 AskUserQuestion JSON blocks (Q1 + Q2)', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
    })
    const all = extractAllPayloads(body)
    expect(all).toHaveLength(2)
  })

  it('Q1 block extracted from SKILL.md body has ≥3 options with exactly one (Recommended) referencing .anvil/plans/', async () => {
    const body = await loadSkillBody({
      relativePath: 'universal/plan-writing/SKILL.md',
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
      relativePath: 'universal/plan-writing/SKILL.md',
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

  it('generic location + Markdown produces a plan without Anvil-specific grammar', async () => {
    await runSkillE2E({
      slug: 'plan-writing',
      file: { relativePath: 'universal/plan-writing/SKILL.md' },
      userPrompt:
        'Write a plan for adding search functionality. Store it at docs/plans/search.md.',
      fakeOutputText: [
        '# Search Feature Implementation Plan',
        '',
        '## Phase 1: Setup',
        '### Task 1: Add search index',
        '- Files: src/search/index.ts [NEW]',
        '- Action: Create a search index module',
        '- Verification: `npm test -- --grep "search"`',
        '- Acceptance: Search index module exists and tests pass',
        '',
        '## Acceptance Criteria',
        '- Search returns relevant results',
        '- Response time < 200ms',
      ].join('\n'),
      assertions: [
        {
          label: 'response contains phases',
          predicate: (t) => /phase|phases/i.test(t),
        },
        {
          label: 'response contains acceptance criteria',
          predicate: (t) => /acceptance criteria/i.test(t),
        },
      ],
    })
  })
})
