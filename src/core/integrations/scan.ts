/**
 * ANV-0151 — Per-adapter integration gap scanner.
 *
 * Given a list of installed plugin slugs, returns categories where none of
 * the recommended plugins are installed. Mirrors the design of the conflict
 * scanner (src/core/conflicts/scan.ts) but emits gaps (missing recommended
 * integrations) rather than hits (conflicting plugins).
 *
 * Design:
 * - Pure functions with no I/O — callers supply the parsed slug list.
 * - Slug matching is case-insensitive (mirrors conflict scanner convention).
 * - Returns an empty array when the payload is absent / malformed (graceful
 *   degradation — the caller surfaces a skip row, not an error).
 */

import { type IntegrationEntry, KNOWN_INTEGRATIONS } from './known.js'

export interface IntegrationGap {
  /** The category with no installed recommended plugin. */
  category: string
  /** The candidate plugins recommended for this category. */
  recommended: ReadonlyArray<IntegrationEntry>
}

/**
 * Find capability categories where none of the recommended plugins are
 * installed for the given adapter.
 *
 * @param adapter        Registry key (e.g. `"claude-code"`, `"opencode"`).
 * @param installedSlugs Slugs present in the installed plugins manifest.
 * @returns Array of gaps — categories with zero installed recommended slugs.
 */
export function findIntegrationGaps(
  adapter: string,
  installedSlugs: ReadonlyArray<string>,
): IntegrationGap[] {
  const entries: ReadonlyArray<IntegrationEntry> =
    KNOWN_INTEGRATIONS[adapter] ?? []

  if (entries.length === 0) return []

  // Group entries by category.
  const byCategory = new Map<string, IntegrationEntry[]>()
  for (const entry of entries) {
    const bucket = byCategory.get(entry.category)
    if (bucket === undefined) {
      byCategory.set(entry.category, [entry])
    } else {
      bucket.push(entry)
    }
  }

  const installedLower = installedSlugs.map((s) => s.toLowerCase())
  const gaps: IntegrationGap[] = []

  for (const [category, candidates] of byCategory) {
    const anyInstalled = candidates.some((c) =>
      installedLower.includes(c.slug.toLowerCase()),
    )
    if (!anyInstalled) {
      gaps.push({ category, recommended: candidates })
    }
  }

  return gaps
}
