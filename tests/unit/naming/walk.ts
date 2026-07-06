import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

const SKIP = new Set(['CLAUDE.md', 'AGENTS.md'])

/**
 * Walks .md files under a root, returning their absolute paths.
 *
 * Skips:
 * - `CLAUDE.md` and `AGENTS.md` (folder-guide stubs / source-of-truth).
 * - `*-prompt.md` files inside a subdir-form skill directory (ANV-0083) —
 *   these are sibling Task(general-purpose) prompt bodies, not skills or
 *   agents.  The skill loader (`src/skills/loader.ts`) ignores them when
 *   `SKILL.md` is present in the same directory; this walker mirrors that.
 * - Entries beginning with `_` (ANV-0181 convention) — files like
 *   `_*.md` and directories like `_addenda/` are excluded from the user
 *   bundle and are not standalone skills/agents. The audit scanner in
 *   `src/core/audit/surfaces.ts:542` applies the same rule.
 */
export function walkMd(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !SKIP.has(entry.name) &&
        !entry.name.endsWith('-prompt.md')
      ) {
        out.push(full)
      }
    }
  }
  return out
}

export function slugFromPath(path: string): string {
  return basename(path).replace(/\.md$/, '')
}
