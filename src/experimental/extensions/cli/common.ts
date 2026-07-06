/**
 * ANV-0203 (P3) — Shared helpers for `anvil extension` CLI commands.
 *
 * Layer 4 — commands leaf.
 * Imports from: node:os, node:path, layer 7 (installer/extensions/).
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallError } from '../../../installer/extensions/install-pipeline.js'

/**
 * Resolve the Anvil home directory.
 * Prefers ANVIL_HOME env var; falls back to ~/.anvil.
 */
export function resolveAnvilHome(): string {
  return process.env.ANVIL_HOME ?? join(homedir(), '.anvil')
}

/**
 * Map an InstallError kind to a numeric exit code.
 *
 * Exit code contract (per plan §4.1):
 *   0 — success / skip
 *   1 — INVALID_MANIFEST | RENAME_REQUIRED (invalid flag combo)
 *   2 — EXTRACTION_FAILED | PATH_TRAVERSAL
 *   3 — UNRESOLVED_COLLISION | CANNOT_REPLACE_BUNDLED | RENAME_REQUIRED (slug invalid)
 *   4 — non-interactive without --on-collision
 *   5 — blocked by dependents (uninstall only)
 */
export function mapErrorToExitCode(error: InstallError): number {
  switch (error.kind) {
    case 'INVALID_MANIFEST':
      return 1
    case 'RENAME_REQUIRED':
      // RENAME_REQUIRED fires both when rename slug is absent (user error → 1)
      // and when slug is invalid. Both are user-configuration errors.
      return 1
    case 'PATH_TRAVERSAL':
    case 'EXTRACTION_FAILED':
      return 2
    case 'UNRESOLVED_COLLISION':
    case 'CANNOT_REPLACE_BUNDLED':
      return 3
    case 'REGISTRY_LOCKED':
      return 6
  }
}

/**
 * Format the install outcome for human-readable output.
 * Returns a single line describing the result.
 */
export function formatHumanInstallResult(opts: {
  status: 'installed' | 'replaced' | 'skipped'
  name: string
  version: string
  source: string
}): string {
  const { status, name, version, source } = opts
  switch (status) {
    case 'installed':
      return `Installed ${name}@${version} from ${source}\n`
    case 'replaced':
      return `Replaced ${name}@${version} from ${source}\n`
    case 'skipped':
      return `Skipped ${name}@${version} (already installed, strategy: skip)\n`
  }
}
