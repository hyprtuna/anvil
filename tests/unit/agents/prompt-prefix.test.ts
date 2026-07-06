/**
 * Plan 32 D4/D5 — Structural assertion: hot-path agents have
 * <instructions>...</instructions> static prefix blocks.
 *
 * Acceptance criterion #11:
 *   For each of the three refactored agents, the body (after stripping YAML
 *   frontmatter and optional whitespace/title) must begin with `<instructions>`
 *   and contain a closing `</instructions>` tag.
 *
 * D4 note: no offset coupling found in tests/unit/output-conventions.test.ts
 * (grep for \.lines\[\d+\], \.match.*line\s*\d+, :\s*\d+\s*$ returned no matches).
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip YAML frontmatter (--- ... ---) from an agent file body.
 * Returns the content after the closing `---` delimiter.
 */
function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  if (end === -1) return content
  return content.slice(end + 4) // skip past the closing `---\n`
}

/**
 * Strip the mandatory opening status marker line
 * (`## Status: <name> starting — ...`) from the body.
 * Returns the remainder, trimmed of leading whitespace.
 */
function stripStatusMarker(body: string): string {
  return body
    .replace(/^[\s\S]*?## Status: \S+ starting[^\n]*\n/, '')
    .trimStart()
}

function readAgent(name: string): string {
  return readFileSync(`agents/${name}.md`, 'utf-8')
}

/**
 * Returns the text that follows the YAML frontmatter and the mandatory
 * `## Status: <name> starting` line — i.e. the variable + static body
 * that should start with `<instructions>`.
 */
function bodyAfterStatusMarker(name: string): string {
  const raw = readAgent(name)
  const noFrontmatter = stripFrontmatter(raw)
  return stripStatusMarker(noFrontmatter)
}

// ---------------------------------------------------------------------------
// Hot-path agents that must have the <instructions> block
// ---------------------------------------------------------------------------

const HOT_PATH_AGENTS = [
  'orchestrator',
  'ultra-worker',
  'code-reviewer',
] as const

describe('Plan 32 D — hot-path agents have <instructions> static prefix block', () => {
  for (const name of HOT_PATH_AGENTS) {
    describe(`agents/${name}.md`, () => {
      it('body (after frontmatter + status marker) starts with <instructions>', () => {
        const body = bodyAfterStatusMarker(name)
        expect(
          body.startsWith('<instructions>'),
          `agents/${name}.md body does not start with <instructions> after status marker.\n` +
            `First 200 chars of body:\n${body.slice(0, 200)}`,
        ).toBe(true)
      })

      it('body contains closing </instructions> tag', () => {
        const content = readAgent(name)
        expect(
          content.includes('</instructions>'),
          `agents/${name}.md is missing a closing </instructions> tag`,
        ).toBe(true)
      })

      it('YAML frontmatter is unchanged (tier/role/color/tools preserved)', () => {
        const content = readAgent(name)
        // Verify name field is still in frontmatter
        expect(content).toMatch(/^name: /m)
        // ANV-0206: tier may be at root (pre-migration) or under x-anvil (post-migration).
        // Accept either form so this test survives the codemod rollout.
        expect(
          /^tier: /m.test(content) || /^\s+tier: /m.test(content),
          `agents/${name}.md must have tier: field (at root or under x-anvil)`,
        ).toBe(true)
        // Verify the file still has YAML frontmatter delimiters
        expect(content.startsWith('---\n')).toBe(true)
        const closingDelim = content.indexOf('\n---\n', 4)
        expect(
          closingDelim,
          `agents/${name}.md missing closing frontmatter delimiter`,
        ).toBeGreaterThan(0)
      })

      it('status markers are preserved outside of <instructions> block', () => {
        const content = readAgent(name)
        // Opening status marker must appear before <instructions>
        const openingMarkerIdx = content.indexOf(`## Status: ${name} starting`)
        const instructionsIdx = content.indexOf('<instructions>')
        expect(openingMarkerIdx).toBeGreaterThan(-1)
        expect(instructionsIdx).toBeGreaterThan(-1)
        expect(
          openingMarkerIdx,
          'Opening status marker must appear before <instructions> block',
        ).toBeLessThan(instructionsIdx)

        // Closing status marker must appear after </instructions>
        const closingTagIdx = content.indexOf('</instructions>')
        const closingMarkerIdx = content.lastIndexOf(`## Status: ${name} done`)
        expect(closingMarkerIdx).toBeGreaterThan(-1)
        expect(
          closingMarkerIdx,
          'Closing status marker must appear after </instructions> block',
        ).toBeGreaterThan(closingTagIdx)
      })
    })
  }
})
