/**
 * PostCompact observability handler — ANV-0023.
 *
 * Detects rule-context degradation after a CC compaction. Mounts on
 * the `session-start` HookKind (the natural resume point after CC
 * compacts) and compares the current rule scan against the most
 * recent `pre-compact.json` snapshot. If rules went missing the
 * handler emits a `degradation-detected` directive (severity
 * critical).
 *
 * The handler is observational and never blocks. Pure transform
 * separated from the I/O wrapper.
 */

import {
  type ObservabilityDirective,
  buildDirective,
} from '../../../core/observability/index.js'
import type { HookHandler } from '../../../core/types.js'
import {
  buildInstructionsLoadedResult,
  scanRuleSources,
} from './instructions-loaded.js'
import {
  type RuleSnapshot,
  diffLostRules,
  preCompactSnapshotPath,
  readSnapshot,
} from './snapshot-store.js'

export interface PostCompactResult {
  /** Null when no degradation was detected (no directive emitted). */
  directive: ObservabilityDirective | null
  /** Names of rules present in the baseline but missing post-compact. */
  lostRules: string[]
}

/**
 * Pure transform. Given a baseline snapshot + the current rule scan,
 * decide whether degradation occurred and build the directive.
 *
 * Rule:
 *   - baseline null → no comparison possible; returns no directive.
 *   - lost rules empty → no degradation; returns no directive.
 *   - lost rules non-empty → emit a `degradation-detected` directive.
 */
export function buildPostCompactResult(
  baseline: RuleSnapshot | null,
  current: RuleSnapshot,
  snapshotPath?: string,
  now: Date = new Date(),
): PostCompactResult {
  if (baseline === null) return { directive: null, lostRules: [] }
  const lostRules = diffLostRules(baseline, current)
  if (lostRules.length === 0) return { directive: null, lostRules: [] }
  const directive = buildDirective(
    'degradation-detected',
    {
      baselineRuleCount: baseline.sourceNames.length,
      observedRuleCount: current.sourceNames.length,
      lostRules,
      ...(snapshotPath !== undefined ? { snapshotPath } : {}),
    },
    { emittedAt: now.toISOString() },
  )
  return { directive, lostRules }
}

/**
 * HookHandler entry-point. Reads the pre-compact snapshot, scans the
 * current rule sources, emits a degradation-detected directive when
 * applicable. Always exits 0.
 *
 * The directive is currently consumed only via the snapshot
 * comparison surfaced to the statusline pipeline (next commit) and
 * the doctor row; this handler does not inject into the model
 * channel.
 */
export const postCompactObservabilityHandler: HookHandler = async (ctx) => {
  try {
    const snapshotPath = preCompactSnapshotPath(ctx.cwd)
    const baseline = readSnapshot(snapshotPath)
    const rules = scanRuleSources(ctx.cwd)
    const { snapshot: current } = buildInstructionsLoadedResult(rules)
    buildPostCompactResult(baseline, current, snapshotPath)
    return { exitCode: 0 }
  } catch {
    return { exitCode: 0 }
  }
}
