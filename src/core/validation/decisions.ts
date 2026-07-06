/**
 * Decision block parser — decisions.ts
 *
 * Layer 0 (core) — pure function, no I/O.
 *
 * Parses `<decisions>...</decisions>` blocks embedded in plan or spec markdown
 * files. The block format is an HTML-style fenced tag containing one decision
 * per dash-bulleted entry with YAML-ish `id:`, `title:`, and `rationale:` fields.
 *
 * ## Block format
 *
 * ```markdown
 * <decisions>
 * - id: D-001
 *   title: Use Zod for boundary validation
 *   rationale: Consistent with existing types.ts conventions; catches bad input early.
 *
 * - id: D-002
 *   title: Parser lives in core/validation
 *   rationale: Pure function, no I/O — fits Layer 0.
 * </decisions>
 * ```
 *
 * Rules:
 *  - The opening and closing tags are matched case-insensitively.
 *  - Only the FIRST `<decisions>` block is parsed (plans should have one).
 *  - Entries are separated by a blank line OR a new `- id:` line.
 *  - Unknown lines within an entry are silently ignored.
 *  - Entries missing `id`, `title`, or `rationale` are skipped (malformed).
 */

import type { Decision } from '../types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParseDecisionsResult {
  /** The parsed decisions extracted from the block. Empty if no block found. */
  decisions: Decision[]
  /**
   * The markdown text with the first `<decisions>` block removed.
   * Use this as the "body" when checking decision reference coverage.
   */
  bodyWithoutBlock: string
}

// ─── Regex helpers ────────────────────────────────────────────────────────────

/**
 * Matches the first `<decisions>...</decisions>` block (case-insensitive,
 * dotAll so `.` crosses newlines).
 */
const BLOCK_RE = /<decisions>([\s\S]*?)<\/decisions>/i

/** Matches a `key: value` pair at the start of a (trimmed) line. */
const KV_RE = /^(id|title|rationale):\s*(.+)$/i

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Extract the `<decisions>` block from `planMarkdown`, parse it into typed
 * `Decision` objects, and return the markdown text with the block removed.
 *
 * Pure function — reads nothing from disk. All inputs are provided by the caller.
 *
 * @param planMarkdown  Raw markdown content of a plan or spec file.
 * @returns             `{ decisions, bodyWithoutBlock }` — always returns both
 *                      fields; `decisions` is empty when no block is found.
 */
export function parseDecisionsBlock(
  planMarkdown: string,
): ParseDecisionsResult {
  const match = BLOCK_RE.exec(planMarkdown)

  if (!match) {
    return { decisions: [], bodyWithoutBlock: planMarkdown }
  }

  const blockContent = match[1] ?? ''
  const bodyWithoutBlock = planMarkdown.replace(match[0], '').trim()

  const decisions: Decision[] = []

  // Split on lines that begin a new entry (dash followed by optional whitespace
  // and `id:`). This handles both blank-line-separated and tightly-packed entries.
  const entryChunks = blockContent
    .split(/(?=^\s*-\s+id:)/im)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  for (const chunk of entryChunks) {
    const entry: Partial<Record<'id' | 'title' | 'rationale', string>> = {}

    for (const rawLine of chunk.split('\n')) {
      const line = rawLine.trim().replace(/^-\s*/, '')
      const kv = KV_RE.exec(line)
      if (kv) {
        const key = kv[1]?.toLowerCase() as 'id' | 'title' | 'rationale'
        const value = kv[2]?.trim() ?? ''
        if (key && value) {
          entry[key] = value
        }
      }
    }

    if (entry.id && entry.title && entry.rationale) {
      decisions.push({
        id: entry.id,
        title: entry.title,
        rationale: entry.rationale,
      })
    }
  }

  return { decisions, bodyWithoutBlock }
}
