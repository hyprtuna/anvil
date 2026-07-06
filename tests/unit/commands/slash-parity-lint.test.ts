import { describe, expect, it } from 'vitest'
import {
  type SemanticViolation,
  cliStemsFromFilenames,
  lintSlashSemanticParity,
} from '../../../src/commands/slash/parity-lint.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KNOWN_SKILLS = new Set([
  'code-review',
  'debugging',
  'plan-writing',
  'security-auditing',
  'brainstorming',
  'deep-diving',
  'feature-development',
  'test-driven-development',
  'verification',
])

const KNOWN_AGENTS = new Set([
  'code-reviewer',
  'code-architect',
  'ultra-worker',
  'orchestrator',
  'plan-verifier',
  'researcher',
])

const KNOWN_CLI = new Set([
  'review',
  'plan',
  'debug',
  'start-research',
  'verify',
  'ultra',
  'agents',
])

function makeFile(
  name: string,
  body: string,
  frontmatter = 'name: test\ndescription: test',
): { path: string; content: string } {
  return {
    path: `/slash/${name}.md`,
    content: `---\n${frontmatter}\n---\n\n${body}`,
  }
}

// ---------------------------------------------------------------------------
// lintSlashSemanticParity — core behaviour
// ---------------------------------------------------------------------------

describe('lintSlashSemanticParity', () => {
  it('returns no violations when all referenced slugs are known', () => {
    const file = makeFile(
      'review',
      'Invoke the `code-review` skill via the `code-reviewer` agent.',
    )
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })

  it('detects unknown skill reference — W-004 scenario', () => {
    // The old review.md said "Invoke the `code-reviewer` skill" which is wrong:
    // code-reviewer is an agent, not a skill.  From the linter's perspective,
    // "code-reviewer" IS known (it's in the agent registry), so no violation.
    // But a truly non-existent slug should raise one.
    const file = makeFile('review-old', 'Invoke the `nonexistent-skill` skill.')
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].slug).toBe('nonexistent-skill')
    expect(violations[0].file).toBe('/slash/review-old.md')
    expect(violations[0].line).toBeGreaterThan(0)
    expect(violations[0].detail).toContain('nonexistent-skill')
  })

  it('reports file:line for every violation', () => {
    const body = [
      'Invoke the `code-review` skill.',
      'Load the `phantom-agent` agent.',
    ].join('\n')
    const file = makeFile('multi', body)
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(1)
    const v = violations[0] as SemanticViolation
    expect(v.file).toBe('/slash/multi.md')
    // Line should be > 1 (body starts after frontmatter)
    expect(v.line).toBeGreaterThan(1)
    expect(v.slug).toBe('phantom-agent')
  })

  it('ignores lines without invocation patterns — no false positives', () => {
    // A generic sentence mentioning a backtick term should NOT trigger.
    const file = makeFile('generic', 'Use `some-thing` for reference only.')
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })

  it('skips excluded token slugs (tier names, flag values)', () => {
    // "quick", "review", "planning" etc. appear in --tier docs but are not
    // skill slugs that should be validated.
    const file = makeFile(
      'debug',
      'If the user passes `--tier <name>` (e.g. `quick`, `coding`, `review`, `planning`, `ultra`, `super`), forward it to the CLI — it selects the model.',
    )
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })

  it('respects parity_lint: skip frontmatter opt-out', () => {
    const file = makeFile(
      'skipped',
      'Invoke the `phantom-thing` skill.',
      'name: skipped\ndescription: test\nparity_lint: skip',
    )
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })

  it('validates multiple files and aggregates violations', () => {
    const files = [
      makeFile('ok', 'Invoke the `code-review` skill.'),
      makeFile('bad1', 'Load the `ghost-skill` skill.'),
      makeFile('bad2', 'Dispatch `ghost-agent` to run the task.'),
    ]
    const violations = lintSlashSemanticParity(
      files,
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(2)
    const slugs = violations.map((v) => v.slug)
    expect(slugs).toContain('ghost-skill')
    expect(slugs).toContain('ghost-agent')
  })

  it('does not require invocation_surface frontmatter — it is optional', () => {
    const file = makeFile(
      'no-surface',
      'Invoke the `debugging` skill.',
      'name: no-surface\ndescription: test',
    )
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })

  it('invoked_surface frontmatter field is accepted without error', () => {
    const file = makeFile(
      'with-surface',
      'Invoke the `code-review` skill.',
      'name: with-surface\ndescription: test\ninvoked_surface: skill',
    )
    // Should produce no violations — surface field is informational
    expect(() =>
      lintSlashSemanticParity([file], KNOWN_SKILLS, KNOWN_AGENTS, KNOWN_CLI),
    ).not.toThrow()
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })

  it('correctly recognises code-review (skill) vs code-reviewer (agent) — W-004', () => {
    // code-review → skill registry ✓, code-reviewer → agent registry ✓
    // Both should pass without violations.
    const file = makeFile(
      'review-correct',
      'Invoke the `code-review` skill via the `code-reviewer` agent.',
    )
    const violations = lintSlashSemanticParity(
      [file],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })

  it('returns zero violations for empty file list', () => {
    const violations = lintSlashSemanticParity(
      [],
      KNOWN_SKILLS,
      KNOWN_AGENTS,
      KNOWN_CLI,
    )
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// cliStemsFromFilenames
// ---------------------------------------------------------------------------

describe('cliStemsFromFilenames', () => {
  it('strips .ts extension', () => {
    const stems = cliStemsFromFilenames(['review.ts', 'plan.ts', 'debug.ts'])
    expect(stems.has('review')).toBe(true)
    expect(stems.has('plan')).toBe(true)
    expect(stems.has('debug')).toBe(true)
  })

  it('strips .js extension (compiled bundle)', () => {
    const stems = cliStemsFromFilenames(['review.js', 'plan.js'])
    expect(stems.has('review')).toBe(true)
    expect(stems.has('plan')).toBe(true)
  })

  it('skips non-.ts/.js files', () => {
    const stems = cliStemsFromFilenames(['CLAUDE.md', 'common', 'review.ts'])
    expect(stems.has('CLAUDE')).toBe(false)
    expect(stems.has('common')).toBe(false)
    expect(stems.has('review')).toBe(true)
  })

  it('returns empty set for empty input', () => {
    expect(cliStemsFromFilenames([])).toEqual(new Set())
  })
})
