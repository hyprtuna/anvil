/**
 * PreCompact observability handler — ANV-0023.
 *
 * Companion to the existing `preCompactSnapshotHandler` (which writes a
 * markdown context dump). This handler captures a *rule-bearing*
 * snapshot — total bytes + source names — so the PostCompact handler
 * can detect degradation after compaction discards rule context.
 *
 * Fires on the `pre-compact` HookKind. Pure transform separated from
 * the I/O wrapper for unit-testability.
 */

import {
  type ObservabilityDirective,
  buildDirective,
} from '../../../core/observability/index.js'
import type { HookHandler } from '../../../core/types.js'
import {
  type RuleSnapshot,
  instructionsSnapshotPath,
  preCompactSnapshotPath,
  readSnapshot,
  writeSnapshot,
} from './snapshot-store.js'

export interface PreCompactResult {
  snapshot: RuleSnapshot
  directive: ObservabilityDirective
}

/**
 * Pure transform. Constructs the snapshot + a `compaction-imminent`
 * directive (severity critical) describing what's about to be lost.
 *
 * If `baseline` is supplied (the prior `instructions-loaded` snapshot),
 * the snapshot inherits its byte/source-name shape; otherwise we
 * synthesise an empty baseline.
 */
export function buildPreCompactResult(
  cwd: string,
  baseline: RuleSnapshot | null,
  now: Date = new Date(),
): PreCompactResult {
  const totalBytes = baseline?.totalBytes ?? 0
  const sourceNames = baseline?.sourceNames ?? []
  const snapshot: RuleSnapshot = {
    capturedAt: now.toISOString(),
    totalBytes,
    sourceNames,
  }
  const directive = buildDirective(
    'compaction-imminent',
    {
      preCompactBytes: totalBytes,
      capturedRuleCount: sourceNames.length,
      snapshotPath: preCompactSnapshotPath(cwd),
    },
    { emittedAt: snapshot.capturedAt },
  )
  return { snapshot, directive }
}

/**
 * HookHandler entry-point. Reads the instructions-loaded baseline,
 * writes a pre-compact snapshot, exits 0.
 *
 * Never blocks compaction; on any failure the handler returns
 * exitCode 0 with a soft message.
 */
export const preCompactObservabilityHandler: HookHandler = async (ctx) => {
  try {
    const baseline = readSnapshot(instructionsSnapshotPath(ctx.cwd))
    const { snapshot } = buildPreCompactResult(ctx.cwd, baseline)
    writeSnapshot(preCompactSnapshotPath(ctx.cwd), snapshot)
    return { exitCode: 0 }
  } catch {
    return { exitCode: 0 }
  }
}
