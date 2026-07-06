import { describe, expect, it } from 'vitest'
import {
  BUILTIN_MODEL_ALIASES,
  TIER_ALIASES,
  resolveAlias,
} from '../../../../src/core/models/aliases.js'

describe('core/models/aliases', () => {
  const aliases = {
    fast: 'claude-haiku-4-5',
    balanced: 'claude-sonnet-4-6',
    powerful: 'claude-opus-4-6',
    default: 'claude-sonnet-4-6',
  }

  it('resolves known aliases', () => {
    expect(resolveAlias('fast', aliases)).toBe('claude-haiku-4-5')
    expect(resolveAlias('balanced', aliases)).toBe('claude-sonnet-4-6')
    expect(resolveAlias('powerful', aliases)).toBe('claude-opus-4-6')
  })

  it('returns concrete model IDs unchanged', () => {
    expect(resolveAlias('claude-opus-4-6', aliases)).toBe('claude-opus-4-6')
  })

  it('returns unknown strings unchanged (treats as concrete)', () => {
    expect(resolveAlias('claude-future-99', aliases)).toBe('claude-future-99')
  })

  describe('built-in short-name aliases', () => {
    it('resolves canonical neutral names (cheap/balanced/best) to current concrete IDs', () => {
      expect(resolveAlias('cheap', {})).toBe(BUILTIN_MODEL_ALIASES.cheap)
      expect(resolveAlias('balanced', {})).toBe(BUILTIN_MODEL_ALIASES.balanced)
      expect(resolveAlias('best', {})).toBe(BUILTIN_MODEL_ALIASES.best)
    })

    it('resolves Anthropic-shorthand legacy names (haiku/sonnet/opus)', () => {
      // Kept for backward-compat with shipped agent files that declare model: opus etc.
      expect(resolveAlias('opus', {})).toBe(BUILTIN_MODEL_ALIASES.opus)
      expect(resolveAlias('sonnet', {})).toBe(BUILTIN_MODEL_ALIASES.sonnet)
      expect(resolveAlias('haiku', {})).toBe(BUILTIN_MODEL_ALIASES.haiku)
    })

    it('canonical and legacy names map to the same concrete IDs', () => {
      expect(BUILTIN_MODEL_ALIASES.cheap).toBe(BUILTIN_MODEL_ALIASES.haiku)
      expect(BUILTIN_MODEL_ALIASES.balanced).toBe(BUILTIN_MODEL_ALIASES.sonnet)
      expect(BUILTIN_MODEL_ALIASES.best).toBe(BUILTIN_MODEL_ALIASES.opus)
    })

    it('built-in aliases match the contract (single point of update)', () => {
      expect(BUILTIN_MODEL_ALIASES.cheap).toBe('claude-haiku-4-5')
      expect(BUILTIN_MODEL_ALIASES.balanced).toBe('claude-sonnet-4-6')
      expect(BUILTIN_MODEL_ALIASES.best).toBe('claude-opus-4-7')
    })
  })

  describe('tier alias chain', () => {
    it('quick → cheap → claude-haiku-4-5 (recursive resolution)', () => {
      expect(resolveAlias('quick', {})).toBe('claude-haiku-4-5')
    })

    it('coding → balanced → claude-sonnet-4-6 (recursive resolution)', () => {
      expect(resolveAlias('coding', {})).toBe('claude-sonnet-4-6')
    })

    it('review → balanced → claude-sonnet-4-6 (recursive resolution)', () => {
      expect(resolveAlias('review', {})).toBe('claude-sonnet-4-6')
    })

    it('planning → best → claude-opus-4-7 (recursive resolution)', () => {
      expect(resolveAlias('planning', {})).toBe('claude-opus-4-7')
    })

    it('ultra → best → claude-opus-4-7 (recursive resolution)', () => {
      expect(resolveAlias('ultra', {})).toBe('claude-opus-4-7')
    })

    it('super → best → claude-opus-4-7 (recursive resolution)', () => {
      expect(resolveAlias('super', {})).toBe('claude-opus-4-7')
    })

    it('legacy "standard" no longer in TIER_ALIASES — returns unchanged string', () => {
      // standard was removed in Plan 38 Phase B; it resolves to itself (unknown alias)
      expect(resolveAlias('standard', {})).toBe('standard')
    })

    it('legacy "deep" no longer in TIER_ALIASES — returns unchanged string', () => {
      // deep was removed in Plan 38 Phase B; it resolves to itself (unknown alias)
      expect(resolveAlias('deep', {})).toBe('deep')
    })

    it('TIER_ALIASES values reference provider-neutral short names (not concrete IDs)', () => {
      expect(TIER_ALIASES.quick).toBe('cheap')
      expect(TIER_ALIASES.coding).toBe('balanced')
      expect(TIER_ALIASES.review).toBe('balanced')
      expect(TIER_ALIASES.planning).toBe('best')
      expect(TIER_ALIASES.ultra).toBe('best')
      expect(TIER_ALIASES.super).toBe('best')
    })

    it('legacy tiers are not present in TIER_ALIASES', () => {
      expect(TIER_ALIASES.standard).toBeUndefined()
      expect(TIER_ALIASES.deep).toBeUndefined()
    })
  })

  describe('user-alias precedence', () => {
    it('user model_aliases override the canonical neutral names (non-Anthropic providers)', () => {
      // OpenCode user on Kimi/GLM/GPT overrides only the 3 canonical names;
      // tier chain flows through them automatically.
      const userAliases = {
        cheap: 'gemini-flash-2.0',
        balanced: 'kimi-k2.5',
        best: 'gpt-5.4',
      }
      expect(resolveAlias('cheap', userAliases)).toBe('gemini-flash-2.0')
      expect(resolveAlias('balanced', userAliases)).toBe('kimi-k2.5')
      expect(resolveAlias('best', userAliases)).toBe('gpt-5.4')
      // Tier chain auto-routes through the override
      expect(resolveAlias('quick', userAliases)).toBe('gemini-flash-2.0')
      expect(resolveAlias('coding', userAliases)).toBe('kimi-k2.5')
      expect(resolveAlias('planning', userAliases)).toBe('gpt-5.4')
    })

    it('user override on best flows through tier chain (ultra → best override → gpt-5.4)', () => {
      const userAliases = { best: 'gpt-5.4' }
      expect(resolveAlias('ultra', userAliases)).toBe('gpt-5.4')
    })

    it('user override on tier name short-circuits the chain', () => {
      const userAliases = { coding: 'kimi-k2.5' }
      expect(resolveAlias('coding', userAliases)).toBe('kimi-k2.5')
    })

    it('overriding only the legacy Anthropic shorthand does not affect the canonical tier chain', () => {
      // Tier chain resolves through the canonical name (best), not the legacy
      // (opus). Users targeting only the legacy shorthand get expected behavior
      // for agents that opted into it; tier-based agents continue to resolve
      // canonically.
      const userAliases = { opus: 'gpt-5.4' }
      expect(resolveAlias('opus', userAliases)).toBe('gpt-5.4')
      expect(resolveAlias('planning', userAliases)).toBe('claude-opus-4-7')
    })
  })

  describe('cycle protection', () => {
    it('returns safely when user introduces a 2-cycle (a → b → a)', () => {
      const userAliases = { a: 'b', b: 'a' }
      const result = resolveAlias('a', userAliases)
      // Returns one of the cycle nodes; downstream will fail on unknown model ID.
      expect(['a', 'b']).toContain(result)
    })

    it('returns safely when user introduces a self-cycle (a → a)', () => {
      const userAliases = { a: 'a' }
      expect(resolveAlias('a', userAliases)).toBe('a')
    })
  })
})
