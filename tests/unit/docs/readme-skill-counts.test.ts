import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Drift guard for skill counts in user-facing docs (ANV-0104).
 *
 * Counts the real skill files in skills/universal/ and skills/languages/**
 * and asserts that README.md and docs/features.md reference those exact numbers.
 *
 * If a skill is added or removed without updating the docs, this test will fail.
 * To fix: update README.md and docs/features.md to match the live tree,
 * or run `anvil doctor --catalog` to see canonical counts.
 */

const ROOT = process.cwd()

// ANV-0083: `*-prompt.md` files inside a subdir-form skill directory are
// sibling Task(general-purpose) prompt bodies, not skills.  The skill loader
// ignores them when SKILL.md is present in the same directory; this counter
// mirrors that to keep README/docs counts aligned with the loader.
function countMdFiles(dir: string): number {
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countMdFiles(join(dir, entry.name))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      entry.name !== 'CLAUDE.md' &&
      entry.name !== 'AGENTS.md' &&
      !entry.name.endsWith('-prompt.md')
    ) {
      count++
    }
  }
  return count
}

function countLangStacks(langDir: string): number {
  return readdirSync(langDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  ).length
}

describe('README + docs/features.md skill count drift guard', () => {
  const universalDir = join(ROOT, 'skills', 'universal')
  const languagesDir = join(ROOT, 'skills', 'languages')

  const universalCount = countMdFiles(universalDir)
  const languageFileCount = countMdFiles(languagesDir)
  const languageStackCount = countLangStacks(languagesDir)

  it('README.md references the correct universal skill count', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    expect(readme).toContain(
      `${universalCount} universal skill`,
      `README.md says "52 universal skills" but live tree has ${universalCount}. Update README.md to match, or run \`anvil doctor --catalog\` for canonical counts.`,
    )
  })

  it('README.md references the correct language skill file count', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    expect(readme).toContain(
      `${languageFileCount} language skill`,
      `README.md language skill count is stale. Live tree has ${languageFileCount} files ` +
        `across ${languageStackCount} stacks. Update README.md.`,
    )
  })

  it('docs/features.md references the correct universal skill count', () => {
    const features = readFileSync(join(ROOT, 'docs', 'features.md'), 'utf8')
    expect(features).toContain(
      `| Universal skills | ${universalCount} |`,
      `docs/features.md universal skill count is stale (live: ${universalCount}). Update the table.`,
    )
  })

  it('docs/features.md references the correct language overlay count', () => {
    const features = readFileSync(join(ROOT, 'docs', 'features.md'), 'utf8')
    expect(features).toContain(
      `${languageFileCount}`,
      `docs/features.md language overlay count is stale (live: ${languageFileCount} files across ` +
        `${languageStackCount} stacks). Update the table.`,
    )
  })
})
