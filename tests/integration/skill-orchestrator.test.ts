import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSkillFile } from '../../src/skills/loader.js'

const SKILLS_ROOT = join(
  new URL('.', import.meta.url).pathname,
  '../../skills/universal',
)

describe('skill-orchestration (Plan 31 C4)', () => {
  it('loads without error', async () => {
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal', {
      warnOnInvalid: false,
    })
    expect(skill).toBeDefined()
    expect(skill!.frontmatter.name).toBe('skill-orchestration')
  })

  it('has kind: meta', async () => {
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(skill!.frontmatter.kind).toBe('meta')
  })

  it('is not user-invocable', async () => {
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(skill!.frontmatter['user-invocable']).toBe(false)
  })

  it('has group: orchestration', async () => {
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(skill!.frontmatter.group).toBe('orchestration')
  })

  it('body contains EXTREMELY-IMPORTANT block', async () => {
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(skill!.body).toContain('<EXTREMELY-IMPORTANT>')
    expect(skill!.body).toContain('</EXTREMELY-IMPORTANT>')
  })

  it('body contains deferral language for active routing directives', async () => {
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal')
    // Reconciliation: the skill must defer to a high-confidence routing directive
    // when one is already active (Plan 31 C4 reconciliation paragraph).
    expect(skill!.body).toContain('routing directive')
    expect(skill!.body).toMatch(/defer|defers/i)
  })

  it('body is under 4KB', async () => {
    // Plan 40 Phase D appended a decision-tree section to this skill body
    // (skill vs agent vs command). Cap raised from 2KB to 4KB to accommodate
    // the new content while keeping it lightweight.
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal')
    expect(Buffer.byteLength(skill!.body, 'utf-8')).toBeLessThanOrEqual(4096)
  })

  it('body contains routing-by-intent table', async () => {
    const skillPath = join(SKILLS_ROOT, 'skill-orchestration.md')
    const skill = await loadSkillFile(skillPath, 'universal')
    // Should include at least these key intents
    expect(skill!.body).toContain('planning')
    expect(skill!.body).toContain('code-reviewer')
    expect(skill!.body).toContain('ultra-worker')
    expect(skill!.body).toContain('researcher')
  })
})
