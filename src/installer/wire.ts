import { claudeCodeAdapter } from '../adapters/claude-code/adapter.js'
import {
  checkCrossContamination,
  formatCrossContaminationError,
} from '../adapters/cross-contamination.js'
import type { PlatformAdapter } from '../adapters/interface.js'
import { opencodeAdapter } from '../adapters/opencode/adapter.js'
import type { WireOptions, WireResult } from './wire-claude-code.js'
import {
  unwireClaudeCodeProject,
  unwireClaudeCodeUser,
  wireClaudeCodeProject,
  wireClaudeCodeUser,
} from './wire-claude-code.js'
import type {
  WireOpenCodeOptions,
  WireOpenCodeResult,
} from './wire-opencode.js'
import {
  unwireOpenCodeProject,
  unwireOpenCodeUser,
  wireOpenCodeProject,
  wireOpenCodeUser,
} from './wire-opencode.js'

export type Target = 'cc-user' | 'cc-project' | 'oc-user' | 'oc-project'

/** All registered adapters for cross-contamination checks. */
const ALL_ADAPTERS: PlatformAdapter[] = [claudeCodeAdapter, opencodeAdapter]

/** Map a wire target to the adapter responsible for its writes. */
function adapterForTarget(t: Target): PlatformAdapter {
  return t === 'cc-user' || t === 'cc-project'
    ? claudeCodeAdapter
    : opencodeAdapter
}

/**
 * Map a resolved target string + scope to the concrete wire targets.
 * Single source of truth for `anvil init` (CLI + TUI).
 */
export function resolveWireTargets(target: string, scope: string): Target[] {
  const targets: Target[] = []
  const wantCC = target === 'both' || target === 'claude-code'
  const wantOC = target === 'both' || target === 'opencode'

  if (wantCC) {
    targets.push('cc-user')
    if (scope === 'project') targets.push('cc-project')
  }
  if (wantOC) {
    targets.push('oc-user')
    if (scope === 'project') targets.push('oc-project')
  }
  return targets
}

export type WireAllOptions = WireOptions &
  WireOpenCodeOptions & { allowCrossTarget?: boolean }

// WireResult shape is compatible with WireOpenCodeResult (both have mode + actions)
type AnyWireResult = WireResult | WireOpenCodeResult

/**
 * Run the cross-contamination guard for each target before any disk writes.
 * Throws if violations are found and `allowCrossTarget` is not set.
 *
 * Candidate paths for a given adapter are its `ownedPathPrefixes` — the set of
 * paths it will write into. If those prefixes are claimed by a *different*
 * adapter the guard refuses the operation.
 *
 * ANV-0060
 */
function assertNoCrossContamination(
  targets: Target[],
  allowCrossTarget: boolean,
): void {
  for (const t of targets) {
    const writingAdapter = adapterForTarget(t)
    // Candidate paths: use each owned prefix as a representative write path.
    const candidatePaths = writingAdapter.ownedPathPrefixes.map(
      (p) => `${p}sentinel`,
    )
    const result = checkCrossContamination(
      writingAdapter,
      candidatePaths,
      ALL_ADAPTERS,
      { allowCrossTarget },
    )
    if (!result.ok) {
      throw new Error(formatCrossContaminationError(result.violations))
    }
  }
}

export async function applyTargets(
  targets: Target[],
  opts: WireAllOptions,
): Promise<Partial<Record<Target, AnyWireResult>>> {
  // ANV-0060: refuse writes that cross adapter ownership boundaries.
  assertNoCrossContamination(targets, opts.allowCrossTarget ?? false)

  const out: Partial<Record<Target, AnyWireResult>> = {}
  for (const t of targets) {
    if (t === 'cc-user') out[t] = await wireClaudeCodeUser(opts)
    else if (t === 'cc-project') out[t] = await wireClaudeCodeProject(opts)
    else if (t === 'oc-user') out[t] = await wireOpenCodeUser(opts)
    else if (t === 'oc-project') out[t] = await wireOpenCodeProject(opts)
  }
  return out
}

export async function unapplyTargets(
  targets: Target[],
  opts: WireAllOptions,
): Promise<Partial<Record<Target, AnyWireResult>>> {
  const out: Partial<Record<Target, AnyWireResult>> = {}
  for (const t of targets) {
    if (t === 'cc-user') out[t] = await unwireClaudeCodeUser(opts)
    else if (t === 'cc-project') out[t] = await unwireClaudeCodeProject(opts)
    else if (t === 'oc-user') out[t] = await unwireOpenCodeUser(opts)
    else if (t === 'oc-project') out[t] = await unwireOpenCodeProject(opts)
  }
  return out
}
