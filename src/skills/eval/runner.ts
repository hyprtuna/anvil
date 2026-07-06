import { detectProject } from '../../core/project/detect.js'
import { getSkillBody } from '../body.js'
import { loadAllSkills } from '../load-all.js'
import { selectSkills } from '../selector.js'
import { frontmatterFixturesToSkillFixtures } from './frontmatter-fixtures.js'
import { loadSkillFixtures } from './load-fixtures.js'
import type { EvalResult } from './types.js'

export interface FrontmatterFixture {
  name: string
  prompt: string
  expected_skills: string[]
  expected_agent?: string
}

export interface EvalOptions {
  fixturesRoot: string
  skillsRoot: string
  /**
   * Fixtures declared inline in the skill frontmatter (eval_fixtures).
   * When provided and non-empty, these are used instead of the file-based
   * YAML loader — no separate fixture directory is needed.
   */
  frontmatterFixtures?: FrontmatterFixture[] | null
}

export async function evaluateSkill(
  skillName: string,
  opts: EvalOptions,
): Promise<EvalResult> {
  // Frontmatter fixtures take precedence over file-based YAML fixtures.
  const fixtures =
    opts.frontmatterFixtures && opts.frontmatterFixtures.length > 0
      ? frontmatterFixturesToSkillFixtures(skillName, opts.frontmatterFixtures)
      : await loadSkillFixtures(skillName, opts.fixturesRoot)
  const details: EvalResult['details'] = []

  if (fixtures.routing.length === 0 && fixtures.content.length === 0) {
    return {
      skill: skillName,
      total: 0,
      passed: 0,
      failed: 0,
      score: 1,
      details,
    }
  }

  const registry = await loadAllSkills({ skillsRoot: opts.skillsRoot })
  const skill = registry.get(skillName)
  const context = await detectProject(process.cwd())

  // Routing tests
  for (const fixture of fixtures.routing) {
    const selected = selectSkills(fixture.prompt, registry, context)
    const matched = selected.some((s) => s.frontmatter.name === skillName)
    const passed = matched === fixture.shouldMatch
    details.push({
      type: 'routing',
      description: fixture.description ?? fixture.prompt,
      passed,
      message: passed
        ? `OK: "${fixture.prompt}" → ${fixture.shouldMatch ? 'matched' : 'not matched'}`
        : `FAIL: "${fixture.prompt}" → expected ${fixture.shouldMatch ? 'match' : 'no match'}, got ${matched ? 'match' : 'no match'}`,
    })
  }

  // Content tests
  if (skill) {
    const body = await getSkillBody(skill)
    for (const fixture of fixtures.content) {
      const passed = body.includes(fixture.contains)
      details.push({
        type: 'content',
        description: fixture.description ?? fixture.contains,
        passed,
        message: passed
          ? `OK: body contains "${fixture.contains}"`
          : `FAIL: body missing "${fixture.contains}"`,
      })
    }
  }

  const passed = details.filter((d) => d.passed).length
  const failed = details.length - passed
  return {
    skill: skillName,
    total: details.length,
    passed,
    failed,
    score: details.length > 0 ? passed / details.length : 1,
    details,
  }
}
