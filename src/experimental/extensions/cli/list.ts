/**
 * ANV-0203 (P3) — `anvil extension list` CLI command.
 *
 * Layer 4 — commands leaf.
 * Imports from: layer 7 (installer/extensions/).
 *
 * Exit code: 0 always (empty registry is not an error).
 */

import { table } from 'table'
import type { Registry } from '../../../installer/extensions/registry-types.js'
import { loadRegistry } from '../../../installer/extensions/registry.js'
import { resolveAnvilHome } from './common.js'

export interface ListExtensionsOpts {
  json?: boolean
  verbose?: boolean
}

/**
 * Main handler for `anvil extension list`.
 *
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code (always 0).
 */
export async function listExtensionsCommand(
  opts: ListExtensionsOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  let registry: Registry
  try {
    registry = await loadRegistry(anvilHome)
  } catch (err) {
    process.stderr.write(
      `[anvil:extension-list] warn: registry unreadable — ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(64) // 64 = feature unavailable / gated (docs/anvil/exit-codes.md)
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(registry, null, 2)}\n`)
    return 0
  }

  const entries = Object.values(registry.extensions)

  if (entries.length === 0) {
    process.stdout.write('No extensions installed.\n')
    return 0
  }

  if (opts.verbose) {
    const header = [
      'NAME',
      'VERSION',
      'KIND',
      'INSTALLED',
      'SOURCE',
      'SCHEMA_VERSION',
    ]
    const rows = entries.map((rec) => [
      rec.name,
      rec.version,
      rec.manifest.kind,
      rec.installed_at.slice(0, 10),
      `${rec.source.kind}:${rec.source.path}`,
      rec.manifest.schema_version,
    ])
    process.stdout.write(table([header, ...rows]))
  } else {
    const header = ['NAME', 'VERSION', 'KIND', 'INSTALLED']
    const rows = entries.map((rec) => [
      rec.name,
      rec.version,
      rec.manifest.kind,
      rec.installed_at.slice(0, 10),
    ])
    process.stdout.write(table([header, ...rows]))
  }

  return 0
}
