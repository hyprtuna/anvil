/**
 * ANV-0103 — Unit tests for the bootstrap version-skew lint engine.
 *
 * Tests the pure lintBootstrapSkew() function against synthetic bootstrap
 * text. No disk I/O.
 */

import { describe, expect, it } from 'vitest'
import { lintBootstrapSkew } from '../../../../src/core/bootstrap-skew/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkills(...names: string[]): ReadonlySet<string> {
  return new Set(names)
}

function makeAgents(...names: string[]): ReadonlySet<string> {
  return new Set(names)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lintBootstrapSkew — no violations', () => {
  it('passes when all Skill() references resolve', () => {
    const text = `
Invoke a skill: \`Skill({skill: "anvil:code-review"})\`
Another: \`Skill({skill: "anvil:planning"})\`
`
    const result = lintBootstrapSkew(
      text,
      makeSkills('code-review', 'planning'),
      makeAgents(),
    )
    expect(result.violations).toHaveLength(0)
    expect(result.refsFound).toBe(2)
  })

  it('passes when all Agent() references resolve', () => {
    const text = `Agent({subagent_type: "anvil:code-architect"})`
    const result = lintBootstrapSkew(
      text,
      makeSkills(),
      makeAgents('code-architect'),
    )
    expect(result.violations).toHaveLength(0)
    expect(result.refsFound).toBe(1)
  })

  it('passes when bare prose references resolve in either registry', () => {
    const text = 'Use anvil:code-review or anvil:ultra-worker'
    const result = lintBootstrapSkew(
      text,
      makeSkills('code-review'),
      makeAgents('ultra-worker'),
    )
    expect(result.violations).toHaveLength(0)
    expect(result.refsFound).toBe(2)
  })

  it('returns zero refsFound for empty bootstrap text', () => {
    const result = lintBootstrapSkew('', makeSkills(), makeAgents())
    expect(result.violations).toHaveLength(0)
    expect(result.refsFound).toBe(0)
  })
})

describe('lintBootstrapSkew — rename detection (acceptance criteria)', () => {
  it('fails when a Skill() reference is dangling after a rename', () => {
    // Simulates: skill "code-review" was renamed to "code-reviewing"
    const text = `Invoke \`Skill({skill: "anvil:code-review"})\``
    const result = lintBootstrapSkew(
      text,
      makeSkills('code-reviewing'), // old name no longer present
      makeAgents(),
    )
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.slug).toBe('code-review')
    expect(result.violations[0]?.surface).toBe('skill')
    expect(result.violations[0]?.ref).toBe('anvil:code-review')
  })

  it('fails when an Agent() reference is dangling after a rename', () => {
    const text = `Agent({subagent_type: "anvil:code-architect"})`
    const result = lintBootstrapSkew(
      text,
      makeSkills(),
      makeAgents('architecture-reviewer'), // old name no longer present
    )
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.slug).toBe('code-architect')
    expect(result.violations[0]?.surface).toBe('agent')
  })

  it('fails when a bare prose reference is dangling', () => {
    const text = 'See anvil:old-skill for details.'
    const result = lintBootstrapSkew(text, makeSkills(), makeAgents())
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.slug).toBe('old-skill')
    expect(result.violations[0]?.surface).toBe('unknown')
  })
})

describe('lintBootstrapSkew — remediation hints', () => {
  it('includes a remediation hint for dangling Skill() reference', () => {
    const text = `Skill({skill: "anvil:missing-skill"})`
    const result = lintBootstrapSkew(text, makeSkills(), makeAgents())
    expect(result.violations[0]?.hint).toContain('skills/using-anvil/SKILL.md')
    expect(result.violations[0]?.hint).toContain('anvil init')
  })

  it('includes a remediation hint for dangling Agent() reference', () => {
    const text = `Agent({subagent_type: "anvil:missing-agent"})`
    const result = lintBootstrapSkew(text, makeSkills(), makeAgents())
    expect(result.violations[0]?.hint).toContain('skills/using-anvil/SKILL.md')
  })

  it('includes a remediation hint for dangling bare reference', () => {
    const text = 'anvil:missing-slug'
    const result = lintBootstrapSkew(text, makeSkills(), makeAgents())
    expect(result.violations[0]?.hint).toContain('skills/using-anvil/SKILL.md')
  })
})

describe('lintBootstrapSkew — deduplication', () => {
  it('counts a slug once when it appears in both Skill() call and prose', () => {
    const text = `
Skill({skill: "anvil:code-review"})
Also see anvil:code-review for more info.
`
    const result = lintBootstrapSkew(
      text,
      makeSkills('code-review'),
      makeAgents(),
    )
    expect(result.refsFound).toBe(1)
    expect(result.violations).toHaveLength(0)
  })

  it('surface resolution: Skill() wins over bare prose for same slug', () => {
    const text = `Skill({skill: "anvil:review"}) and anvil:review`
    // review not in registry
    const result = lintBootstrapSkew(text, makeSkills(), makeAgents())
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.surface).toBe('skill')
  })
})

describe('lintBootstrapSkew — realistic bootstrap content', () => {
  it('passes on the real using-anvil/SKILL.md slug set', () => {
    // Snapshot of slugs actually referenced in the bootstrap file.
    const bootstrapText = `
## When to invoke

- "review" → \`Skill({skill: "anvil:code-review"})\`
- "plan" → \`Skill({skill: "anvil:planning"})\`
- "test-first" → \`Skill({skill: "anvil:test-driven-development"})\`
- "debug" → \`Skill({skill: "anvil:debugging"})\`
- "spec" → \`Skill({skill: "anvil:brainstorm-spec"})\`
- "build a feature" → \`Skill({skill: "anvil:feature-development"})\`
- "git" → \`Skill({skill: "anvil:git-workflow"})\`

- A long autonomous job → \`Agent({subagent_type: "anvil:ultra-worker"})\`
- Recursive task graph → \`Agent({subagent_type: "anvil:orchestrator"})\`
- Architectural review → \`Agent({subagent_type: "anvil:code-architect"})\`
`

    const skills = makeSkills(
      'code-review',
      'planning',
      'test-driven-development',
      'debugging',
      'brainstorm-spec',
      'feature-development',
      'git-workflow',
    )
    const agents = makeAgents('ultra-worker', 'orchestrator', 'code-architect')

    const result = lintBootstrapSkew(bootstrapText, skills, agents)
    expect(result.violations).toHaveLength(0)
  })
})
