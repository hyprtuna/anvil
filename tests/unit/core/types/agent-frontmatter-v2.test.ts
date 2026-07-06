import { describe, expect, it } from 'vitest'
import {
  AgentFrontmatter,
  AgentMode,
  AgentTier,
} from '../../../../src/core/types.js'

const BASE = {
  name: 'researcher',
  description: 'Deep research agent',
}

describe('AgentFrontmatter — v2 extensions (Phase A)', () => {
  describe('agent_mode', () => {
    it('defaults agent_mode to "subagent" when not provided', () => {
      const parsed = AgentFrontmatter.parse(BASE)
      expect(parsed.agent_mode).toBe('subagent')
    })

    it('accepts agent_mode: "primary"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, agent_mode: 'primary' })
      expect(parsed.agent_mode).toBe('primary')
    })

    it('accepts agent_mode: "subagent" explicitly', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, agent_mode: 'subagent' })
      expect(parsed.agent_mode).toBe('subagent')
    })

    it('rejects an invalid agent_mode value', () => {
      expect(() =>
        AgentFrontmatter.parse({ ...BASE, agent_mode: 'background' }),
      ).toThrow()
    })
  })

  describe('tier', () => {
    it('tier is optional — absent leaves it undefined', () => {
      const parsed = AgentFrontmatter.parse(BASE)
      expect(parsed.tier).toBeUndefined()
    })

    it('accepts tier: "quick"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, tier: 'quick' })
      expect(parsed.tier).toBe('quick')
    })

    it('accepts tier: "coding"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, tier: 'coding' })
      expect(parsed.tier).toBe('coding')
    })

    it('accepts tier: "review"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, tier: 'review' })
      expect(parsed.tier).toBe('review')
    })

    it('accepts tier: "planning"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, tier: 'planning' })
      expect(parsed.tier).toBe('planning')
    })

    it('accepts tier: "ultra"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, tier: 'ultra' })
      expect(parsed.tier).toBe('ultra')
    })

    it('accepts tier: "super"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, tier: 'super' })
      expect(parsed.tier).toBe('super')
    })

    it('rejects legacy tier: "standard"', () => {
      expect(() =>
        AgentFrontmatter.parse({ ...BASE, tier: 'standard' }),
      ).toThrow()
    })

    it('rejects legacy tier: "deep"', () => {
      expect(() => AgentFrontmatter.parse({ ...BASE, tier: 'deep' })).toThrow()
    })

    it('rejects an invalid tier value', () => {
      expect(() => AgentFrontmatter.parse({ ...BASE, tier: 'turbo' })).toThrow()
    })
  })

  describe('fallback_chain', () => {
    it('defaults fallback_chain to empty array when not provided', () => {
      const parsed = AgentFrontmatter.parse(BASE)
      expect(parsed.fallback_chain).toEqual([])
    })

    it('accepts a fallback_chain list', () => {
      const parsed = AgentFrontmatter.parse({
        ...BASE,
        fallback_chain: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
      })
      expect(parsed.fallback_chain).toEqual([
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ])
    })
  })

  describe('category', () => {
    it('category is optional — absent leaves it undefined', () => {
      const parsed = AgentFrontmatter.parse(BASE)
      expect(parsed.category).toBeUndefined()
    })

    it('accepts a category string', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, category: 'research' })
      expect(parsed.category).toBe('research')
    })
  })

  describe('requires_any_model', () => {
    it('requires_any_model is optional — absent leaves it undefined', () => {
      const parsed = AgentFrontmatter.parse(BASE)
      expect(parsed.requires_any_model).toBeUndefined()
    })

    it('accepts a list of model id strings', () => {
      const parsed = AgentFrontmatter.parse({
        ...BASE,
        requires_any_model: ['claude-opus-4-7', 'claude-opus-4-6'],
      })
      expect(parsed.requires_any_model).toEqual([
        'claude-opus-4-7',
        'claude-opus-4-6',
      ])
    })
  })

  describe('requires_provider', () => {
    it('requires_provider is optional — absent leaves it undefined', () => {
      const parsed = AgentFrontmatter.parse(BASE)
      expect(parsed.requires_provider).toBeUndefined()
    })

    it('accepts a provider string', () => {
      const parsed = AgentFrontmatter.parse({
        ...BASE,
        requires_provider: 'anthropic',
      })
      expect(parsed.requires_provider).toBe('anthropic')
    })
  })

  describe('backward compatibility — existing fields still parse', () => {
    it('a researcher-shaped fixture still parses correctly', () => {
      const fixture = {
        name: 'researcher',
        description: 'Deep research agent for exhaustive investigation',
        model: 'inherit',
        tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
        role: 'researcher',
        group: 'research',
        trigger: ['research', 'investigate', 'find out'],
        max_turns: 30,
      }
      const parsed = AgentFrontmatter.parse(fixture)
      expect(parsed.name).toBe('researcher')
      expect(parsed.role).toBe('researcher')
      // new v2 defaults
      expect(parsed.agent_mode).toBe('subagent')
      expect(parsed.fallback_chain).toEqual([])
      expect(parsed.tier).toBeUndefined()
    })

    it('existing model field still accepts "inherit"', () => {
      const parsed = AgentFrontmatter.parse({ ...BASE, model: 'inherit' })
      expect(parsed.model).toBe('inherit')
    })
  })

  describe('AgentTier enum', () => {
    it('exports all 6 tier values (Plan 38 Phase B)', () => {
      expect(AgentTier.options).toEqual([
        'quick',
        'coding',
        'review',
        'planning',
        'ultra',
        'super',
      ])
    })
  })

  describe('AgentMode enum', () => {
    it('exports both mode values', () => {
      expect(AgentMode.options).toEqual(['primary', 'subagent'])
    })
  })
})
