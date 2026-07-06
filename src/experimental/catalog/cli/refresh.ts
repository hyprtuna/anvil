/**
 * ANV-0028 (P4) — `anvil catalog refresh [--source <id>]` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: yes. Mutates: _cache/ only.
 *
 * Fetches catalog indices from configured sources and writes them atomically.
 * Respects ANVIL_OFFLINE=1 (exit 4 when offline).
 *
 * Exit codes:
 *   0 — success
 *   1 — unknown source ID
 *   2 — network failure (non-offline)
 *   4 — ANVIL_OFFLINE=1
 */

import { writeIndexAtomic } from '../core/cache.js'
import { fetchUrl } from '../core/fetcher.js'
import { getBuiltInSources } from '../core/sources.js'
import type { CatalogIndex, CatalogSource } from '../core/types.js'
import {
  EXIT_INVALID_INPUT,
  EXIT_NETWORK_FAILURE,
  EXIT_OFFLINE,
  EXIT_OK,
  resolveAnvilHome,
  writeJson,
} from './common.js'

export interface RefreshOpts {
  source?: string
  json?: boolean
}

type RefreshResult = {
  source_id: string
  status: 'ok' | 'error' | 'offline'
  error?: string
}

/**
 * Parse an index JSON blob into CatalogIndex shape. Returns null on failure.
 */
function parseIndex(raw: unknown, source: CatalogSource): CatalogIndex | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const obj = raw as Record<string, unknown>

  // Build a minimal index from whatever the upstream provides
  // We require at minimum an 'entries' array; everything else we synthesise
  if (!Array.isArray(obj.entries)) return null

  const index: CatalogIndex = {
    source_id: source.id,
    schema_version:
      typeof obj.schema_version === 'string' ? obj.schema_version : '1.0.0',
    fetched_at: new Date().toISOString(),
    entries: [],
  }

  for (const entry of obj.entries as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    // Try to validate — skip entries that don't have required fields
    const e = entry as Record<string, unknown>
    if (
      typeof e.slug !== 'string' ||
      typeof e.display_name !== 'string' ||
      typeof e.description !== 'string' ||
      typeof e.upstream_repo !== 'string' ||
      typeof e.upstream_path !== 'string' ||
      typeof e.upstream_ref !== 'string' ||
      typeof e.fetch_url !== 'string' ||
      typeof e.fetch_kind !== 'string'
    ) {
      continue
    }
    index.entries.push({
      slug: e.slug,
      display_name: e.display_name,
      description: e.description,
      upstream_repo: e.upstream_repo,
      upstream_path: e.upstream_path,
      upstream_ref: e.upstream_ref,
      fetch_url: e.fetch_url,
      fetch_kind: e.fetch_kind as 'tarball' | 'zip' | 'tree-listing',
      declared_license:
        typeof e.declared_license === 'string' ? e.declared_license : undefined,
      declared_kind:
        typeof e.declared_kind === 'string'
          ? (e.declared_kind as 'extension' | 'preset' | 'profile')
          : undefined,
      size_hint_bytes:
        typeof e.size_hint_bytes === 'number' ? e.size_hint_bytes : undefined,
    })
  }

  return index
}

/**
 * Refresh a single source. Returns a RefreshResult.
 */
async function refreshSource(
  source: CatalogSource,
  anvilHome: string,
): Promise<RefreshResult> {
  const result = await fetchUrl(source.index_url)

  if (!result.ok) {
    if (result.error.kind === 'OFFLINE') {
      return { source_id: source.id, status: 'offline' }
    }
    const detail =
      result.error.kind === 'HTTP_STATUS'
        ? `HTTP ${result.error.status}`
        : result.error.kind === 'TOO_LARGE'
          ? `TOO_LARGE (${result.error.size} bytes)`
          : result.error.kind === 'NETWORK'
            ? result.error.detail
            : result.error.kind
    return {
      source_id: source.id,
      status: 'error',
      error: detail,
    }
  }

  // Parse the index
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(result.value).toString('utf-8'))
  } catch (err) {
    return {
      source_id: source.id,
      status: 'error',
      error: `Invalid JSON: ${(err as Error).message}`,
    }
  }

  const index = parseIndex(parsed, source)
  if (index === null) {
    return {
      source_id: source.id,
      status: 'error',
      error: 'Index missing required "entries" array or invalid format',
    }
  }

  try {
    await writeIndexAtomic(anvilHome, source.id, index)
  } catch (err) {
    return {
      source_id: source.id,
      status: 'error',
      error: `Write failed: ${(err as Error).message}`,
    }
  }

  return { source_id: source.id, status: 'ok' }
}

/**
 * Main handler for `anvil catalog refresh [--source <id>]`.
 *
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function refreshCommand(
  opts: RefreshOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  // Honour ANVIL_OFFLINE early (before touching network)
  if (process.env.ANVIL_OFFLINE === '1') {
    if (opts.json) {
      writeJson({
        status: 'offline',
        message: 'ANVIL_OFFLINE=1; refresh skipped',
      })
    } else {
      process.stdout.write(
        'Offline mode active (ANVIL_OFFLINE=1); refresh skipped.\n',
      )
    }
    return EXIT_OFFLINE
  }

  let sources = getBuiltInSources()

  if (opts.source !== undefined) {
    const found = getBuiltInSources().find((s) => s.id === opts.source)
    if (!found) {
      process.stderr.write(
        `anvil catalog refresh: unknown source "${opts.source}"\n`,
      )
      return EXIT_INVALID_INPUT
    }
    sources = [found]
  }

  const results: RefreshResult[] = []

  for (const source of sources) {
    const result = await refreshSource(source, anvilHome)
    results.push(result)
  }

  if (opts.json) {
    writeJson(results)
  } else {
    for (const r of results) {
      if (r.status === 'ok') {
        process.stdout.write(`  ok  ${r.source_id}\n`)
      } else if (r.status === 'offline') {
        process.stdout.write(`  --  ${r.source_id} (offline)\n`)
      } else {
        process.stderr.write(
          `  !!  ${r.source_id}: ${r.error ?? 'unknown error'}\n`,
        )
      }
    }
  }

  const hasNetworkError = results.some((r) => r.status === 'error')
  if (hasNetworkError) return EXIT_NETWORK_FAILURE

  return EXIT_OK
}
