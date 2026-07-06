/**
 * ANV-0072 — doctor row: "Skill CC-native fields adoption (context/agent)".
 *
 * Tests the pure scoring logic via `computeSkillCcFieldsAdoption` (exported
 * from doctor.ts) rather than duplicating it locally. This ensures the tests
 * exercise the actual production code path.
 */

import { describe, expect, it } from 'vitest'
import { computeSkillCcFieldsAdoption } from '../../../src/commands/cli/doctor.js'

describe('computeSkillCcFieldsAdoption', () => {
  it('returns skip when no skills are registered', () => {
    const result = computeSkillCcFieldsAdoption([])
    expect(result.status).toBe('skip')
    expect(result.detail).toContain('no skills registered')
  })

  it('returns warn when no skills declare context or agent', () => {
    const skills = [{ frontmatter: {} }, { frontmatter: {} }]
    const result = computeSkillCcFieldsAdoption(skills)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('context: fork as exemplar')
  })

  it('returns pass when at least one skill declares context: fork', () => {
    const skills = [
      { frontmatter: { context: 'fork' as const } },
      { frontmatter: {} },
    ]
    const result = computeSkillCcFieldsAdoption(skills)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('1 use context: fork')
  })

  it('returns pass when a skill declares context: inherit', () => {
    const skills = [
      { frontmatter: { context: 'inherit' as const } },
      { frontmatter: {} },
    ]
    const result = computeSkillCcFieldsAdoption(skills)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('1 use context: inherit')
  })

  it('returns pass when a skill delegates via agent:', () => {
    const skills = [
      { frontmatter: { agent: 'ultra-worker' } },
      { frontmatter: {} },
    ]
    const result = computeSkillCcFieldsAdoption(skills)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('1 delegate via agent:')
  })

  it('counts fork and inherit separately', () => {
    const skills = [
      { frontmatter: { context: 'fork' as const } },
      { frontmatter: { context: 'fork' as const } },
      { frontmatter: { context: 'inherit' as const } },
      { frontmatter: {} },
    ]
    const result = computeSkillCcFieldsAdoption(skills)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('2 use context: fork')
    expect(result.detail).toContain('1 use context: inherit')
  })

  it('combines fork, inherit, and agent counts in detail', () => {
    const skills = [
      { frontmatter: { context: 'fork' as const } },
      { frontmatter: { context: 'inherit' as const } },
      { frontmatter: { agent: 'plan-verifier' } },
    ]
    const result = computeSkillCcFieldsAdoption(skills)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('1 use context: fork')
    expect(result.detail).toContain('1 use context: inherit')
    expect(result.detail).toContain('1 delegate via agent:')
  })

  it('a skill with both context and agent is counted in both', () => {
    const skills = [
      { frontmatter: { context: 'fork' as const, agent: 'ultra-worker' } },
    ]
    const result = computeSkillCcFieldsAdoption(skills)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('1 use context: fork')
    expect(result.detail).toContain('1 delegate via agent:')
  })
})
