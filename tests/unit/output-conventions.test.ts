/**
 * Static lint for Plan 31 D6 — output discipline conventions.
 *
 * Asserts:
 * 1. Each D2-targeted skill body contains a `## Status` opener and
 *    `## Done` closer with one of the 4 valid state words.
 * 2. Each D5-targeted agent body contains `## Status: <name> starting`
 *    and `## Status: <name> done`.
 * 3. `skills/universal/code-reviewer.md` contains all 5 severity levels
 *    and still references `review_type` (Plan 30 preservation).
 * 4. `skills/universal/git-workflow.md` contains the Commit Status template.
 * 5. `skills/universal/github-workflow.md` contains the PR Created template.
 * 6. `skills/universal/doc-writing.md` contains the Documents Written template.
 *
 * Behavioral layer (eval_fixtures):
 * TODO(Plan 31 D6): wire a fixture per affected skill that captures runtime
 * output and asserts markers appear at runtime, not just in the prompt body.
 * Blocked on eval_fixtures infrastructure being directly testable from unit
 * tests (see src/commands/cli/skill.ts `eval` subcommand). Tracking in Plan 31.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ANV-0083: some skills moved to subdir form (e.g. brainstorm-spec, code-review,
// plan-verification) to colocate Task(general-purpose) prompt bodies.  Prefer
// the flat form when present; otherwise fall back to <name>/SKILL.md.
function readSkill(name: string): string {
  const flat = `skills/universal/${name}.md`
  const subdir = `skills/universal/${name}/SKILL.md`
  try {
    return readFileSync(flat, 'utf-8')
  } catch {
    return readFileSync(subdir, 'utf-8')
  }
}

function readAgent(name: string): string {
  return readFileSync(`agents/${name}.md`, 'utf-8')
}

const VALID_STATES = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED']

function hasStatusOpener(content: string): boolean {
  return /^## Status\b/m.test(content)
}

function hasDoneCloser(content: string): boolean {
  // Must end with `## Done` and at least one valid state word on that line or immediately following
  return (
    /^## Done\b/m.test(content) &&
    VALID_STATES.some((s) => content.includes(`status: ${s}`))
  )
}

function hasAgentStartMarker(content: string, name: string): boolean {
  return content.includes(`## Status: ${name} starting`)
}

function hasAgentDoneMarker(content: string, name: string): boolean {
  return content.includes(`## Status: ${name} done`)
}

// ---------------------------------------------------------------------------
// D2 — Four-state vocabulary in 13 skills
// ---------------------------------------------------------------------------

const D2_SKILLS = [
  'feature-development',
  'test-driven-development',
  'verification',
  'code-review',
  'review-response',
  'git-workflow',
  'github-workflow',
  'doc-writing',
  'debugging',
  'slop-removal',
  'silent-failure-discipline',
  'research',
  'deep-diving',
]

describe('D2 — four-state completion vocabulary in skills', () => {
  for (const name of D2_SKILLS) {
    it(`${name}: has ## Status opener`, () => {
      const content = readSkill(name)
      expect(hasStatusOpener(content), `${name} missing ## Status opener`).toBe(
        true,
      )
    })

    it(`${name}: has ## Done closer with valid state`, () => {
      const content = readSkill(name)
      expect(
        hasDoneCloser(content),
        `${name} missing ## Done closer with a valid status word`,
      ).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------
// D3 — Completion templates in silent skills
// ---------------------------------------------------------------------------

describe('D3 — completion templates in silent skills', () => {
  it('git-workflow: contains ## Commit Status template', () => {
    const content = readSkill('git-workflow')
    expect(content).toContain('## Commit Status')
    expect(content).toContain('**SHA:**')
    expect(content).toContain('**Branch:**')
    expect(content).toContain('**Files changed:**')
  })

  it('github-workflow: contains ## PR Created template', () => {
    const content = readSkill('github-workflow')
    expect(content).toContain('## PR Created')
    expect(content).toContain('**URL:**')
    expect(content).toContain('**Title:**')
    expect(content).toContain('**CI next step:**')
  })

  it('doc-writing: contains ## Documents Written template', () => {
    const content = readSkill('doc-writing')
    expect(content).toContain('## Documents Written')
    expect(content).toContain('| File |')
    expect(content).toContain('| Lines |')
  })
})

// ---------------------------------------------------------------------------
// D4 — code-reviewer severity taxonomy + review_type preservation
// ---------------------------------------------------------------------------
// ANV-0188 rework: severity levels now live in templates/code-review/default.md
// (injected via ${TEMPLATE:code-review}); review_type lives in plan30-addendum.md
// (loaded when format=JSON or Both). The SKILL.md body is clean of both.
// ---------------------------------------------------------------------------

const CODE_REVIEWER_SEVERITIES = [
  'CRITICAL',
  'MAJOR',
  'MINOR',
  'NIT',
  'QUESTION',
]

function readCodeReviewTemplate(): string {
  return readFileSync('templates/code-review/default.md', 'utf-8')
}

function readCodeReviewAddendum(): string {
  return readFileSync(
    'skills/universal/code-review/plan30-addendum.md',
    'utf-8',
  )
}

describe('D4 — code-reviewer severity taxonomy and Plan 30 review_type preservation', () => {
  let templateContent: string
  let addendumContent: string
  let skillContent: string

  it('loads templates/code-review/default.md', () => {
    templateContent = readCodeReviewTemplate()
    expect(templateContent.length).toBeGreaterThan(0)
  })

  it('loads skills/universal/code-review/plan30-addendum.md', () => {
    addendumContent = readCodeReviewAddendum()
    expect(addendumContent.length).toBeGreaterThan(0)
  })

  for (const severity of CODE_REVIEWER_SEVERITIES) {
    it(`code-review template contains severity level: ${severity}`, () => {
      templateContent = templateContent ?? readCodeReviewTemplate()
      expect(templateContent).toContain(`\`${severity}\``)
    })
  }

  it('code-review addendum references review_type (Plan 30 preservation)', () => {
    addendumContent = addendumContent ?? readCodeReviewAddendum()
    expect(addendumContent).toContain('review_type')
  })

  it('code-review addendum mentions ReviewReport JSON', () => {
    addendumContent = addendumContent ?? readCodeReviewAddendum()
    expect(addendumContent).toContain('ReviewReport')
  })

  it('SKILL.md body is clean of review_type (two-question pattern)', () => {
    skillContent = skillContent ?? readSkill('code-review')
    expect(skillContent).not.toContain('review_type')
  })
})

// ---------------------------------------------------------------------------
// D5 — Agent start/end markers in all 16 agents
// ---------------------------------------------------------------------------

// ANV-0083 — retroactive-validator and type-design-analyzer collapsed into
// sibling Task(general-purpose) prompts under their consuming skills.
const D5_AGENTS = [
  'orchestrator',
  'ultra-worker',
  'code-architect',
  'code-explorer',
  'code-reviewer',
  'plan-verifier',
  'strict-reviewer',
  'silent-failure-hunter',
  'test-analyzer',
  'code-simplifier',
  'doc-verifier',
  'framework-selector',
  'mcp-builder',
  'researcher',
]

describe('D5 — agent start/end status markers', () => {
  for (const name of D5_AGENTS) {
    it(`${name}: has ## Status: ${name} starting marker`, () => {
      const content = readAgent(name)
      expect(
        hasAgentStartMarker(content, name),
        `agents/${name}.md missing ## Status: ${name} starting`,
      ).toBe(true)
    })

    it(`${name}: has ## Status: ${name} done marker`, () => {
      const content = readAgent(name)
      expect(
        hasAgentDoneMarker(content, name),
        `agents/${name}.md missing ## Status: ${name} done`,
      ).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------
// .anvil/specs/output-conventions.md existence check (ANV-0131: moved from docs/anvil/)
// ---------------------------------------------------------------------------

describe('D1 — output-conventions doc exists', () => {
  it('.anvil/specs/output-conventions.md exists and is non-trivial', () => {
    const content = readFileSync('.anvil/specs/output-conventions.md', 'utf-8')
    expect(content).toContain('## The Four-Section Structure')
    expect(content).toContain('DONE')
    expect(content).toContain('DONE_WITH_CONCERNS')
    expect(content).toContain('NEEDS_CONTEXT')
    expect(content).toContain('BLOCKED')
  })
})
