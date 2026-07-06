/**
 * Installer-layer bridge for the cross-contamination guard (ANV-0060).
 *
 * Exposes a pre-wired `checkAdapterCrossContamination()` that runs
 * `checkCrossContamination` with the canonical set of registered adapters.
 * This sits in installer/ (layer 7) so that commands/ (layer 4) can import
 * it without violating the layer ordering rule (adapters/ is layer 5).
 */

import { claudeCodeAdapter } from '../adapters/claude-code/adapter.js'
import {
  type CrossContaminationCheckResult,
  checkCrossContamination,
  formatCrossContaminationError,
} from '../adapters/cross-contamination.js'
import { opencodeAdapter } from '../adapters/opencode/adapter.js'

export { formatCrossContaminationError }

/** All registered adapters for cross-contamination checks. */
const ALL_ADAPTERS = [claudeCodeAdapter, opencodeAdapter]

/**
 * Run `checkCrossContamination` for each registered adapter using its own
 * `ownedPathPrefixes` as representative candidate write paths.
 *
 * Returns the combined result: ok is true iff all adapters are clean.
 * Violations include the formatted error message from each offending adapter.
 *
 * Intended for use by `anvil doctor` and the installer.
 *
 * ANV-0060
 */
export function checkAdapterCrossContamination(): {
  ok: boolean
  messages: string[]
} {
  const messages: string[] = []

  for (const adapter of ALL_ADAPTERS) {
    const candidatePaths = adapter.ownedPathPrefixes.map((p) => `${p}sentinel`)
    const result: CrossContaminationCheckResult = checkCrossContamination(
      adapter,
      candidatePaths,
      ALL_ADAPTERS,
    )
    if (!result.ok) {
      messages.push(formatCrossContaminationError(result.violations))
    }
  }

  return { ok: messages.length === 0, messages }
}
