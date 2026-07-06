import { describe, expect, it } from 'vitest'
import type { Skill } from '../../../src/core/types.js'
import {
  SEMANTIC_FALLBACK_CONFIDENCE_CAP,
  jaccard,
  semanticFallback,
  tokenize,
} from '../../../src/intent/semantic-fallback.js'

function makeSkill(name: string, description: string): Skill {
  return {
    frontmatter: {
      name,
      kind: 'atomic',
      group: 'test',
      description,
      trigger: [],
      preferred_model: 'claude-sonnet-4-5',
      preferred_effort: 'medium',
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
      argumentHint: undefined,
      allowedTools: undefined,
      breaking_changes_in: [],
    },
    body: '',
    sourcePath: `/skills/${name}.md`,
    tier: 'universal',
  }
}

describe('semantic-fallback — tokenize', () => {
  it('lowercases and splits on word boundaries', () => {
    const tokens = tokenize('Debug this Bug')
    expect(tokens.has('debug')).toBe(true)
    expect(tokens.has('bug')).toBe(true)
  })

  it('removes stopwords', () => {
    const tokens = tokenize('find the issue in this code')
    expect(tokens.has('the')).toBe(false)
    expect(tokens.has('in')).toBe(false)
    expect(tokens.has('this')).toBe(false)
  })

  it('drops single-character tokens', () => {
    const tokens = tokenize('a b c debug')
    expect(tokens.has('a')).toBe(false)
    expect(tokens.has('b')).toBe(false)
    expect(tokens.has('debug')).toBe(true)
  })
})

describe('semantic-fallback — jaccard', () => {
  it('returns 1.0 for identical sets', () => {
    const a = new Set(['debug', 'fix', 'error'])
    expect(jaccard(a, a)).toBe(1)
  })

  it('returns 0 for disjoint sets', () => {
    const a = new Set(['apple'])
    const b = new Set(['banana'])
    expect(jaccard(a, b)).toBe(0)
  })

  it('returns 0 when both sets are empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(0)
  })

  it('partial overlap produces value between 0 and 1', () => {
    const a = new Set(['debug', 'fix'])
    const b = new Set(['debug', 'review'])
    // intersection={debug}, union={debug,fix,review} → 1/3
    expect(jaccard(a, b)).toBeCloseTo(1 / 3)
  })
})

describe('semantic-fallback — semanticFallback', () => {
  const debugSkill = makeSkill(
    'debugging',
    'Identifies and fixes bugs, errors, and failures in code',
  )
  const testSkill = makeSkill(
    'test-driven-development',
    'Writes and improves test coverage for better quality assurance',
  )
  const reviewSkill = makeSkill(
    'code-reviewer',
    'Reviews code for quality, correctness, and style issues',
  )

  const skills = [debugSkill, testSkill, reviewSkill]

  it('returns the best-matching skill when prompt overlaps strongly with description', () => {
    // Use threshold=0.15 to account for the basic tokenizer (no stemming).
    // Prompt tokens {bugs, errors, failures, code} overlap with debugging description
    // which includes "bugs, errors, and failures in code".
    const result = semanticFallback('bugs errors failures code', skills, 0.15)
    expect(result).not.toBeNull()
    expect(result!.skill).toBe('debugging')
    expect(result!.confidence).toBeGreaterThan(0)
    expect(result!.confidence).toBeLessThanOrEqual(
      SEMANTIC_FALLBACK_CONFIDENCE_CAP,
    )
  })

  it('returns null when no skill meets the threshold', () => {
    const result = semanticFallback('zzz xyzzy quux frobnicate', skills, 0.3)
    expect(result).toBeNull()
  })

  it('confidence is capped at SEMANTIC_FALLBACK_CONFIDENCE_CAP even with perfect overlap', () => {
    // Build a skill whose description exactly matches the prompt tokens
    const perfectSkill = makeSkill(
      'perfect-skill',
      'debug bugs errors failures code',
    )
    const result = semanticFallback(
      'debug bugs errors failures code',
      [perfectSkill],
      0.0, // threshold of 0 so anything matches
    )
    expect(result).not.toBeNull()
    expect(result!.confidence).toBeLessThanOrEqual(
      SEMANTIC_FALLBACK_CONFIDENCE_CAP,
    )
  })

  it('returns null when overlap is below the threshold', () => {
    const result = semanticFallback('improve tests quality', skills, 0.99)
    expect(result).toBeNull()
  })

  it('returns null for empty prompt', () => {
    expect(semanticFallback('', skills)).toBeNull()
  })

  it('returns null when allSkills is empty', () => {
    expect(semanticFallback('debug the bug', [])).toBeNull()
  })
})
