/**
 * Plan 38 Phase E — Agent frontmatter tier sweep test.
 *
 * Loads every agents/*.md file (excluding AGENTS.md, CLAUDE.md), parses
 * frontmatter via gray-matter + AgentFrontmatter Zod schema, and asserts:
 *   1. Each agent has `tier:` set (not `model:`)
 *   2. `tier` value is one of the 6 valid tiers
 *   3. No agent retains `model:` set to a non-default (non-'inherit') value
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { AgentFrontmatter, AgentTier } from '../../../src/core/types.js'

const AGENTS_DIR = join(process.cwd(), 'agents')
const VALID_TIERS = AgentTier.options

function loadAgentFiles(): { name: string; path: string }[] {
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md') && !/^[A-Z]/.test(f))
    .map((f) => ({ name: f.replace('.md', ''), path: join(AGENTS_DIR, f) }))
}

describe('Phase E / agent frontmatter tier sweep', () => {
  const agentFiles = loadAgentFiles()

  // ANV-0083 collapsed 4 single-use review/audit agents into sibling
  // Task(general-purpose) prompt bodies under their consuming skills.
  // Floor lowered from 19 to 17.
  it('finds at least 17 agent files', () => {
    expect(agentFiles.length).toBeGreaterThanOrEqual(17)
  })

  for (const { name, path } of agentFiles) {
    describe(`agents/${name}.md`, () => {
      it('parses frontmatter without error', () => {
        expect(() => matter(readFileSync(path, 'utf-8'))).not.toThrow()
      })

      it('passes AgentFrontmatter Zod schema', () => {
        const parsed = matter(readFileSync(path, 'utf-8'))
        const result = AgentFrontmatter.safeParse(parsed.data)
        expect(result.success, result.success ? '' : result.error.message).toBe(
          true,
        )
      })

      it('has tier: set (not model:)', () => {
        const parsed = matter(readFileSync(path, 'utf-8'))
        const data = parsed.data as Record<string, unknown>
        // ANV-0206: tier may be at root (legacy) or under x-anvil (post-migration)
        const xAnvil = data['x-anvil'] as Record<string, unknown> | undefined
        const tier = data.tier ?? xAnvil?.tier
        expect(
          tier,
          `${name}.md must have tier: set (root or under x-anvil)`,
        ).toBeDefined()
        // model must be absent or 'inherit' (the default — CC spec allows it)
        const model = data.model
        if (model !== undefined) {
          expect(
            model,
            `${name}.md must not have model: set to a non-inherit value — found model:${String(model)}`,
          ).toBe('inherit')
        }
      })

      it('tier value is a valid tier name', () => {
        const parsed = matter(readFileSync(path, 'utf-8'))
        const data = parsed.data as Record<string, unknown>
        // ANV-0206: tier may be at root or under x-anvil
        const xAnvil = data['x-anvil'] as Record<string, unknown> | undefined
        const tier = data.tier ?? xAnvil?.tier
        expect(
          VALID_TIERS,
          `${name}.md has unknown tier: ${String(tier)}`,
        ).toContain(tier)
      })

      it('has no effort: field in frontmatter', () => {
        const parsed = matter(readFileSync(path, 'utf-8'))
        const data = parsed.data as Record<string, unknown>
        expect(
          data.effort,
          `${name}.md must not have effort: in frontmatter (tier provides effort via defaults)`,
        ).toBeUndefined()
      })
    })
  }
})
