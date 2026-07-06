/**
 * ANV-0051 — Hook safety annotation coverage computation.
 *
 * Pure function consumed by `pushAgentSafetyAnnotationsCheck` in doctor.ts.
 * Mirrors `computeCommandSafetyCoverage` from command-registry.ts but
 * operates on the hook-handler surface.
 *
 * A hook is "covered" when it declares all four MCP hint fields as booleans.
 * Contradictory annotation (readOnlyHint=true + destructiveHint=true) is a fail.
 *
 * The live hook list is sourced from `getHookSafetyRecords()` in
 * `src/hooks/load-all.ts` (dynamically imported by doctor.ts) — there is
 * intentionally no static snapshot here. Commands (layer 4) may import from
 * hooks (layer 2); the dynamic import keeps the coupling explicit.
 */

export interface HookSafetyInput {
  /** The hook handler name (e.g. "session-start"). */
  name: string
  safety?: {
    readOnlyHint?: boolean | undefined
    destructiveHint?: boolean | undefined
    idempotentHint?: boolean | undefined
    openWorldHint?: boolean | undefined
  }
}

export interface HookSafetyCoverageResult {
  /** Overall status for the doctor row. */
  status: 'pass' | 'warn' | 'skip'
  /** Number of hooks with all four MCP hint fields declared. */
  covered: number
  /** Total number of hooks checked. */
  total: number
  /** Hook names with contradictory readOnlyHint=true + destructiveHint=true. */
  contradictory: string[]
  /**
   * Hook names missing one or more of the four required hint fields.
   */
  missing: string[]
}

/**
 * ANV-0051 — Pure coverage function consumed by the doctor row.
 *
 * Hooks are "covered" when all four MCP hint fields are declared as booleans.
 * Contradictory annotations (readOnly + destructive both true) are flagged
 * as contradictory.
 */
export function computeHookSafetyCoverage(
  hooks: HookSafetyInput[],
): HookSafetyCoverageResult {
  const total = hooks.length
  if (total === 0) {
    return {
      status: 'skip',
      covered: 0,
      total: 0,
      contradictory: [],
      missing: [],
    }
  }

  const contradictory: string[] = []
  const missing: string[] = []
  let covered = 0

  for (const hook of hooks) {
    const s = hook.safety
    const fullyAnnotated =
      s !== undefined &&
      typeof s.readOnlyHint === 'boolean' &&
      typeof s.destructiveHint === 'boolean' &&
      typeof s.idempotentHint === 'boolean' &&
      typeof s.openWorldHint === 'boolean'

    if (fullyAnnotated && s) {
      covered++
      if (s.readOnlyHint && s.destructiveHint) {
        contradictory.push(hook.name)
      }
    } else {
      missing.push(hook.name)
    }
  }

  const status: 'pass' | 'warn' =
    covered === total && contradictory.length === 0 ? 'pass' : 'warn'

  return { status, covered, total, contradictory, missing }
}
