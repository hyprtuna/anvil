import { describe, expect, it } from 'vitest'
import type { Skill } from '../../../src/core/types.js'
import {
  countSkillsWithActivation,
  evaluateActivation,
  filterSkillsByActivation,
  globMatch,
} from '../../../src/skills/activation.js'

function makeSkill(
  name: string,
  activation?: Skill['frontmatter']['activation'],
): Skill {
  return {
    frontmatter: {
      name,
      kind: 'atomic',
      group: 'development',
      description: `skill ${name}`,
      preferred_model: 'claude-sonnet-4-6',
      preferred_effort: 'medium',
      trigger: [],
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language: 'universal',
      tags: [],
      aliases: [],
      isHidden: false,
      'user-invocable': true,
      'disable-model-invocation': false,
      breaking_changes_in: [],
      userInvocable: true,
      disableModelInvocation: false,
      argumentHint: undefined,
      allowedTools: undefined,
      sourceProvenance: 'unknown',
      provenanceConfidence: undefined,
      createdAt: undefined,
      ...(activation ? { activation } : {}),
    } as Skill['frontmatter'],
    body: '',
    sourcePath: `/test/${name}.md`,
    tier: 'universal',
    scope: 'bundled',
    defects: [],
  }
}

describe('skills/activation —', () => {
  describe('filterSkillsByActivation()', () => {
    it('retains a skill without an activation block (backward-compat)', () => {
      const skills = [makeSkill('s1')]
      const { kept, excluded } = filterSkillsByActivation(skills, {
        languages: ['typescript'],
      })
      expect(kept).toHaveLength(1)
      expect(excluded).toHaveLength(0)
    })

    it('excludes a Python-only skill in a TS-only project', () => {
      const skills = [
        makeSkill('python-only', { languages: ['python'] }),
        makeSkill('ts-only', { languages: ['typescript'] }),
      ]
      const { kept, excluded } = filterSkillsByActivation(skills, {
        languages: ['typescript'],
      })
      expect(kept.map((s) => s.frontmatter.name)).toEqual(['ts-only'])
      expect(excluded).toHaveLength(1)
      expect(excluded[0].skill.frontmatter.name).toBe('python-only')
      expect(excluded[0].reason).toMatch(/languages/)
    })

    it('retains all skills when ctx.languages is empty (permissive)', () => {
      const skills = [makeSkill('python-only', { languages: ['python'] })]
      const { kept } = filterSkillsByActivation(skills, {})
      expect(kept).toHaveLength(1)
    })

    it('matches case-insensitively on language names', () => {
      const skills = [makeSkill('ts', { languages: ['TypeScript'] })]
      const { kept } = filterSkillsByActivation(skills, {
        languages: ['typescript'],
      })
      expect(kept).toHaveLength(1)
    })

    it('excludes when globs declared and no project file matches', () => {
      const skills = [makeSkill('react', { globs: ['**/*.tsx'] })]
      const { kept, excluded } = filterSkillsByActivation(skills, {
        projectFiles: ['src/main.ts'],
      })
      expect(kept).toHaveLength(0)
      expect(excluded[0].reason).toMatch(/globs/)
    })

    it('retains when at least one glob matches', () => {
      const skills = [makeSkill('react', { globs: ['**/*.tsx'] })]
      const { kept } = filterSkillsByActivation(skills, {
        projectFiles: ['src/Button.tsx', 'src/main.ts'],
      })
      expect(kept).toHaveLength(1)
    })

    it('excludes on event mismatch when availableEvents supplied', () => {
      const skills = [makeSkill('pre-edit', { events: ['pre-edit'] })]
      const { kept } = filterSkillsByActivation(skills, {
        availableEvents: ['session-start'],
      })
      expect(kept).toHaveLength(0)
    })
  })

  describe('evaluateActivation()', () => {
    it('returns activates:true for an empty block', () => {
      expect(evaluateActivation({}, {})).toEqual({ activates: true })
    })
  })

  describe('globMatch()', () => {
    it('matches **/*.tsx against nested .tsx', () => {
      expect(globMatch('**/*.tsx', 'src/components/Button.tsx')).toBe(true)
    })
    it('does not match **/*.tsx against .ts', () => {
      expect(globMatch('**/*.tsx', 'src/main.ts')).toBe(false)
    })
    it('matches src/components/** against deeper path', () => {
      expect(globMatch('src/components/**', 'src/components/Button.tsx')).toBe(
        true,
      )
    })
    it('matches single * within a segment', () => {
      expect(globMatch('*.md', 'README.md')).toBe(true)
      expect(globMatch('*.md', 'docs/README.md')).toBe(false)
    })
  })

  describe('countSkillsWithActivation()', () => {
    it('counts only skills with a declared activation block', () => {
      const skills = [
        makeSkill('a'),
        makeSkill('b', { languages: ['python'] }),
        makeSkill('c', { globs: ['*.md'] }),
      ]
      expect(countSkillsWithActivation(skills)).toBe(2)
    })
  })
})
