import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ANV-0134 architecture guard — skill and agent bodies must reference the
 * canonical `.anvil/` and `docs/anvil/` artefact directories through the
 * `${ANVIL_*}` token vocabulary (see `src/core/artifact-paths.ts`), never
 * via hardcoded repo-relative paths. That keeps the source `.md` files
 * portable across any future relayout of the planning workspace.
 *
 * Scope: `skills/` and `agents/` body content.
 *
 * Legitimate exemptions:
 *   1. Fenced code blocks (triple-backtick) — used to show example output,
 *      JSON shapes, or worked examples that need literal paths.
 *   2. YAML frontmatter (delimited by `---`) — fields like `references:` are
 *      parsed by the loader and checked against disk; substitution does not
 *      apply, so a token would mean "literal file named ${TOKEN}".
 *   3. `CLAUDE.md` / `AGENTS.md` — author-facing docs for AI agents working
 *      on Anvil itself, not skill/agent bodies dispatched to the model.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SKILLS_ROOT = join(REPO_ROOT, 'skills')
const AGENTS_ROOT = join(REPO_ROOT, 'agents')

const META_FILENAMES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md'])

// Patterns that should appear only via `${ANVIL_*}` tokens (or inside a code
// fence / frontmatter). Match the directory or file with a trailing `/` or
// `.md` so we don't false-positive on `.anvil/state.json` or `.anvil/CLAUDE.md`.
const FORBIDDEN = [
  /\.anvil\/plans\b/,
  /\.anvil\/releases\b/,
  /\.anvil\/tickets\b/,
  /\.anvil\/audits\b/,
  /\.anvil\/specs\b/,
  /\.anvil\/research\b/,
  /\.anvil\/background-results\.md\b/,
  /\.anvil\/features\b/,
  /docs\/anvil\/plans\b/,
  /docs\/anvil\/releases\b/,
  /docs\/anvil\/tickets\b/,
  /docs\/anvil\/specs\b/,
  /docs\/anvil\/features\b/,
  /docs\/anvil\/backlog\b/,
]

function walk(dir: string, out: string[] = []): string[] {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p)
  }
  return out
}

/**
 * Strip fenced code blocks (```...```) and the leading YAML frontmatter
 * (everything between the first two `---` lines at the top of the file)
 * from `src`. The remaining text is the prose subject to the guard.
 */
function stripFencesAndFrontmatter(src: string): string {
  // Remove frontmatter — only the leading `---\n...\n---\n` block.
  let body = src
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---\n', 4)
    if (end !== -1) {
      body = body.slice(end + 5)
    }
  }
  // Remove fenced code blocks. Match an opening fence on its own line
  // (optionally followed by a language tag) through the matching closing
  // fence. Use the `m` flag so `^` and `$` honour line boundaries.
  return body.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
}

function scanFiles(root: string, label: string): void {
  const files = walk(root)
  for (const f of files) {
    if (META_FILENAMES.has(f.split('/').pop() ?? '')) continue
    const rel = relative(REPO_ROOT, f)
    it(`${label}: ${rel} uses \${ANVIL_*} tokens not hardcoded paths`, () => {
      const raw = readFileSync(f, 'utf8')
      const prose = stripFencesAndFrontmatter(raw)
      for (const pat of FORBIDDEN) {
        const match = prose.match(pat)
        expect(
          match?.[0] ?? null,
          `${rel}: hardcoded path "${match?.[0]}" — replace with a \${ANVIL_*} token (see src/core/artifact-paths.ts). Allowed in fenced code blocks or YAML frontmatter only.`,
        ).toBeNull()
      }
    })
  }
}

describe('architecture: skills use ${ANVIL_*} tokens', () => {
  scanFiles(SKILLS_ROOT, 'skills')
})

describe('architecture: agents use ${ANVIL_*} tokens', () => {
  scanFiles(AGENTS_ROOT, 'agents')
})
