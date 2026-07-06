import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ANV-0174 architecture guard — every `CLAUDE.md` in the Anvil-owned tree
 * is a 2-line `@`-import stub pointing at its sibling `AGENTS.md`. The
 * single source of truth lives in `AGENTS.md`; the `CLAUDE.md` only
 * exists so Claude Code's memory-file protocol picks up the content via
 * the `@./AGENTS.md` import.
 *
 * Two assertions per `CLAUDE.md`:
 *   1. The body matches the canonical stub: an optional HTML comment
 *      followed by an `@./AGENTS.md` line, with nothing else (whitespace
 *      tolerated).
 *   2. A sibling `AGENTS.md` exists.
 *
 * Excluded paths:
 *   - `references/**` — research-only, gitignored, not Anvil-owned.
 *   - `node_modules/**` — third-party.
 *   - `.worktrees/**` — sibling worktrees.
 *   - `**\/_archive/**` — frozen prior-session artifacts; read-only.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..')

const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.worktrees',
  'references',
  '_archive',
  '.git',
])

/**
 * Canonical stub matcher.
 *
 * Accepts:
 *   <!-- ... HTML comment ... -->
 *   @./AGENTS.md
 *
 * Both elements may be surrounded by leading/trailing whitespace. The
 * HTML comment is optional. Anything else triggers a failure.
 */
const STUB_PATTERN = /^(?:<!--[\s\S]*?-->\s*)?@\.\/AGENTS\.md\s*$/

function walk(dir: string, out: string[] = []): string[] {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.isFile() && entry.name === 'CLAUDE.md') out.push(p)
  }
  return out
}

const claudeMdFiles = walk(REPO_ROOT)

describe('architecture: CLAUDE.md is a stub @-importing AGENTS.md', () => {
  if (claudeMdFiles.length === 0) {
    it('found at least one CLAUDE.md to check', () => {
      expect(claudeMdFiles.length).toBeGreaterThan(0)
    })
    return
  }

  for (const file of claudeMdFiles) {
    const rel = relative(REPO_ROOT, file)
    it(`${rel} matches the canonical stub format`, () => {
      const body = readFileSync(file, 'utf8').trim()
      expect(
        STUB_PATTERN.test(body),
        `${rel}: not a stub. Body must be (optional HTML comment) + @./AGENTS.md and nothing else. Edit the sibling AGENTS.md instead.\n--- body ---\n${body}\n--- end body ---`,
      ).toBe(true)
    })

    it(`${rel} has a sibling AGENTS.md`, () => {
      const sibling = file.replace(/CLAUDE\.md$/, 'AGENTS.md')
      expect(
        existsSync(sibling),
        `${rel}: missing sibling AGENTS.md at ${relative(REPO_ROOT, sibling)}. Every CLAUDE.md stub must @-import a real AGENTS.md.`,
      ).toBe(true)
    })
  }
})
