/**
 * ANV-0028 (P4) — `anvil catalog list [--source <id>]` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: no (uses cached index only). Mutates: no.
 *
 * Lists all entries from cached indices, grouped by source.
 * Exits 0 always (empty cache is informational).
 */

import { readIndex } from '../core/cache.js'
import { getBuiltInSources } from '../core/sources.js'
import type { CatalogIndex } from '../core/types.js'
import {
  EXIT_INVALID_INPUT,
  EXIT_OK,
  resolveAnvilHome,
  writeJson,
} from './common.js'

export interface ListCatalogOpts {
  source?: string
  json?: boolean
}

type ListResult = {
  source_id: string
  display_name: string
  fetched_at: string
  entry_count: number
  entries: Array<{
    slug: string
    display_name: string
    description: string
    declared_kind?: string
  }>
}

/**
 * Main handler for `anvil catalog list [--source <id>]`.
 *
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function listCatalogCommand(
  opts: ListCatalogOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  let sources = getBuiltInSources()

  if (opts.source !== undefined) {
    const found = getBuiltInSources().find((s) => s.id === opts.source)
    if (!found) {
      process.stderr.write(
        `anvil catalog list: unknown source "${opts.source}"\n`,
      )
      return EXIT_INVALID_INPUT
    }
    sources = [found]
  }

  const results: ListResult[] = []

  for (const source of sources) {
    const index: CatalogIndex | null = await readIndex(anvilHome, source.id)

    if (index === null) {
      results.push({
        source_id: source.id,
        display_name: source.display_name,
        fetched_at: '',
        entry_count: 0,
        entries: [],
      })
      continue
    }

    results.push({
      source_id: source.id,
      display_name: source.display_name,
      fetched_at: index.fetched_at,
      entry_count: index.entries.length,
      entries: index.entries.map((e) => ({
        slug: e.slug,
        display_name: e.display_name,
        description: e.description,
        declared_kind: e.declared_kind,
      })),
    })
  }

  if (opts.json) {
    writeJson(results)
    return EXIT_OK
  }

  for (const r of results) {
    process.stdout.write(`\nSource: ${r.display_name} (${r.source_id})\n`)

    if (r.entry_count === 0) {
      if (r.fetched_at === '') {
        process.stdout.write(
          '  (no cached index — run `anvil catalog refresh`)\n',
        )
      } else {
        process.stdout.write(
          `  (empty index, fetched ${r.fetched_at.slice(0, 10)})\n`,
        )
      }
      continue
    }

    process.stdout.write(
      `  ${r.entry_count} entries (fetched ${r.fetched_at.slice(0, 10)})\n\n`,
    )

    for (const e of r.entries) {
      const kindTag = e.declared_kind ? ` [${e.declared_kind}]` : ''
      process.stdout.write(`  ${e.slug}${kindTag}\n`)
      process.stdout.write(`    ${e.display_name}\n`)
    }
  }

  return EXIT_OK
}
