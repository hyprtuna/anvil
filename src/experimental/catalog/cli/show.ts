/**
 * ANV-0028 (P4) — `anvil catalog show <source>:<slug>` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: no. Mutates: no.
 *
 * Displays a single entry's metadata + license + (if quarantined) validation status.
 *
 * Exit codes:
 *   0 — found or not-found with a clear message
 *   1 — invalid source:slug format or unknown source
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readIndex } from '../core/cache.js'
import { quarantineDir } from '../core/quarantine.js'
import { getBuiltInSources } from '../core/sources.js'
import {
  EXIT_INVALID_INPUT,
  EXIT_OK,
  parseSourceSlug,
  resolveAnvilHome,
  writeJson,
} from './common.js'

export interface ShowOpts {
  json?: boolean
}

type ValidationSnapshot = {
  decision?: string
  results?: unknown[]
} | null

/**
 * Try to read validation.json from the quarantine directory.
 * Returns null when absent or unparseable.
 */
async function readValidation(
  anvilHome: string,
  sourceId: string,
  slug: string,
): Promise<ValidationSnapshot> {
  const vPath = join(
    quarantineDir(anvilHome, sourceId, slug),
    'validation.json',
  )
  try {
    const raw = await readFile(vPath, 'utf-8')
    return JSON.parse(raw) as ValidationSnapshot
  } catch {
    return null
  }
}

/**
 * Main handler for `anvil catalog show <source>:<slug>`.
 *
 * @param arg       The "<source>:<slug>" argument.
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function showCommand(
  arg: string,
  opts: ShowOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  const parsed = parseSourceSlug(arg)
  if (parsed === null) {
    process.stderr.write(
      `anvil catalog show: argument must be in <source>:<slug> format, got "${arg}"\n`,
    )
    return EXIT_INVALID_INPUT
  }

  const { sourceId, slug } = parsed

  const source = getBuiltInSources().find((s) => s.id === sourceId)
  if (!source) {
    process.stderr.write(`anvil catalog show: unknown source "${sourceId}"\n`)
    return EXIT_INVALID_INPUT
  }

  const index = await readIndex(anvilHome, sourceId)
  const entry = index?.entries.find((e) => e.slug === slug) ?? null

  const validation = await readValidation(anvilHome, sourceId, slug)

  if (opts.json) {
    writeJson({
      source_id: sourceId,
      slug,
      entry,
      quarantined: validation !== null,
      validation,
    })
    return EXIT_OK
  }

  if (entry === null) {
    process.stdout.write(
      `No catalog entry found for ${sourceId}:${slug}.\n` +
        `Run \`anvil catalog refresh\` to update the index, or \`anvil catalog search ${slug}\` to search.\n`,
    )
    return EXIT_OK
  }

  process.stdout.write(`${entry.display_name} (${sourceId}:${entry.slug})\n`)
  process.stdout.write(`${'─'.repeat(60)}\n`)
  process.stdout.write(`Description: ${entry.description}\n`)
  process.stdout.write(
    `License    : ${entry.declared_license ?? '(not declared)'}\n`,
  )
  process.stdout.write(
    `Kind       : ${entry.declared_kind ?? '(not declared)'}\n`,
  )
  process.stdout.write(
    `Upstream   : ${entry.upstream_repo} @ ${entry.upstream_ref}\n`,
  )
  process.stdout.write(`Fetch URL  : ${entry.fetch_url}\n`)
  if (entry.size_hint_bytes !== undefined) {
    process.stdout.write(
      `Size hint  : ${(entry.size_hint_bytes / 1024).toFixed(1)} KiB\n`,
    )
  }

  if (validation !== null) {
    process.stdout.write('\nQuarantine status:\n')
    if (validation?.decision !== undefined) {
      process.stdout.write(`  Decision : ${validation.decision}\n`)
    }
    if (Array.isArray(validation?.results) && validation.results.length > 0) {
      process.stdout.write(`  Validators run: ${validation.results.length}\n`)
    }
  }

  return EXIT_OK
}
