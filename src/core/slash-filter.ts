/**
 * ANV-0257 — Shared filter for slash command emission.
 *
 * Extracts the `experimental: true` gate that previously lived only in
 * `src/adapters/claude-code/generate.ts` into a testable, adapter-neutral
 * helper. Every adapter that emits slash commands MUST route through this
 * function before rendering, so future experimental slash commands are
 * never accidentally surfaced on any platform.
 *
 * Location: `src/core/` (layer 0) — adapters (layer 5) can import downward
 * from here; placing it in `src/commands/` (layer 4) would invert the
 * dependency direction.
 *
 * Uses `gray-matter` for frontmatter parsing (preferred over regex per
 * Gate-3 finding: regex on raw YAML is fragile and misses edge cases).
 */

import matter from 'gray-matter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A slash command represented as a name + raw content string.
 * Matches the minimal shape used by adapter emit loops.
 */
export interface SlashFile {
  /** Filename, e.g. `note.md`. Used for diagnostics only — not parsed. */
  name: string
  /** Raw content of the slash command Markdown file including frontmatter. */
  content: string
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Return only the slash command files that are safe to emit to end-users.
 *
 * A file is suppressed when its frontmatter contains `experimental: true`
 * (literal boolean `true` — not a string). Files without frontmatter, or
 * with malformed frontmatter, are treated as emittable (fail-open so valid
 * commands are never silently dropped).
 *
 * @param files  Slash command files to filter.
 * @returns      Subset of `files` with no experimental entries.
 */
export function filterEmittableSlashCommands(files: SlashFile[]): SlashFile[] {
  return files.filter((file) => {
    if (!file.content.startsWith('---')) {
      // No frontmatter — treat as emittable.
      return true
    }

    let parsed: Record<string, unknown>
    try {
      parsed = matter(file.content).data as Record<string, unknown>
    } catch {
      // Malformed frontmatter — warn but don't throw; fail-open.
      console.warn(
        `[slash-filter] Could not parse frontmatter in ${file.name}; treating as emittable`,
      )
      return true
    }

    // Only suppress when experimental is the literal boolean true.
    // String "true", number 1, or any other value keeps the file emittable.
    return parsed.experimental !== true
  })
}
