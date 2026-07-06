/**
 * Integration test: slash command semantic parity (ANV-0004).
 *
 * Walks all real slash `.md` files, loads the skill and agent registries from
 * the on-disk `skills/` and `agents/` directories, and asserts zero semantic
 * violations — i.e. every slug referenced on an invocation line is a known
 * skill, agent, or CLI command.
 *
 * This test will fail CI if a slash command references a missing slug, which
 * is the acceptance criterion for ANV-0004.
 */

import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadAllAgents } from '../../src/agents/load-all.js'
import {
  cliStemsFromFilenames,
  lintSlashSemanticParity,
} from '../../src/commands/slash/parity-lint.js'
import { loadSkillsEager } from '../../src/skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const SLASH_DIR = join(REPO_ROOT, 'src', 'commands', 'slash')
const CLI_DIR = join(REPO_ROOT, 'src', 'commands', 'cli')
const SKILLS_ROOT = join(REPO_ROOT, 'skills')
const AGENTS_ROOT = join(REPO_ROOT, 'agents')

describe('integration: slash command semantic parity', () => {
  it('all slash commands reference only known skill/agent/command slugs', async () => {
    // 1. Load skill registry
    const skillRegistry = await loadSkillsEager({ skillsRoot: SKILLS_ROOT })
    const skillSlugs = new Set(
      skillRegistry.getAll().map((s) => s.frontmatter.name),
    )

    // 2. Load agent registry
    const agentRegistry = await loadAllAgents({ agentsRoot: AGENTS_ROOT })
    const agentSlugs = new Set(
      agentRegistry.getAll().map((a) => a.frontmatter.name),
    )

    // 3. Derive CLI command stems
    const cliFilenames = await readdir(CLI_DIR)
    const cliCommands = cliStemsFromFilenames(cliFilenames)

    // 4. Read all slash .md files
    const slashFilenames = (await readdir(SLASH_DIR)).filter((f) =>
      f.endsWith('.md'),
    )
    const slashFiles = await Promise.all(
      slashFilenames.map(async (name) => {
        const path = join(SLASH_DIR, name)
        const content = await readFile(path, 'utf-8')
        return { path, content }
      }),
    )

    // 5. Run the semantic parity linter
    const violations = lintSlashSemanticParity(
      slashFiles,
      skillSlugs,
      agentSlugs,
      cliCommands,
    )

    // 6. Assert zero violations — format actionable file:line errors if any
    const report = violations
      .map((v) => `  ${v.file}:${v.line} — ${v.detail}`)
      .join('\n')

    expect(
      violations,
      `Semantic parity violations found:\n${report}`,
    ).toHaveLength(0)
  })

  it('review.md correctly distinguishes code-review (skill) from code-reviewer (agent)', async () => {
    const raw = await readFile(join(SLASH_DIR, 'review.md'), 'utf-8')

    // The skill being invoked is code-review (activity-noun)
    expect(raw).toContain('`code-review`')
    // The agent used for dispatch is code-reviewer (doer-noun)
    expect(raw).toContain('`code-reviewer`')
    // The old incorrect label must not appear as a standalone "skill" reference
    // i.e. we must not see "code-reviewer skill" (the W-004 bug)
    expect(raw).not.toMatch(/`code-reviewer`\s+skill/)
    // And the description should not claim code-reviewer is the skill
    expect(raw).not.toContain('Invoke the `code-reviewer` skill.')
  })

  it('all slash files have parseable frontmatter', async () => {
    const slashFilenames = (await readdir(SLASH_DIR)).filter((f) =>
      f.endsWith('.md'),
    )
    for (const name of slashFilenames) {
      const raw = await readFile(join(SLASH_DIR, name), 'utf-8')
      // Should not throw when parsed
      const { default: matter } = await import('gray-matter')
      const parsed = matter(raw)
      expect(parsed.data.name, `${name}: missing name`).toBeTruthy()
    }
  })

  it('registries are non-empty (load sanity check)', async () => {
    const skillRegistry = await loadSkillsEager({ skillsRoot: SKILLS_ROOT })
    const agentRegistry = await loadAllAgents({ agentsRoot: AGENTS_ROOT })

    expect(skillRegistry.size).toBeGreaterThan(10)
    expect(agentRegistry.size).toBeGreaterThan(5)
  })
})
