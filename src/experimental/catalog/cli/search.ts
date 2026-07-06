/**
 * ANV-0028 (P4) — `anvil catalog search <query>` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: no (uses cached index only). Mutates: no.
 *
 * Searches across cached indices for entries matching the query against
 * display_name, description, and slug fields.
 *
 * Flags:
 *   --source <id>   restrict to a single source
 *   --kind <k>      filter by declared_kind (extension|preset|profile)
 *   --json          emit JSON array of matching entries (with source_id field)
 *
 * Exit code: 0 always (no matches is informational, not an error).
 */

import { readIndex } from '../core/cache.js'
import { getBuiltInSources } from '../core/sources.js'
import type { CatalogIndexEntry } from '../core/types.js'
import {
  EXIT_INVALID_INPUT,
  EXIT_OK,
  resolveAnvilHome,
  writeJson,
} from './common.js'

export interface SearchOpts {
  source?: string
  kind?: string
  json?: boolean
}

export type SearchHit = CatalogIndexEntry & { source_id: string }

/**
 * Match an entry against a query string (case-insensitive).
 * Checks display_name, description, and slug.
 */
function matchesQuery(entry: CatalogIndexEntry, q: string): boolean {
  const lower = q.toLowerCase()
  return (
    entry.display_name.toLowerCase().includes(lower) ||
    entry.description.toLowerCase().includes(lower) ||
    entry.slug.toLowerCase().includes(lower)
  )
}

/**
 * Main handler for `anvil catalog search <query>`.
 *
 * @param query     Search query string.
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function searchCommand(
  query: string,
  opts: SearchOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  if (query.trim().length === 0) {
    process.stderr.write('anvil catalog search: query must not be empty\n')
    return EXIT_INVALID_INPUT
  }

  let sources = getBuiltInSources()

  if (opts.source !== undefined) {
    const found = getBuiltInSources().find((s) => s.id === opts.source)
    if (!found) {
      process.stderr.write(
        `anvil catalog search: unknown source "${opts.source}"\n`,
      )
      return EXIT_INVALID_INPUT
    }
    sources = [found]
  }

  const hits: SearchHit[] = []

  for (const source of sources) {
    const index = await readIndex(anvilHome, source.id)
    if (index === null) continue

    for (const entry of index.entries) {
      // Apply --kind filter
      if (opts.kind !== undefined && entry.declared_kind !== opts.kind) {
        continue
      }
      if (matchesQuery(entry, query)) {
        hits.push({ ...entry, source_id: source.id })
      }
    }
  }

  if (opts.json) {
    writeJson(hits)
    return EXIT_OK
  }

  if (hits.length === 0) {
    process.stdout.write(`No results for "${query}".\n`)
    return EXIT_OK
  }

  process.stdout.write(`Found ${hits.length} result(s) for "${query}":\n\n`)
  for (const hit of hits) {
    const kindTag = hit.declared_kind ? ` [${hit.declared_kind}]` : ''
    process.stdout.write(`  ${hit.source_id}:${hit.slug}${kindTag}\n`)
    process.stdout.write(`    ${hit.display_name}\n`)
    process.stdout.write(`    ${hit.description}\n\n`)
  }

  return EXIT_OK
}
