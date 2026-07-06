import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadAllAgents } from '../../../src/agents/load-all.js'
import { applyDisambiguator } from '../../../src/core/disambiguator.js'
import { loadSkillFile } from '../../../src/skills/loader.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// ── Unit tests for applyDisambiguator ─────────────────────────────────────

describe('applyDisambiguator (pure function)', () => {
  it("prefixes description with Anvil's <disambiguator>: <original>", () => {
    const result = applyDisambiguator('planning', 'Breaks tasks into subtasks')
    expect(result.description).toBe(
      "Anvil's planning: Breaks tasks into subtasks",
    )
    expect(result.originalDescription).toBe('Breaks tasks into subtasks')
  })

  it('preserves originalDescription unchanged', () => {
    const original = 'Reviews code for quality'
    const result = applyDisambiguator('code-reviewer', original)
    expect(result.originalDescription).toBe(original)
  })

  it('leaves description unchanged when combined length ≤ 200 chars', () => {
    const disambiguator = 'short'
    const original = 'A short description'
    const result = applyDisambiguator(disambiguator, original)
    expect(result.description.length).toBeLessThanOrEqual(200)
    expect(result.description).toBe(`Anvil's short: A short description`)
  })

  it('truncates original at word boundary when combined length > 200 chars', () => {
    const disambiguator =
      'graded reviewer — severity-tagged findings with file:line'
    // Build an original that is long enough to exceed 200 chars when combined
    const original =
      'Reviews diffs or files for quality security style test coverage confidence filtered this is extra text that pushes it over the limit for sure definitely'
    const result = applyDisambiguator(disambiguator, original)
    expect(result.description.length).toBeLessThanOrEqual(200)
    expect(result.description.endsWith('…')).toBe(true)
    // Should not cut mid-word — char before ellipsis should not be a partial word
    const beforeEllipsis = result.description.slice(0, -1)
    expect(beforeEllipsis.endsWith(' ')).toBe(false) // trimmed at word boundary
  })

  it('throws when disambiguator prefix alone is ≥ 200 chars', () => {
    // Build a disambiguator that makes "Anvil's <disambiguator>: " ≥ 200 chars
    const longDisambiguator = 'x'.repeat(192) // "Anvil's " (8) + 192 + ": " (2) = 202
    expect(() =>
      applyDisambiguator(longDisambiguator, 'any description'),
    ).toThrow(/Disambiguator too long/)
  })
})

// ── Integration tests through the file loaders ────────────────────────────

const SKILL_TEMPLATE = (disambiguator?: string) => `---
name: test-skill
kind: atomic
group: testing
description: Original description of the skill
preferred_model: claude-opus-4-6
preferred_effort: high
${disambiguator ? `disambiguator: "${disambiguator}"\n` : ''}---

Skill body content here.
`

const AGENT_TEMPLATE = (disambiguator?: string) => `---
name: test-agent
description: Original agent description
${disambiguator ? `disambiguator: "${disambiguator}"\n` : ''}---

Agent body content here.
`

describe('skill loader — disambiguator integration', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('disambiguator-test')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('skill with disambiguator gets prefixed description; originalDescription preserved', async () => {
    const skillPath = join(tmpDir, 'test-skill.md')
    await writeFile(skillPath, SKILL_TEMPLATE('test disambiguator'))
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(skill).toBeDefined()
    expect(skill!.frontmatter.description).toBe(
      "Anvil's test disambiguator: Original description of the skill",
    )
    expect(skill!.originalDescription).toBe('Original description of the skill')
  })

  it('skill without disambiguator has unchanged description and no originalDescription', async () => {
    const skillPath = join(tmpDir, 'test-skill.md')
    await writeFile(skillPath, SKILL_TEMPLATE())
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(skill).toBeDefined()
    expect(skill!.frontmatter.description).toBe(
      'Original description of the skill',
    )
    expect(skill!.originalDescription).toBeUndefined()
  })

  it('skill with combined length > 200 gets truncated original with ellipsis', async () => {
    const disambiguator =
      'graded reviewer — severity-tagged findings with file:line'
    const skillPath = join(tmpDir, 'test-skill.md')
    // Override the template with a long description
    const content = `---
name: test-skill
kind: atomic
group: testing
description: Reviews diffs or files for quality security style test coverage confidence filtered with many extra words that push this well over the two hundred character limit for sure
preferred_model: claude-opus-4-6
preferred_effort: high
disambiguator: "${disambiguator}"
---

Body here.
`
    await writeFile(skillPath, content)
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(skill).toBeDefined()
    expect(skill!.frontmatter.description.length).toBeLessThanOrEqual(200)
    expect(skill!.frontmatter.description.endsWith('…')).toBe(true)
  })

  it('agent with disambiguator gets prefixed description; originalDescription preserved', async () => {
    const agentPath = join(tmpDir, 'test-agent.md')
    await writeFile(agentPath, AGENT_TEMPLATE('parallel-wave orchestrator'))
    const registry = await loadAllAgents({ agentsRoot: tmpDir })
    const agents = registry.getAll()
    expect(agents).toHaveLength(1)
    expect(agents[0].frontmatter.description).toBe(
      "Anvil's parallel-wave orchestrator: Original agent description",
    )
    expect(agents[0].originalDescription).toBe('Original agent description')
  })

  it('agent without disambiguator has unchanged description and no originalDescription', async () => {
    const agentPath = join(tmpDir, 'test-agent.md')
    await writeFile(agentPath, AGENT_TEMPLATE())
    const registry = await loadAllAgents({ agentsRoot: tmpDir })
    const agents = registry.getAll()
    expect(agents).toHaveLength(1)
    expect(agents[0].frontmatter.description).toBe('Original agent description')
    expect(agents[0].originalDescription).toBeUndefined()
  })

  it('skill with disambiguator prefix ≥200 chars fails to load gracefully', async () => {
    const longDisambiguator = 'x'.repeat(192)
    const skillPath = join(tmpDir, 'bad-skill.md')
    const content = `---
name: bad-skill
kind: atomic
group: testing
description: Some description
preferred_model: claude-opus-4-6
preferred_effort: high
disambiguator: "${longDisambiguator}"
---

Body here.
`
    await writeFile(skillPath, content)
    // Should return undefined and not throw (warn instead)
    const skill = await loadSkillFile(skillPath, 'universal', {
      warnOnInvalid: false,
    })
    expect(skill).toBeUndefined()
  })
})
