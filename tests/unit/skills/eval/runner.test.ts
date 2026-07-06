import { describe, expect, it } from 'vitest'
import { evaluateSkill } from '../../../../src/skills/eval/runner.js'

describe('skills/eval/runner', () => {
  it('evaluates debugging skill with passing score', async () => {
    const result = await evaluateSkill('debugging', {
      fixturesRoot: 'tests/fixtures/skill-eval',
      skillsRoot: 'skills',
    })
    expect(result.skill).toBe('debugging')
    expect(result.total).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThanOrEqual(0.8)
    expect(result.passed).toBeGreaterThan(0)
  })

  it('returns score 1 for skill with no fixtures', async () => {
    const result = await evaluateSkill('nonexistent', {
      fixturesRoot: 'tests/fixtures/skill-eval',
      skillsRoot: 'skills',
    })
    expect(result.total).toBe(0)
    expect(result.score).toBe(1)
  })

  it('includes detailed per-test results', async () => {
    const result = await evaluateSkill('debugging', {
      fixturesRoot: 'tests/fixtures/skill-eval',
      skillsRoot: 'skills',
    })
    expect(result.details.length).toBe(result.total)
    for (const d of result.details) {
      expect(d).toHaveProperty('type')
      expect(d).toHaveProperty('passed')
      expect(d).toHaveProperty('message')
      expect(['routing', 'content']).toContain(d.type)
    }
  })
})
