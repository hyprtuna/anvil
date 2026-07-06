import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSkillBody, resetBodyFetchCount } from '../../../src/skills/body.js'
import { SkillBodyMissingError } from '../../../src/skills/errors.js'
import {
  loadSkillsEager,
  loadSkillsLazy,
} from '../../../src/skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, '..', '..', 'fixtures', 'skill-loader')

describe('skills/lazy-loader', () => {
  beforeEach(() => {
    resetBodyFetchCount()
  })

  afterEach(() => {
    resetBodyFetchCount()
  })

  describe('lazy loading — body field is undefined until accessor invoked', () => {
    it('body field is undefined on freshly loaded skills in lazy mode', async () => {
      const registry = await loadSkillsLazy({ skillsRoot: fixtures })
      const skills = registry.getAll()
      expect(skills.length).toBeGreaterThan(0)
      // In lazy mode, no skill should have body populated at load time
      for (const skill of skills) {
        expect(skill.body).toBeUndefined()
      }
    })

    it('bodyLoader is set on lazy-loaded skills', async () => {
      const registry = await loadSkillsLazy({ skillsRoot: fixtures })
      const skills = registry.getAll()
      for (const skill of skills) {
        expect(skill.bodyLoader).toBeDefined()
        expect(typeof skill.bodyLoader).toBe('function')
      }
    })

    it('first getSkillBody() call reads the file and returns the body', async () => {
      const registry = await loadSkillsLazy({ skillsRoot: fixtures })
      // Use 'tagged' — only exists in universal tier, no language override
      const skill = registry.get('tagged')
      expect(skill).toBeDefined()
      expect(skill!.body).toBeUndefined()

      const body = await getSkillBody(skill!)
      expect(typeof body).toBe('string')
      expect(body.length).toBeGreaterThan(0)
    })

    it('second getSkillBody() call uses the memo (no second read)', async () => {
      const registry = await loadSkillsLazy({ skillsRoot: fixtures })
      const skill = registry.get('tagged')
      expect(skill).toBeDefined()

      // First call: should fetch and memoise
      const body1 = await getSkillBody(skill!)
      expect(skill!.body).toBe(body1) // memoised into skill.body

      // Second call: should return memo (body already set)
      const body2 = await getSkillBody(skill!)
      expect(body2).toBe(body1)
      // Counter should only have incremented once
      const { getBodyFetchCount } = await import('../../../src/skills/body.js')
      expect(getBodyFetchCount()).toBe(1)
    })

    it('memoises body onto the skill object after first fetch', async () => {
      const registry = await loadSkillsLazy({ skillsRoot: fixtures })
      const skill = registry.get('tagged')
      expect(skill!.body).toBeUndefined()

      await getSkillBody(skill!)

      // After first fetch, body should be set
      expect(skill!.body).toBeDefined()
      expect(typeof skill!.body).toBe('string')
    })
  })

  describe('eager loading — body is present immediately', () => {
    it('body field is defined on eagerly loaded skills', async () => {
      const registry = await loadSkillsEager({ skillsRoot: fixtures })
      const skills = registry.getAll()
      expect(skills.length).toBeGreaterThan(0)
      for (const skill of skills) {
        expect(skill.body).toBeDefined()
        expect(typeof skill.body).toBe('string')
      }
    })

    it('getSkillBody() returns body directly without incrementing fetch counter', async () => {
      const registry = await loadSkillsEager({ skillsRoot: fixtures })
      const skill = registry.get('tagged')
      expect(skill).toBeDefined()

      const body = await getSkillBody(skill!)
      expect(typeof body).toBe('string')
      expect(body.length).toBeGreaterThan(0)

      // Eager mode: no bodyLoader was used, counter stays at 0
      const { getBodyFetchCount } = await import('../../../src/skills/body.js')
      expect(getBodyFetchCount()).toBe(0)
    })
  })

  describe('SkillBodyMissingError', () => {
    it('throws SkillBodyMissingError when neither body nor bodyLoader is set', async () => {
      // Construct a bare skill with no body and no loader
      const bareSkill = {
        frontmatter: {
          name: 'bare-skill',
          kind: 'atomic' as const,
          group: 'dev',
          description: 'A bare skill with no body',
          trigger: [],
          preferred_model: 'claude-sonnet-4-6',
          preferred_effort: 'medium' as const,
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
          userInvocable: true,
          disableModelInvocation: false,
          breaking_changes_in: [],
        },
        body: undefined,
        bodyLoader: undefined,
        sourcePath: '/nonexistent/bare-skill.md',
        tier: 'universal' as const,
      }

      await expect(getSkillBody(bareSkill)).rejects.toThrow(
        SkillBodyMissingError,
      )
      await expect(getSkillBody(bareSkill)).rejects.toThrow('bare-skill')
    })
  })
})
