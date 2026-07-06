import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { frontmatterFixturesToSkillFixtures } from '../../../src/skills/eval/frontmatter-fixtures.js'
import type { FrontmatterFixture } from '../../../src/skills/eval/runner.js'

// ---------------------------------------------------------------------------
// frontmatterFixturesToSkillFixtures unit tests (Plan 30 G2)
// ---------------------------------------------------------------------------

describe('frontmatterFixturesToSkillFixtures', () => {
  it('converts a fixture with expected_skills to a routing fixture', () => {
    const fixtures: FrontmatterFixture[] = [
      {
        name: 'basic-routing',
        prompt: 'debug this error',
        expected_skills: ['debugging'],
        expected_agent: undefined,
      },
    ]
    const result = frontmatterFixturesToSkillFixtures('debugging', fixtures)
    expect(result.routing).toHaveLength(1)
    expect(result.content).toHaveLength(0)
    expect(result.routing[0]!.prompt).toBe('debug this error')
    expect(result.routing[0]!.shouldMatch).toBe(true)
    expect(result.routing[0]!.description).toContain('basic-routing')
    expect(result.routing[0]!.description).toContain('debugging')
  })

  it('includes expected_agent in description when set', () => {
    const fixtures: FrontmatterFixture[] = [
      {
        name: 'agent-routing',
        prompt: 'plan the feature',
        expected_skills: [],
        expected_agent: 'orchestrator',
      },
    ]
    const result = frontmatterFixturesToSkillFixtures('planning', fixtures)
    expect(result.routing[0]!.description).toContain('agent: orchestrator')
  })

  it('uses fixture name alone when no extra metadata', () => {
    const fixtures: FrontmatterFixture[] = [
      {
        name: 'plain',
        prompt: 'write tests',
        expected_skills: [],
      },
    ]
    const result = frontmatterFixturesToSkillFixtures(
      'test-driven-development',
      fixtures,
    )
    expect(result.routing[0]!.description).toBe('plain')
  })

  it('converts multiple fixtures', () => {
    const fixtures: FrontmatterFixture[] = [
      { name: 'f1', prompt: 'fix bug', expected_skills: ['debugging'] },
      {
        name: 'f2',
        prompt: 'add tests',
        expected_skills: ['test-driven-development'],
      },
    ]
    const result = frontmatterFixturesToSkillFixtures('debugging', fixtures)
    expect(result.routing).toHaveLength(2)
    expect(result.routing[0]!.prompt).toBe('fix bug')
    expect(result.routing[1]!.prompt).toBe('add tests')
  })

  it('returns empty fixtures for empty array', () => {
    const result = frontmatterFixturesToSkillFixtures('any-skill', [])
    expect(result.routing).toHaveLength(0)
    expect(result.content).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// evaluateSkill integration with frontmatter fixtures (Plan 30 G2)
// ---------------------------------------------------------------------------

describe('evaluateSkill — frontmatter fixture path', () => {
  it('uses frontmatter fixtures when provided and non-empty', async () => {
    // Use a fake SKILLS_ROOT; the test only needs evaluateSkill to exercise
    // the frontmatter path (no file I/O for fixtures).
    const tmpSkillsRoot = `/tmp/anvil-eval-fm-test-${process.pid}`
    mkdirSync(join(tmpSkillsRoot, 'universal'), { recursive: true })
    // Create a minimal skill file so the registry loads something.
    const skillMd = `---
name: test-skill-fm
kind: atomic
group: development
description: A test skill for eval fixtures
trigger: [test, fixture]
preferred_model: claude-haiku-4-5
preferred_effort: low
---
# Test Skill FM

This is a test skill body containing the phrase: fixture-keyword.
`
    writeFileSync(
      join(tmpSkillsRoot, 'universal', 'test-skill-fm.md'),
      skillMd,
      'utf-8',
    )

    try {
      const { evaluateSkill } = await import(
        '../../../src/skills/eval/runner.js'
      )
      const frontmatterFixtures: FrontmatterFixture[] = [
        {
          name: 'smoke-test',
          prompt: 'test fixture',
          expected_skills: ['test-skill-fm'],
        },
      ]
      const result = await evaluateSkill('test-skill-fm', {
        fixturesRoot: '/tmp/does-not-exist',
        skillsRoot: tmpSkillsRoot,
        frontmatterFixtures,
      })
      // There is 1 routing fixture from frontmatter.
      expect(result.total).toBe(1)
      // The skill should match the prompt "test fixture" based on triggers.
      // We only care that the frontmatter path was used (total > 0).
    } finally {
      rmSync(tmpSkillsRoot, { recursive: true, force: true })
    }
  })

  it('falls back to file-based fixtures when frontmatterFixtures is null', async () => {
    const tmpSkillsRoot = `/tmp/anvil-eval-fm-fallback-${process.pid}`
    mkdirSync(join(tmpSkillsRoot, 'universal'), { recursive: true })
    const skillMd = `---
name: fallback-skill
kind: atomic
group: development
description: A fallback skill
trigger: [fallback]
preferred_model: claude-haiku-4-5
preferred_effort: low
---
body
`
    writeFileSync(
      join(tmpSkillsRoot, 'universal', 'fallback-skill.md'),
      skillMd,
      'utf-8',
    )

    try {
      const { evaluateSkill } = await import(
        '../../../src/skills/eval/runner.js'
      )
      // No frontmatter fixtures and no file fixtures → total=0
      const result = await evaluateSkill('fallback-skill', {
        fixturesRoot: '/tmp/definitely-no-fixtures-here',
        skillsRoot: tmpSkillsRoot,
        frontmatterFixtures: null,
      })
      expect(result.total).toBe(0)
    } finally {
      rmSync(tmpSkillsRoot, { recursive: true, force: true })
    }
  })
})
