/**
 * Cross-contamination guard for Anvil adapters.
 *
 * Each platform adapter declares a set of `ownedPathPrefixes` — filesystem
 * path prefixes that it exclusively manages. This module refuses plan
 * operations where a write destination falls under a prefix owned by a
 * *different* adapter, preventing one adapter from silently corrupting
 * another adapter's configuration tree.
 *
 * Concept mirrors ECC's `PLATFORM_SOURCE_PATH_OWNERS` map. The guard lives
 * here (adapter layer) so it can be consumed by both the installer and the
 * doctor without reaching into higher layers.
 *
 * ANV-0060
 */

import type { PlatformAdapter } from './interface.js'

export interface CrossContaminationViolation {
  /** Relative path that triggered the violation. */
  path: string
  /** Adapter that owns the path prefix. */
  ownerAdapter: string
  /** Adapter that attempted to write to the path. */
  writingAdapter: string
  /** The matched prefix. */
  matchedPrefix: string
}

export interface CrossContaminationCheckResult {
  ok: boolean
  violations: CrossContaminationViolation[]
}

/**
 * Check whether any of `candidatePaths` (relative paths that `writingAdapter`
 * intends to create or overwrite) fall under a prefix owned by a *different*
 * adapter in `allAdapters`.
 *
 * @param writingAdapter - The adapter producing the candidate paths.
 * @param candidatePaths - Relative paths the writing adapter intends to touch.
 * @param allAdapters    - Full list of registered adapters (including `writingAdapter`).
 * @param options        - `allowCrossTarget`: skip the guard when true (explicit override).
 */
export function checkCrossContamination(
  writingAdapter: PlatformAdapter,
  candidatePaths: string[],
  allAdapters: PlatformAdapter[],
  options: { allowCrossTarget?: boolean } = {},
): CrossContaminationCheckResult {
  if (options.allowCrossTarget) {
    return { ok: true, violations: [] }
  }

  const violations: CrossContaminationViolation[] = []

  for (const candidatePath of candidatePaths) {
    // Normalise: strip leading './' so prefix matching is consistent.
    const normalised = candidatePath.startsWith('./')
      ? candidatePath.slice(2)
      : candidatePath

    for (const adapter of allAdapters) {
      if (adapter.name === writingAdapter.name) continue

      for (const prefix of adapter.ownedPathPrefixes) {
        if (normalised.startsWith(prefix)) {
          violations.push({
            path: candidatePath,
            ownerAdapter: adapter.name,
            writingAdapter: writingAdapter.name,
            matchedPrefix: prefix,
          })
          // One violation per path is enough — stop checking prefixes for this adapter.
          break
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  }
}

/**
 * Format a list of violations into a human-readable error message suitable
 * for CLI output or doctor findings.
 *
 * Example output:
 *   Cross-contamination guard: the 'opencode' adapter attempted to write into
 *   paths owned by 'claude-code'. Pass --allow-cross-target to override.
 *     - .claude-plugin/plugin.json  (prefix '.claude-plugin/', owner 'claude-code')
 */
export function formatCrossContaminationError(
  violations: CrossContaminationViolation[],
): string {
  if (violations.length === 0) return ''

  // Group by (writingAdapter, ownerAdapter) pair for a coherent message.
  const byPair = new Map<string, CrossContaminationViolation[]>()
  for (const v of violations) {
    const key = `${v.writingAdapter}→${v.ownerAdapter}`
    const list = byPair.get(key) ?? []
    list.push(v)
    byPair.set(key, list)
  }

  const lines: string[] = []
  for (const [, groupViolations] of byPair) {
    const first = groupViolations[0]
    lines.push(
      `Cross-contamination guard: the '${first.writingAdapter}' adapter attempted to write into` +
        ` paths owned by '${first.ownerAdapter}'. Pass --allow-cross-target to override.`,
    )
    for (const v of groupViolations) {
      lines.push(
        `  - ${v.path}  (prefix '${v.matchedPrefix}', owner '${v.ownerAdapter}')`,
      )
    }
  }

  return lines.join('\n')
}
