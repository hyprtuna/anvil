/**
 * ANV-0048 — Per-adapter conflict scanner.
 *
 * Given an installed-plugins payload (parsed JSON from
 * ~/.claude/plugins/installed_plugins.json), extracts the installed plugin
 * slugs and returns any entries from the KNOWN_CONFLICTS registry that match.
 *
 * Design:
 * - Pure functions with no I/O — callers supply the parsed payload.
 * - Slug matching is case-insensitive to avoid false-negative misses
 *   when the marketplace normalises casing differently from the registry.
 * - Returns an empty array when the payload is absent / malformed (graceful
 *   degradation — the caller surfaces a skip row, not an error).
 */

import { type ConflictEntry, KNOWN_CONFLICTS } from './known.js'

export interface ConflictHit {
  slug: string
  reason: string
}

/**
 * Extract installed plugin slugs from a CC installed_plugins.json v2 payload.
 *
 * v2 shape:
 *   { "version": 2, "plugins": { "<slug>@<scope>": [...] } }
 *
 * Returns an empty array when the payload is null, absent, or does not
 * conform to the v2 schema.
 */
export function extractCcInstalledSlugs(payload: unknown): string[] {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
    return []
  const record = payload as Record<string, unknown>
  // Only parse v2 schema; unknown versions return empty to avoid slug extraction
  // from a differently-shaped manifest producing false matches or misses.
  if (record.version !== 2) return []
  const plugins = record.plugins
  if (plugins === null || typeof plugins !== 'object' || Array.isArray(plugins))
    return []
  // Keys are `<slug>@<scope>` — extract the slug prefix.
  return Object.keys(plugins as Record<string, unknown>).map((key) => {
    const atIdx = key.indexOf('@')
    return atIdx === -1 ? key : key.slice(0, atIdx)
  })
}

/**
 * Check a list of installed slugs against the KNOWN_CONFLICTS registry for a
 * given adapter.
 *
 * @param adapter     Registry key (e.g. `"claude-code"`, `"opencode"`).
 * @param installedSlugs  Slugs present in the installed plugins manifest.
 * @returns Array of conflict hits (empty → no conflicts).
 */
export function scanForConflicts(
  adapter: string,
  installedSlugs: ReadonlyArray<string>,
): ConflictHit[] {
  const entries: ReadonlyArray<ConflictEntry> = KNOWN_CONFLICTS[adapter] ?? []
  const hits: ConflictHit[] = []
  for (const entry of entries) {
    const entryLower = entry.slug.toLowerCase()
    if (installedSlugs.some((s) => s.toLowerCase() === entryLower)) {
      hits.push({ slug: entry.slug, reason: entry.reason })
    }
  }
  return hits
}
