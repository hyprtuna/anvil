/**
 * ANV-0203 (P3) — `anvil extension uninstall <name>` CLI command.
 *
 * Layer 4 — commands leaf.
 * Imports from: layer 7 (installer/extensions/).
 *
 * Dependency check (plan §4.3 — conservative match):
 *   A requires entry references <name> iff the URI body:
 *     - equals `extension:<name>`, OR
 *     - starts with `<name>/`
 *
 * Exit codes:
 *   0 — uninstalled or not-found
 *   5 — blocked by dependents (use --force to override)
 */

import { rm } from 'node:fs/promises'
import { extensionDir } from '../../../installer/extensions/paths.js'
import type { InstallRecord } from '../../../installer/extensions/registry-types.js'
import {
  loadRegistry,
  removeExtension,
} from '../../../installer/extensions/registry.js'
import { resolveAnvilHome } from './common.js'

export interface UninstallExtensionOpts {
  force?: boolean
  json?: boolean
}

/**
 * Check whether a requires URI entry references <name>.
 *
 * Per plan §4.3 conservative match:
 *   - URI format: `anvil:<body>`
 *   - body equals `extension:<name>` → match
 *   - body starts with `<name>/` → match
 *   - anything else → no match
 */
function requiresReferencesName(uri: string, name: string): boolean {
  if (!uri.startsWith('anvil:')) return false
  const body = uri.slice('anvil:'.length)
  return body === `extension:${name}` || body.startsWith(`${name}/`)
}

/**
 * Find all extensions that depend on <name> by scanning their manifest.requires[].
 * Returns the names of dependents.
 */
function findDependents(
  name: string,
  allExtensions: InstallRecord[],
): string[] {
  const blockers: string[] = []
  for (const ext of allExtensions) {
    if (ext.name === name) continue // skip self
    const deps = ext.manifest.requires ?? []
    if (deps.some((uri) => requiresReferencesName(uri, name))) {
      blockers.push(ext.name)
    }
  }
  return blockers
}

/**
 * Main handler for `anvil extension uninstall <name>`.
 *
 * @param name      Extension name to uninstall.
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function uninstallExtensionCommand(
  name: string,
  opts: UninstallExtensionOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  let registry: Awaited<ReturnType<typeof loadRegistry>>
  try {
    registry = await loadRegistry(anvilHome)
  } catch (err) {
    process.stderr.write(
      `[anvil:extension-uninstall] warn: registry unreadable — ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(64) // 64 = feature unavailable / gated (docs/anvil/exit-codes.md)
  }

  const allExtensions = Object.values(registry.extensions)
  const target = registry.extensions[name]

  if (!target) {
    const payload = { status: 'not-found' as const, name, blockers: [] }
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    } else {
      process.stdout.write(`Extension '${name}' is not installed.\n`)
    }
    return 0
  }

  // Dependency check
  const blockers = findDependents(name, allExtensions)
  if (blockers.length > 0 && !opts.force) {
    const payload = { status: 'blocked' as const, name, blockers }
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    } else {
      process.stderr.write(
        `anvil extension uninstall: '${name}' is required by: ${blockers.join(', ')}\nUse --force to uninstall anyway.\n`,
      )
    }
    return 5
  }

  // Remove from registry and disk
  try {
    await removeExtension(anvilHome, name)
    await rm(extensionDir(anvilHome, name), { recursive: true, force: true })
  } catch (err) {
    process.stderr.write(
      `anvil extension uninstall: failed to remove '${name}': ${(err as Error).message}\n`,
    )
    return 2
  }

  const payload = { status: 'uninstalled' as const, name, blockers: [] }
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  } else {
    process.stdout.write(`Uninstalled '${name}'.\n`)
  }
  return 0
}
