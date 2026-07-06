/**
 * ANV-0028 (P4) — `anvil catalog list-sources` CLI command.
 *
 * Layer 4 — commands leaf.
 * Imports from: layer 0 (core/catalog/sources).
 *
 * Reads the bundled source list. No network, no disk mutation.
 *
 * Exit code: 0 always.
 */

import { getBuiltInSources } from '../core/sources.js'
import { EXIT_OK, writeJson } from './common.js'

export interface ListSourcesOpts {
  json?: boolean
}

/**
 * Main handler for `anvil catalog list-sources`.
 *
 * @param opts      Command options.
 * @returns Exit code (always 0).
 */
export async function listSourcesCommand(
  opts: ListSourcesOpts,
): Promise<number> {
  const sources = getBuiltInSources()

  if (opts.json) {
    writeJson(sources)
    return EXIT_OK
  }

  if (sources.length === 0) {
    process.stdout.write('No catalog sources configured.\n')
    return EXIT_OK
  }

  process.stdout.write('Catalog sources:\n')
  for (const src of sources) {
    const tier = `[${src.trust_tier}]`
    process.stdout.write(
      `  ${tier.padEnd(12)} ${src.display_name}  (${src.id})\n`,
    )
    process.stdout.write(`               ${src.index_url}\n`)
  }

  return EXIT_OK
}
