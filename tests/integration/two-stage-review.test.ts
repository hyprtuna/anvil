import { describe, expect, it } from 'vitest'
import { loadAllAgents } from '../../src/agents/load-all.js'
import { loadAllSkills } from '../../src/skills/load-all.js'

describe('integration: two-stage review framework (Plan 31 E2)', () => {
  it('spec-reviewer agent loads', async () => {
    const reg = await loadAllAgents({ agentsRoot: 'agents' })
    const names = reg.getAll().map((a) => a.frontmatter.name)
    expect(names).toContain('spec-reviewer')
  })

  it('code-quality-reviewer agent loads', async () => {
    const reg = await loadAllAgents({ agentsRoot: 'agents' })
    const names = reg.getAll().map((a) => a.frontmatter.name)
    expect(names).toContain('code-quality-reviewer')
  })

  it('two-stage-review skill loads', async () => {
    const reg = await loadAllSkills({ skillsRoot: 'skills' })
    const names = reg.getAll().map((s) => s.frontmatter.name)
    expect(names).toContain('two-stage-review')
  })

  it('spec-reviewer is read-only (disallowedTools contains Edit and Bash)', async () => {
    const reg = await loadAllAgents({ agentsRoot: 'agents' })
    const agent = reg
      .getAll()
      .find((a) => a.frontmatter.name === 'spec-reviewer')
    expect(agent).toBeDefined()
    expect(agent!.frontmatter.disallowedTools).toBeDefined()
    expect(agent!.frontmatter.disallowedTools).toContain('Edit')
    expect(agent!.frontmatter.disallowedTools).toContain('Bash')
  })

  it('code-quality-reviewer is read-only (disallowedTools contains Edit and Bash)', async () => {
    const reg = await loadAllAgents({ agentsRoot: 'agents' })
    const agent = reg
      .getAll()
      .find((a) => a.frontmatter.name === 'code-quality-reviewer')
    expect(agent).toBeDefined()
    expect(agent!.frontmatter.disallowedTools).toBeDefined()
    expect(agent!.frontmatter.disallowedTools).toContain('Edit')
    expect(agent!.frontmatter.disallowedTools).toContain('Bash')
  })

  it('two-stage-review skill is not user-invocable', async () => {
    const reg = await loadAllSkills({ skillsRoot: 'skills' })
    const skill = reg
      .getAll()
      .find((s) => s.frontmatter.name === 'two-stage-review')
    expect(skill).toBeDefined()
    expect(skill!.frontmatter.userInvocable).toBe(false)
  })

  it('two-stage-review addendum references both reviewer agents', async () => {
    // ANV-0192: spec-reviewer / code-quality-reviewer are Anvil-flavored
    // agent invocations (Plan 30 contract). They live in the addendum so the
    // user-bundle body stays Anvil-clean for non-Anvil users.
    const { readFileSync } = await import('node:fs')
    const addendum = readFileSync(
      'skills/universal/two-stage-review-anvil-addendum.md',
      'utf-8',
    )
    expect(addendum).toContain('spec-reviewer')
    expect(addendum).toContain('code-quality-reviewer')
  })

  it('spec-reviewer body references review_type:spec-compliance', async () => {
    const reg = await loadAllAgents({ agentsRoot: 'agents' })
    const agent = reg
      .getAll()
      .find((a) => a.frontmatter.name === 'spec-reviewer')
    expect(agent).toBeDefined()
    expect(agent!.body).toContain('spec-compliance')
  })

  it('code-quality-reviewer body references review_type:code-quality', async () => {
    const reg = await loadAllAgents({ agentsRoot: 'agents' })
    const agent = reg
      .getAll()
      .find((a) => a.frontmatter.name === 'code-quality-reviewer')
    expect(agent).toBeDefined()
    expect(agent!.body).toContain('code-quality')
  })
})
