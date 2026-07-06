import { describe, expect, it } from 'vitest'
import type { Skill } from '../../../src/core/types.js'
import {
  ChainCycleDetected,
  ChainDepthExceeded,
  DEFAULT_MAX_CHAIN_DEPTH,
  composeChain,
} from '../../../src/skills/chain.js'

function makeSkill(
  name: string,
  chains: Array<{ after?: string; before?: string }> = [],
): Skill {
  return {
    frontmatter: {
      name,
      kind: 'atomic',
      group: 'development',
      description: name,
      trigger: [],
      preferred_model: 'claude-sonnet-4-6',
      preferred_effort: 'medium',
      inputs: [],
      outputs: [],
      tools: [],
      chains,
      language: 'universal',
      tags: [],
      aliases: [],
      isHidden: false,
    },
    body: name,
    sourcePath: `/fake/${name}.md`,
    tier: 'universal',
  }
}

describe('skills/chain', () => {
  it('returns a single skill with no chains', () => {
    const skills = [makeSkill('development')]
    const chain = composeChain('development', skills)
    expect(chain).toEqual(['development'])
  })

  it('chains skills in declared order', () => {
    const skills = [
      makeSkill('test-driven-development', [{ before: 'code-reviewer' }]),
      makeSkill('code-reviewer'),
    ]
    const chain = composeChain('test-driven-development', skills)
    expect(chain).toEqual(['test-driven-development', 'code-reviewer'])
  })

  it('resolves after relationships', () => {
    const skills = [
      makeSkill('code-reviewer', [{ after: 'development' }]),
      makeSkill('development'),
    ]
    const chain = composeChain('code-reviewer', skills)
    expect(chain).toEqual(['development', 'code-reviewer'])
  })

  it('returns just the entry skill when chain members are missing from registry', () => {
    const skills = [makeSkill('solo', [{ before: 'missing-skill' }])]
    const chain = composeChain('solo', skills)
    expect(chain).toContain('solo')
  })

  it('detects simple cycles and throws ChainCycleDetected', () => {
    const skills = [
      makeSkill('a', [{ before: 'b' }]),
      makeSkill('b', [{ before: 'a' }]),
    ]
    expect(() => composeChain('a', skills)).toThrow(ChainCycleDetected)
  })

  it('detects longer cycles via after-edges', () => {
    const skills = [
      makeSkill('a', [{ after: 'b' }]),
      makeSkill('b', [{ after: 'c' }]),
      makeSkill('c', [{ after: 'a' }]),
    ]
    try {
      composeChain('a', skills)
      expect.fail('expected ChainCycleDetected')
    } catch (err) {
      expect(err).toBeInstanceOf(ChainCycleDetected)
      const cycle = (err as ChainCycleDetected).cycle
      expect(cycle.length).toBeGreaterThanOrEqual(2)
      expect(cycle[0]).toBe(cycle[cycle.length - 1])
    }
  })

  it('throws ChainDepthExceeded beyond the default max depth', () => {
    // Create a long linear after-chain exceeding DEFAULT_MAX_CHAIN_DEPTH.
    const names = Array.from(
      { length: DEFAULT_MAX_CHAIN_DEPTH + 3 },
      (_v, i) => `n${i}`,
    )
    const skills = names.map((name, idx) =>
      makeSkill(
        name,
        idx + 1 < names.length ? [{ after: names[idx + 1] }] : [],
      ),
    )
    expect(() => composeChain(names[0], skills)).toThrow(ChainDepthExceeded)
  })

  it('traverses sibling after-edges in alphabetical order', () => {
    const skills = [
      makeSkill('root', [{ after: 'zeta' }, { after: 'alpha' }]),
      makeSkill('alpha'),
      makeSkill('zeta'),
    ]
    const chain = composeChain('root', skills)
    // alpha should come before zeta in the composed order.
    expect(chain.indexOf('alpha')).toBeLessThan(chain.indexOf('zeta'))
    expect(chain).toEqual(['alpha', 'zeta', 'root'])
  })

  it('respects a higher custom maxDepth', () => {
    const names = Array.from({ length: 9 }, (_v, i) => `n${i}`)
    const skills = names.map((name, idx) =>
      makeSkill(
        name,
        idx + 1 < names.length ? [{ after: names[idx + 1] }] : [],
      ),
    )
    expect(() => composeChain(names[0], skills, 20)).not.toThrow()
  })

  it('feature-development chain includes verification in the before slot (Plan 31 E1)', () => {
    // Mirrors the actual feature-development frontmatter chains declaration.
    // The composeChain implementation sorts before-edges alphabetically, so the
    // composed order is: planning → feature-development → code-reviewer → github-workflow → verification
    const featureDeveloper = makeSkill('feature-development', [
      { after: 'planning' },
      { before: 'code-reviewer' },
      { before: 'verification' },
      { before: 'github-workflow' },
    ])
    const planning = makeSkill('planning')
    const codeReviewer = makeSkill('code-reviewer')
    const verification = makeSkill('verification')
    const githubWorker = makeSkill('github-workflow')

    const chain = composeChain('feature-development', [
      featureDeveloper,
      planning,
      codeReviewer,
      verification,
      githubWorker,
    ])

    expect(chain).toContain('verification')
    // verification must appear after feature-development in the chain
    const featureDevIdx = chain.indexOf('feature-development')
    const verificationIdx = chain.indexOf('verification')
    expect(verificationIdx).toBeGreaterThan(featureDevIdx)
  })
})
