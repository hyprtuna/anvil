import type { FrontmatterFixture } from './runner.js'
import type { SkillFixtures } from './types.js'

/**
 * Converts frontmatter `eval_fixtures` entries into the internal
 * `SkillFixtures` shape used by the eval runner.
 *
 * Mapping rules:
 * - Every fixture with a non-empty `prompt` becomes a routing fixture.
 *   `shouldMatch` is always `true` — the frontmatter fixture asserts that
 *   this skill SHOULD be selected for the given prompt.
 * - `expected_skills` and `expected_agent` are informational for now; they
 *   appear as the fixture description so reporters can surface them.
 */
export function frontmatterFixturesToSkillFixtures(
  _skillName: string,
  fixtures: FrontmatterFixture[],
): SkillFixtures {
  return {
    routing: fixtures.map((f) => {
      const extras: string[] = []
      if (f.expected_skills.length > 0)
        extras.push(`skills: [${f.expected_skills.join(', ')}]`)
      if (f.expected_agent) extras.push(`agent: ${f.expected_agent}`)
      return {
        prompt: f.prompt,
        shouldMatch: true,
        description:
          extras.length > 0 ? `${f.name} (${extras.join(', ')})` : f.name,
      }
    }),
    content: [],
  }
}
