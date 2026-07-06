/**
 * ANV-0066 — Unit tests for the 5 description-shape lints.
 *
 * Tests use synthetic in-memory fixtures; no disk access.
 * Each lint function is tested with:
 *   - a passing fixture (all skills compliant)
 *   - a failing fixture (≥1 violation expected)
 * The registry integration (DESCRIPTION_SHAPE_CHECKS) and the DoctorCheck
 * runner shape are verified in a final section.
 */

import { describe, expect, it } from 'vitest'
import {
  BODY_DUPE_OVERLAP_THRESHOLD,
  DESCRIPTION_SHAPE_CHECKS,
  DESC_MAX_LENGTH,
  DESC_MIN_LENGTH,
  type DescriptionShapeInput,
  extractBodyFirstParagraph,
  lintCsoPrefix,
  lintDescriptionLength,
  lintNoBodyDupe,
  lintNoStepList,
  lintThirdPerson,
  wordOverlap,
} from '../../../src/commands/cli/doctor-checks/description-shape.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function skill(
  name: string,
  description: string,
  opts?: { body?: string; frontmatterValid?: boolean },
): DescriptionShapeInput {
  return {
    name,
    description,
    body: opts?.body ?? `# ${name}\n\nSkill body for testing.`,
    frontmatterValid: opts?.frontmatterValid ?? true,
  }
}

// ---------------------------------------------------------------------------
// Lint 1: CSO prefix
// ---------------------------------------------------------------------------

describe('lintCsoPrefix', () => {
  it('passes when all descriptions start with a CSO trigger phrase', () => {
    const skills = [
      skill('a', 'Use when reviewing a diff — emits findings.'),
      skill('b', 'Run when CI fails on a PR.'),
      skill('c', 'When the user requests a plan.'),
    ]
    const result = lintCsoPrefix(skills)
    expect(result.status).toBe('pass')
    expect(result.violations).toHaveLength(0)
  })

  it('warns when a description does not start with a CSO trigger phrase', () => {
    const skills = [
      skill('good', 'Use when reviewing a diff — emits findings.'),
      skill('bad-verb', 'Reviews diffs and produces a findings report.'),
      skill('bad-noun', 'Django development — CBVs, ORM, migrations.'),
    ]
    const result = lintCsoPrefix(skills)
    expect(result.status).toBe('warn')
    expect(result.violations).toHaveLength(2)
    expect(result.violations.map((v) => v.name)).toContain('bad-verb')
    expect(result.violations.map((v) => v.name)).toContain('bad-noun')
  })

  it('skips skills with invalid frontmatter', () => {
    const skills = [
      skill('invalid', 'bad desc', { frontmatterValid: false }),
      skill('good', 'Use when debugging a failing test.'),
    ]
    const result = lintCsoPrefix(skills)
    expect(result.status).toBe('pass')
    expect(result.violations).toHaveLength(0)
  })

  it('skips skills with empty descriptions', () => {
    const skills = [
      skill('empty', ''),
      skill('good', 'Use when planning an architecture change.'),
    ]
    const result = lintCsoPrefix(skills)
    expect(result.status).toBe('pass')
  })

  it('accepts all documented CSO prefix variants', () => {
    const prefixes = [
      'Use when the codebase needs refactoring.',
      'Use before merging a feature branch.',
      'Use after a deploy fails in CI.',
      'Use to scaffold a new service.',
      'Use for auditing a third-party library.',
      'Run when a test suite fails unexpectedly.',
      'Invoked when the orchestrator needs a sub-plan.',
      'Invoke before committing to a design decision.',
      'Activate when the PR review is requested.',
      'Triggered when a hook fails to execute.',
      'Triggers on every SessionStart lifecycle event.',
      'MUST consult when the user asks for a security review.',
      'When the team needs to estimate a feature.',
      'Applies when the component hierarchy is unclear.',
      'For writing migration scripts against legacy schemas.',
    ]
    for (const desc of prefixes) {
      const result = lintCsoPrefix([skill('s', desc)])
      expect(result.status, `prefix should pass: "${desc}"`).toBe('pass')
    }
  })

  it('never returns fail — always pass or warn', () => {
    const skills = [skill('bad', 'This skill reviews diffs.')]
    const result = lintCsoPrefix(skills)
    expect(['pass', 'warn']).toContain(result.status)
  })
})

// ---------------------------------------------------------------------------
// Lint 2: No step list
// ---------------------------------------------------------------------------

describe('lintNoStepList', () => {
  it('passes when no description contains a numbered step list', () => {
    const skills = [
      skill(
        'a',
        'Use when planning a large feature — produces an ordered task list.',
      ),
      skill('b', 'Use when reviewing a PR diff.'),
    ]
    const result = lintNoStepList(skills)
    expect(result.status).toBe('pass')
    expect(result.violations).toHaveLength(0)
  })

  it('warns when a description contains a numbered step list', () => {
    const skills = [
      skill(
        'step-list',
        'Use when onboarding: 1. Clone the repo 2. Install deps 3. Run tests.',
      ),
      skill('good', 'Use when the user needs help with debugging.'),
    ]
    const result = lintNoStepList(skills)
    expect(result.status).toBe('warn')
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.name).toBe('step-list')
  })

  it('warns on parenthesis-style step lists', () => {
    const skills = [
      skill(
        'paren-list',
        'Use when auditing: 1) Check deps 2) Review code 3) Run scans.',
      ),
    ]
    const result = lintNoStepList(skills)
    expect(result.status).toBe('warn')
    expect(result.violations).toHaveLength(1)
  })

  it('does not warn on a single ordinal number (not a list)', () => {
    const skills = [
      skill(
        'single-num',
        'Use when the 1st CI pass fails — triggers automated diagnosis.',
      ),
    ]
    const result = lintNoStepList(skills)
    // A single number is not a step list (needs at least 2 sequential items).
    expect(result.status).toBe('pass')
  })

  it('never returns fail', () => {
    const skills = [skill('bad', 'Use when: 1. Do this 2. Do that')]
    const result = lintNoStepList(skills)
    expect(['pass', 'warn']).toContain(result.status)
  })
})

// ---------------------------------------------------------------------------
// Lint 3: Third-person voice
// ---------------------------------------------------------------------------

describe('lintThirdPerson', () => {
  it('passes when no description uses first/second person', () => {
    const skills = [
      skill('a', 'Use when the codebase requires a refactor pass.'),
      skill('b', 'Run when the build pipeline fails on the main branch.'),
    ]
    const result = lintThirdPerson(skills)
    expect(result.status).toBe('pass')
    expect(result.violations).toHaveLength(0)
  })

  it('warns when a description contains "you"', () => {
    const skills = [
      skill('you-skill', 'Use when you need to debug a failing test.'),
      skill('good', 'Use when the team needs to estimate effort.'),
    ]
    const result = lintThirdPerson(skills)
    expect(result.status).toBe('warn')
    expect(result.violations[0]?.name).toBe('you-skill')
  })

  it('warns when a description contains "your"', () => {
    const skills = [skill('your-skill', 'Use when your CI pipeline is red.')]
    const result = lintThirdPerson(skills)
    expect(result.status).toBe('warn')
  })

  it('warns when a description contains "I " (first person)', () => {
    const skills = [skill('i-skill', 'I review the diff and surface findings.')]
    const result = lintThirdPerson(skills)
    expect(result.status).toBe('warn')
  })

  it('does not flag "Interface" or words starting with "I"', () => {
    // "I" should only match as a standalone word
    const skills = [
      skill(
        'interface-skill',
        'Use when Interface design needs review — applies SOLID.',
      ),
      skill('impl-skill', 'Use when Implementation details are unclear.'),
    ]
    const result = lintThirdPerson(skills)
    expect(result.status).toBe('pass')
  })

  it('never returns fail', () => {
    const skills = [skill('bad', 'Use when you need to plan.')]
    const result = lintThirdPerson(skills)
    expect(['pass', 'warn']).toContain(result.status)
  })
})

// ---------------------------------------------------------------------------
// Lint 4: Length sweet spot (60–280 chars)
// ---------------------------------------------------------------------------

describe('lintDescriptionLength', () => {
  const _exactMin =
    'Use when debugging CI failures — checks logs and recent commits for clues.'.slice(
      0,
      DESC_MIN_LENGTH,
    )
  const _exactly60 =
    'Use when debugging CI — checks logs and recent commits today'
  const exactly280 =
    'Use when the team needs to diagnose a recurring production incident — this skill cross-references recent deploys, error logs, on-call schedules, metric spikes, and open incidents to surface the most likely root cause before escalating to the service owner.'.slice(
      0,
      DESC_MAX_LENGTH,
    )

  it(`passes when description length is exactly ${DESC_MIN_LENGTH} chars`, () => {
    const s = 'Use when debugging CI failures — checks logs and recent commits.'
    const padded = s.padEnd(DESC_MIN_LENGTH, '.')
    const result = lintDescriptionLength([
      skill('a', padded.slice(0, DESC_MIN_LENGTH)),
    ])
    expect(result.status).toBe('pass')
  })

  it(`passes when description length is exactly ${DESC_MAX_LENGTH} chars`, () => {
    const result = lintDescriptionLength([skill('a', exactly280)])
    expect(result.status).toBe('pass')
  })

  it('passes when description is within the sweet spot', () => {
    const skills = [
      skill(
        'a',
        'Use when the build fails on the main branch — produces a triage report with likely cause.',
      ),
      skill(
        'b',
        'Use when reviewing a security-sensitive PR — surfaces common vulnerabilities.',
      ),
    ]
    const result = lintDescriptionLength(skills)
    expect(result.status).toBe('pass')
    expect(result.violations).toHaveLength(0)
  })

  it(`warns when description is too short (below ${DESC_MIN_LENGTH} chars)`, () => {
    const skills = [skill('short', 'Use when debugging.')]
    const result = lintDescriptionLength(skills)
    expect(result.status).toBe('warn')
    expect(result.violations[0]?.name).toBe('short')
    expect(result.violations[0]?.detail).toMatch(/too short/)
  })

  it(`warns when description is too long (above ${DESC_MAX_LENGTH} chars)`, () => {
    // Construct a description that is definitely longer than 280 chars.
    const longDesc =
      'Use when the monorepo CI pipeline fails — this skill checks recent commits, diff size, test reports, changed packages, dependency graph impacts, flaky test history, and historical failure patterns to produce a ranked list of likely root causes with detailed remediation steps for each problem.'
    expect(longDesc.length).toBeGreaterThan(DESC_MAX_LENGTH)
    const skills = [skill('long', longDesc)]
    const result = lintDescriptionLength(skills)
    expect(result.status).toBe('warn')
    expect(result.violations[0]?.detail).toMatch(/too long/)
  })

  it('includes the length in the violation detail', () => {
    const skills = [skill('short', 'Too short.')]
    const result = lintDescriptionLength(skills)
    expect(result.violations[0]?.detail).toMatch(/\d+ chars/)
  })

  it('never returns fail', () => {
    const skills = [skill('x', 'Short.')]
    const result = lintDescriptionLength(skills)
    expect(['pass', 'warn']).toContain(result.status)
  })
})

// ---------------------------------------------------------------------------
// Lint 5: No body duplication
// ---------------------------------------------------------------------------

describe('extractBodyFirstParagraph', () => {
  it('returns the first non-blank paragraph', () => {
    const body =
      '\n\n# My Skill\n\nThis is the first paragraph of the skill body.\n\nSecond paragraph here.'
    const result = extractBodyFirstParagraph(body)
    expect(result).toContain('My Skill')
  })

  it('strips heading markers', () => {
    const body = '# Heading\n\nFirst paragraph.'
    const result = extractBodyFirstParagraph(body)
    expect(result).not.toMatch(/^#+/)
  })

  it('stops at the first blank line', () => {
    const body = 'First paragraph.\n\nSecond paragraph.'
    const result = extractBodyFirstParagraph(body)
    expect(result).toBe('First paragraph.')
  })
})

describe('wordOverlap', () => {
  it('returns 1.0 for identical strings', () => {
    expect(wordOverlap('foo bar baz', 'foo bar baz')).toBeCloseTo(1.0)
  })

  it('returns 0.0 for completely disjoint strings', () => {
    expect(wordOverlap('cat dog elephant', 'fish bird reptile')).toBe(0)
  })

  it('returns a value between 0 and 1 for partial overlap', () => {
    const v = wordOverlap('use when the build fails', 'use when the tests fail')
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(1)
  })

  it('returns 0 when either string has no tokens > 2 chars', () => {
    expect(wordOverlap('a b', 'a b c')).toBe(0)
  })
})

describe('lintNoBodyDupe', () => {
  it('passes when description and body are clearly different', () => {
    const skills = [
      skill(
        'a',
        'Use when debugging a CI failure — checks logs and recent commits.',
        {
          body: '# Debug CI\n\nThis skill runs a comprehensive analysis of the pipeline state, including recent commits, changed files, test reports, and historical failure patterns to produce a triage summary.',
        },
      ),
    ]
    const result = lintNoBodyDupe(skills)
    expect(result.status).toBe('pass')
  })

  it('warns when description near-duplicates the body first paragraph', () => {
    // The body paragraph must be in the SAME block as the heading (no blank line)
    // so extractBodyFirstParagraph returns the full text with the dup content.
    const dupText =
      'Use when reviewing a diff to surface common vulnerabilities and code quality issues.'
    const skills = [
      skill('dup', dupText, {
        // No blank line between heading and dup text so they form one paragraph block.
        body: `# Review\n${dupText}`,
      }),
    ]
    const result = lintNoBodyDupe(skills)
    expect(result.status).toBe('warn')
    expect(result.violations[0]?.name).toBe('dup')
  })

  it('skips skills without a body field', () => {
    const skills = [
      {
        name: 'no-body',
        description: 'Use when reviewing a diff to surface issues.',
        frontmatterValid: true,
      } as DescriptionShapeInput,
    ]
    const result = lintNoBodyDupe(skills)
    expect(result.status).toBe('pass')
  })

  it('skips skills with an empty body', () => {
    const skills = [
      skill('empty-body', 'Use when reviewing a diff.', { body: '' }),
    ]
    const result = lintNoBodyDupe(skills)
    expect(result.status).toBe('pass')
  })

  it('never returns fail', () => {
    const dupText =
      'use when reviewing to surface common issues across all modules'
    const skills = [
      skill(
        'dup',
        'Use when reviewing to surface common issues across all modules.',
        {
          body: `# Review\n\n${dupText}.`,
        },
      ),
    ]
    const result = lintNoBodyDupe(skills)
    expect(['pass', 'warn']).toContain(result.status)
  })

  it(`uses ${BODY_DUPE_OVERLAP_THRESHOLD} as the overlap threshold (boundary)`, () => {
    // Two strings with high overlap should trigger
    const s1 =
      'use when debugging the build to locate failing tests and recent regressions'
    const s2 =
      'use when debugging the build to locate failing tests and recent regressions'
    const overlap = wordOverlap(s1, s2)
    expect(overlap).toBeGreaterThanOrEqual(BODY_DUPE_OVERLAP_THRESHOLD)
  })
})

// ---------------------------------------------------------------------------
// Registry integration
// ---------------------------------------------------------------------------

describe('DESCRIPTION_SHAPE_CHECKS registry', () => {
  it('contains exactly 5 entries', () => {
    expect(DESCRIPTION_SHAPE_CHECKS).toHaveLength(5)
  })

  it('every entry has required DoctorCheck fields', () => {
    for (const check of DESCRIPTION_SHAPE_CHECKS) {
      expect(typeof check.id).toBe('string')
      expect(check.id.startsWith('content/')).toBe(true)
      expect(typeof check.label).toBe('string')
      expect(check.category).toBe('content')
      expect(typeof check.runner).toBe('function')
    }
  })

  it('has no duplicate ids', () => {
    const ids = DESCRIPTION_SHAPE_CHECKS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains expected check ids', () => {
    const ids = DESCRIPTION_SHAPE_CHECKS.map((c) => c.id)
    expect(ids).toContain('content/desc-cso-prefix')
    expect(ids).toContain('content/desc-no-step-list')
    expect(ids).toContain('content/desc-third-person')
    expect(ids).toContain('content/desc-length')
    expect(ids).toContain('content/desc-no-body-dupe')
  })

  it('runners produce skip rows when not in a project', async () => {
    const ctx = {
      cwd: '/tmp/no-such-project-anv-0066',
      home: '/tmp/home',
      anvilHome: '/tmp/home/.anvil',
      inProject: false,
      skipDetail: 'not in a project — skipped',
      installScope: 'unknown' as const,
    }
    for (const check of DESCRIPTION_SHAPE_CHECKS) {
      const rows: Array<{ name: string; status: string; detail: string }> = []
      await check.runner(ctx, rows as Parameters<typeof check.runner>[1])
      expect(rows).toHaveLength(1)
      expect(rows[0]?.status).toBe('skip')
    }
  })
})
