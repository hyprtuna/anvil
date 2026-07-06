import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Plan 42 Phase B — per-language rules for Rust, Java, Kotlin, PHP.
 *
 * v0.10.2 shipped TS/Python/Go (12 files). v0.10.5 adds 16 more — 4 topics
 * × 4 languages — completing the high-traffic-language coverage.
 */
const LANGUAGES = ['rust', 'java', 'kotlin', 'php']
const TOPICS = ['coding-style', 'patterns', 'security', 'testing']
const REPO_ROOT = process.cwd()

const PATHS_BY_LANG: Record<string, string[]> = {
  rust: ['**/*.rs'],
  java: ['**/*.java'],
  kotlin: ['**/*.kt', '**/*.kts'],
  php: ['**/*.php'],
}

describe('per-language rules — Rust/Java/Kotlin/PHP (Plan 42 Item B)', () => {
  for (const lang of LANGUAGES) {
    for (const topic of TOPICS) {
      const path = join(
        REPO_ROOT,
        'skills',
        'languages',
        lang,
        'rules',
        `${topic}.md`,
      )

      it(`${lang}/rules/${topic}.md exists`, () => {
        expect(existsSync(path), `missing: ${path}`).toBe(true)
      })

      it(`${lang}/rules/${topic}.md has correct frontmatter shape`, () => {
        const content = readFileSync(path, 'utf-8')
        expect(content).toContain(`name: ${lang}-${topic}-rules`)
        expect(content).toContain('user-invocable: false')
        // ANV-0206: kind/group/language may be at root (pre-migration) or
        // under x-anvil: (post-migration). toContain works for both since the
        // strings are present either way (just indented after migration).
        expect(content).toContain('kind: meta')
        expect(content).toContain('group: rules')
        expect(content).toContain(`language: ${lang}`)
        expect(content).toContain('paths:')
        for (const glob of PATHS_BY_LANG[lang] as ReadonlyArray<string>) {
          // ANV-0206: YAML serializer may use single or double quotes for globs.
          // Check for the glob pattern text regardless of quote style.
          const escapedGlob = glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          expect(content).toMatch(new RegExp(escapedGlob))
        }
      })

      it(`${lang}/rules/${topic}.md carries the skill-not-agent callout`, () => {
        const content = readFileSync(path, 'utf-8')
        expect(content).toContain(
          `Skill({skill: "anvil:${lang}-${topic}-rules"})`,
        )
        expect(content).toContain('This is a skill, not an agent')
      })
    }
  }
})
