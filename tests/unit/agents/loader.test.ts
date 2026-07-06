/**
 * Plan 32 D4 — Agent loader regression tests.
 *
 * Verifies that the <instructions>...</instructions> wrapper added to the
 * three hot-path agents in Plan 32 D1–D3 does NOT break frontmatter parsing.
 * Uses gray-matter directly (the same parser that load-all.ts uses) so this
 * matches the production code path exactly.
 *
 * D4 note: grep for line-offset coupling patterns in
 * tests/unit/output-conventions.test.ts returned no matches.
 * "no offset coupling found" — no updates needed there.
 */

import { readFileSync } from 'node:fs'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { AgentFrontmatter } from '../../../src/core/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAgent(name: string): ReturnType<typeof matter> {
  const raw = readFileSync(`agents/${name}.md`, 'utf-8')
  return matter(raw)
}

// ---------------------------------------------------------------------------
// Hot-path agents that were refactored in Plan 32 D1–D3
// ---------------------------------------------------------------------------

const HOT_PATH_AGENTS = [
  {
    name: 'orchestrator',
    expectedTier: 'planning',
    expectedColor: 'purple',
    expectedRole: 'orchestrator',
  },
  {
    name: 'ultra-worker',
    expectedTier: 'ultra',
    expectedColor: 'blue',
    expectedRole: 'orchestrator',
  },
  {
    name: 'code-reviewer',
    expectedTier: 'review',
    expectedColor: 'purple',
    expectedRole: 'verification',
  },
] as const

describe('Plan 32 D4 — frontmatter parsing survives <instructions> wrapper', () => {
  for (const {
    name,
    expectedTier,
    expectedColor,
    expectedRole,
  } of HOT_PATH_AGENTS) {
    describe(`agents/${name}.md`, () => {
      it('gray-matter parses frontmatter without error', () => {
        expect(() => parseAgent(name)).not.toThrow()
      })

      it('AgentFrontmatter Zod schema accepts the parsed data', () => {
        const parsed = parseAgent(name)
        const result = AgentFrontmatter.safeParse(parsed.data)
        expect(
          result.success,
          `AgentFrontmatter.safeParse failed for ${name}: ${
            result.success ? '' : result.error.message
          }`,
        ).toBe(true)
      })

      it(`name field is "${name}"`, () => {
        const parsed = parseAgent(name)
        expect(parsed.data.name).toBe(name)
      })

      it(`tier field is "${expectedTier}" (Phase E migration: model: → tier:)`, () => {
        const parsed = parseAgent(name)
        const data = parsed.data as Record<string, unknown>
        // ANV-0206: tier may be at root (pre-migration) or under x-anvil (post-migration)
        const xAnvil = data['x-anvil'] as Record<string, unknown> | undefined
        const effectiveTier = data.tier ?? xAnvil?.tier
        expect(effectiveTier).toBe(expectedTier)
        // model should be absent (defaults to 'inherit' via AgentFrontmatter schema)
        if (data.model !== undefined) {
          expect(data.model).toBe('inherit')
        }
      })

      it(`color field is "${expectedColor}"`, () => {
        const parsed = parseAgent(name)
        expect(parsed.data.color).toBe(expectedColor)
      })

      it(`role field is "${expectedRole}"`, () => {
        const parsed = parseAgent(name)
        const data = parsed.data as Record<string, unknown>
        // ANV-0206: role may be at root (pre-migration) or under x-anvil (post-migration)
        const xAnvil = data['x-anvil'] as Record<string, unknown> | undefined
        const effectiveRole = data.role ?? xAnvil?.role
        expect(effectiveRole).toBe(expectedRole)
      })

      it('body (parsed.content) is non-empty', () => {
        const parsed = parseAgent(name)
        expect(parsed.content.trim().length).toBeGreaterThan(0)
      })

      it('body contains <instructions> block', () => {
        const parsed = parseAgent(name)
        expect(parsed.content).toContain('<instructions>')
        expect(parsed.content).toContain('</instructions>')
      })
    })
  }
})
