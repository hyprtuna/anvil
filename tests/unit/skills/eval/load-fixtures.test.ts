import { describe, expect, it } from 'vitest'
import { loadSkillFixtures } from '../../../../src/skills/eval/load-fixtures.js'

describe('skills/eval/load-fixtures', () => {
  it('loads routing fixtures for debugging', async () => {
    const fixtures = await loadSkillFixtures(
      'debugging',
      'tests/fixtures/skill-eval',
    )
    expect(fixtures.routing.length).toBeGreaterThan(0)
    expect(fixtures.routing[0]).toHaveProperty('prompt')
    expect(fixtures.routing[0]).toHaveProperty('shouldMatch')
  })

  it('loads content fixtures for debugging', async () => {
    const fixtures = await loadSkillFixtures(
      'debugging',
      'tests/fixtures/skill-eval',
    )
    expect(fixtures.content.length).toBeGreaterThan(0)
    expect(fixtures.content[0]).toHaveProperty('contains')
  })

  it('returns empty for non-existent skill', async () => {
    const fixtures = await loadSkillFixtures(
      'nonexistent',
      'tests/fixtures/skill-eval',
    )
    expect(fixtures.routing).toEqual([])
    expect(fixtures.content).toEqual([])
  })
})
