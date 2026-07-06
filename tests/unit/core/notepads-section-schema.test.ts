import { describe, expect, it } from 'vitest'
import { AgentFrontmatter, SkillFrontmatter } from '../../../src/core/types.js'

const baseSkill = {
  name: 'researcher',
  kind: 'atomic',
  group: 'research',
  description: 'A test skill',
  preferred_model: 'claude-sonnet',
  preferred_effort: 'medium',
}

const baseAgent = {
  name: 'orchestrator',
  description: 'Tier 2 parallel fan-out',
}

describe('notepads_section field (Plan 31 F2)', () => {
  describe('SkillFrontmatter', () => {
    it('accepts all valid notepads_section values', () => {
      const sections = [
        'learnings',
        'decisions',
        'issues',
        'verification',
        'problems',
      ] as const
      for (const section of sections) {
        const skill = SkillFrontmatter.parse({
          ...baseSkill,
          notepads_section: section,
        })
        expect(skill.notepads_section).toBe(section)
      }
    })

    it('is optional — absent defaults to undefined', () => {
      const skill = SkillFrontmatter.parse(baseSkill)
      expect(skill.notepads_section).toBeUndefined()
    })

    it('rejects unknown section values', () => {
      expect(() =>
        SkillFrontmatter.parse({ ...baseSkill, notepads_section: 'thoughts' }),
      ).toThrow()
    })
  })

  describe('AgentFrontmatter', () => {
    it('accepts all valid notepads_section values', () => {
      const sections = [
        'learnings',
        'decisions',
        'issues',
        'verification',
        'problems',
      ] as const
      for (const section of sections) {
        const agent = AgentFrontmatter.parse({
          ...baseAgent,
          notepads_section: section,
        })
        expect(agent.notepads_section).toBe(section)
      }
    })

    it('is optional — absent defaults to undefined', () => {
      const agent = AgentFrontmatter.parse(baseAgent)
      expect(agent.notepads_section).toBeUndefined()
    })

    it('rejects unknown section values', () => {
      expect(() =>
        AgentFrontmatter.parse({ ...baseAgent, notepads_section: 'diary' }),
      ).toThrow()
    })
  })
})
