import { describe, expect, it } from 'vitest'
import type { Skill } from '../../src/core/types.js'
import { AXIS_NAMES, evaluateRubric } from '../../src/skills/eval/rubric.js'

function skill(
  body: string,
  overrides: Partial<Skill['frontmatter']> = {},
): Skill {
  return {
    frontmatter: {
      name: 'test-skill',
      kind: 'meta',
      group: 'rules',
      description: 'Use when writing anything',
      trigger: ['trigger-a', 'trigger-b', 'trigger-c'],
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
      ...overrides,
    },
    body,
    sourcePath: '/fake/test-skill.md',
    tier: 'universal',
  }
}

describe('skills/eval/rubric — 5-axis scoring', () => {
  it('AXIS_NAMES lists exactly the five canonical axes', () => {
    expect(AXIS_NAMES).toEqual([
      'trigger-clarity',
      'checklist-presence',
      'red-flag-table',
      'exit-condition',
      'evidence-policy',
    ])
  })

  it('full-credit skill scores 10/10', async () => {
    const body = `
## The rule

Follow these steps:

1. Stop.
2. Verify.
3. Continue.

## Red flags

| Thought | Reality |
|---|---|
| "should work" | verify it |

## Exit condition

When \`bun test --run foo\` passes and the commit hash is logged.

## Evidence

Cite evidence: file path like src/foo.ts:42, or command output.
`
    const result = await evaluateRubric(skill(body))
    expect(result.total).toBe(10)
    expect(result.axisScores.every((a) => a.score === 2)).toBe(true)
  })

  it('zero-credit empty skill scores 0/10', async () => {
    const result = await evaluateRubric(
      skill('', {
        description: 'nothing useful',
        trigger: [],
      }),
    )
    expect(result.total).toBe(0)
    expect(result.axisScores.every((a) => a.score === 0)).toBe(true)
  })

  it('partial credit: checklist + exit condition, no red flags, no evidence', async () => {
    const body = `
1. step one
2. step two

## Exit condition

When done.
`
    const result = await evaluateRubric(skill(body))
    const map = Object.fromEntries(
      result.axisScores.map((a) => [a.axis, a.score]),
    )
    expect(map['checklist-presence']).toBe(2)
    expect(map['exit-condition']).toBe(2)
    expect(map['red-flag-table']).toBe(0)
    expect(map['evidence-policy']).toBe(0)
  })

  it('trigger-clarity hits 2 with "Use when…" + ≥3 triggers', async () => {
    const result = await evaluateRubric(
      skill('- something', {
        description: 'Use when starting a task',
        trigger: ['a', 'b', 'c'],
      }),
    )
    const triggerAxis = result.axisScores.find(
      (a) => a.axis === 'trigger-clarity',
    )
    expect(triggerAxis?.score).toBe(2)
  })

  it('findings list every axis scoring below 2', async () => {
    const body = '# not much here'
    const result = await evaluateRubric(
      skill(body, {
        description: 'ad-hoc',
        trigger: [],
      }),
    )
    expect(result.findings.length).toBe(5)
  })
})
