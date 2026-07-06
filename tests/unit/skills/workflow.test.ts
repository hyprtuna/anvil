import { describe, expect, it } from 'vitest'
import type { Skill } from '../../../src/core/types.js'
import { composeChain } from '../../../src/skills/chain.js'

function skill(name: string, extra: Partial<Skill['frontmatter']> = {}): Skill {
  return {
    frontmatter: {
      name,
      kind: 'atomic',
      group: 'dev',
      description: name,
      trigger: [],
      preferred_model: 'claude-sonnet-4-6',
      preferred_effort: 'medium',
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language: 'universal',
      tags: [],
      aliases: [],
      isHidden: false,
      ...extra,
    },
    body: name,
    sourcePath: `/fake/${name}.md`,
    tier: 'universal',
  }
}

describe('skills/chain — workflow frontmatter', () => {
  it('composeChain uses workflow.phases as the outer ordering', () => {
    const skills = [
      skill('default-feature', {
        kind: 'composite',
        workflow: {
          phases: ['a', 'b', 'c'],
          terminal: 'c',
        },
      }),
      skill('a'),
      skill('b'),
      skill('c'),
    ]
    expect(composeChain('default-feature', skills)).toEqual(['a', 'b', 'c'])
  })

  it('workflow wins over chains[] when both are set on the entry skill', () => {
    const skills = [
      skill('wf', {
        kind: 'composite',
        chains: [{ before: 'tail' }],
        workflow: {
          phases: ['x', 'y', 'z'],
          terminal: 'z',
        },
      }),
      skill('tail'),
      skill('x'),
      skill('y'),
      skill('z'),
    ]
    const chain = composeChain('wf', skills)
    expect(chain).toEqual(['x', 'y', 'z'])
  })
})
