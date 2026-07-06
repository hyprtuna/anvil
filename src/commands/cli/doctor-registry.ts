/**
 * ANV-0009 — Typed DoctorCheck registry.
 *
 * Defines the `DoctorCheck` interface that every extracted category module
 * must implement. The dispatcher in `doctor.ts` remains a thin orchestrator —
 * it collects `Check[]` from each registered runner and passes them to
 * `printCheckList`.
 *
 * Categories mirror the domains documented in the ticket:
 *   architecture | content | docs | installer | plugin | models |
 *   release | hooks | commands | capability
 *
 * Migration note: checks are moved incrementally. Not every category
 * has an extracted module yet. New checks SHOULD be added as `DoctorCheck`
 * entries rather than inline code in `doctor.ts`.
 */

import type { CheckStatus } from './common/report.js'
import { BOOTSTRAP_CHECKS } from './doctor-checks/bootstrap.js'
import { CAPABILITY_CHECKS } from './doctor-checks/capability.js'
import { INSTALLER_CHECKS } from './doctor-checks/installer.js'
import { PACK_COLLISIONS_CHECKS } from './doctor-checks/pack-collisions.js'
// ANV-0184: DESCRIPTION_SHAPE_CHECKS and AGENT_PERMISSION_CHECKS removed from
// doctor registry — migrated to `anvil skill lint` and `anvil agent lint`.
// ANV-0221: MODELS_CHECKS removed — model-id-allowlist invariant is fully covered
// by tests/unit/core/models/concrete-id-allowlist.test.ts:70.

// ---------------------------------------------------------------------------
// DoctorCheckCategory
// ---------------------------------------------------------------------------

export type DoctorCheckCategory =
  | 'agent-permission'
  | 'architecture'
  | 'capability'
  | 'commands'
  | 'content'
  | 'docs'
  | 'hooks'
  | 'installer'
  | 'models'
  | 'plugin'
  | 'release'

// ---------------------------------------------------------------------------
// DoctorCheck
// ---------------------------------------------------------------------------

/**
 * A single check entry in the doctor registry.
 *
 * `runner` is an async function that receives runtime context and pushes
 * one or more `CheckRow` objects onto the accumulator array.
 *
 * `fixHint` (optional) surfaces a remediation command that `--fix` can
 * apply. Keep in sync with `FIXABLE_WARNS` in `doctor.ts` for legacy rows
 * that have not yet been fully migrated.
 *
 * Extension hooks (ANV-0140 / ANV-0087):
 * - `expectedWhen` — predicate receiving context; when it returns true, the
 *   dispatcher should suppress non-fail rows in quiet mode. Wired by ANV-0140.
 * - `silentOnPass` — convenience flag; same suppression semantics as
 *   `expectedWhen` returning true, but requires no context. ANV-0140 will
 *   honour whichever is set.
 */
export interface DoctorCheck {
  /** Stable identifier — used in tests and future `--only <id>` flag. */
  readonly id: string
  /** Human-readable label shown in `anvil doctor` output. */
  readonly label: string
  /** Category for grouping and `--category` filtering. */
  readonly category: DoctorCheckCategory
  /**
   * The check runner. Pushes one or more rows onto `rows`.
   * Receives a frozen `DoctorCheckContext` so runners don't need to
   * re-derive common paths.
   */
  runner(ctx: DoctorCheckContext, rows: DoctorCheckRow[]): Promise<void> | void
  /** Optional CLI command that `--fix` can run to resolve a `warn` row. */
  fixHint?: string
  /**
   * When true (or when this predicate returns true), the dispatcher should
   * suppress non-fail rows in quiet mode. ANV-0140 will wire the suppression.
   */
  expectedWhen?: (ctx: DoctorCheckContext) => boolean
  /**
   * Convenience flag: suppress non-fail rows in quiet mode unconditionally.
   * Equivalent to `expectedWhen: () => true` but requires no context.
   * ANV-0140 will wire the suppression.
   */
  silentOnPass?: boolean
}

// ---------------------------------------------------------------------------
// DoctorCheckContext
// ---------------------------------------------------------------------------

/**
 * ANV-0146 — Install scope.
 *
 * Detected once in the dispatcher and threaded into context so individual
 * check runners (and inline checks) can suppress expected-absence rows
 * without re-deriving the scope.
 *
 * Detection rule:
 *   - 'project'  : .claude/settings.json OR .opencode/opencode.json exists in CWD
 *   - 'global'   : ~/.anvil/installed_plugins.json exists AND no project files
 *   - 'both'     : project files AND global evidence both present
 *   - 'unknown'  : none of the above
 */
export type InstallScope = 'global' | 'project' | 'both' | 'unknown'

/**
 * Shared runtime context threaded into every `DoctorCheck.runner`.
 * Derived once in the dispatcher; runners must not mutate it.
 */
export interface DoctorCheckContext {
  readonly cwd: string
  readonly home: string
  readonly anvilHome: string
  readonly inProject: boolean
  readonly skipDetail: string
  /** ANV-0146 — detected or overridden install scope. */
  readonly installScope: InstallScope
}

// ---------------------------------------------------------------------------
// DoctorCheckRow
// ---------------------------------------------------------------------------

/**
 * A single output row produced by a `DoctorCheck.runner`.
 * Compatible with `CheckRow` from `common/report.ts` plus a `name` field
 * that maps to the internal `Check.name` still used by the dispatcher.
 */
export interface DoctorCheckRow {
  /** Row display label (may differ from the parent `DoctorCheck.label`). */
  name: string
  status: CheckStatus
  detail: string
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * The ordered registry of all extracted `DoctorCheck` entries.
 *
 * Order determines output order when a future `--category` filter is used.
 * Within a category, checks run in the order they are listed here.
 *
 * Currently registered categories: installer, models, content (description-shape).
 * Remaining checks are still inline in `doctor.ts` (incremental migration).
 */
export const DOCTOR_REGISTRY: readonly DoctorCheck[] = [
  ...INSTALLER_CHECKS,
  ...CAPABILITY_CHECKS,
  ...BOOTSTRAP_CHECKS,
  // ANV-0096 — Pack collisions row appended (additive only).
  ...PACK_COLLISIONS_CHECKS,
]

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

/**
 * Returns a filtered view of the registry for the given category.
 * Preserves declaration order within the category.
 */
export function getChecksByCategory(
  category: DoctorCheckCategory,
  registry: readonly DoctorCheck[] = DOCTOR_REGISTRY,
): DoctorCheck[] {
  return registry.filter((c) => c.category === category)
}

/**
 * Returns checks sorted by category in the canonical order defined by
 * `CATEGORY_SORT_ORDER`. Checks in the same category maintain their
 * relative order from the registry.
 */
export const CATEGORY_SORT_ORDER: readonly DoctorCheckCategory[] = [
  'installer',
  'plugin',
  'models',
  'hooks',
  'commands',
  'architecture',
  'content',
  'docs',
  'capability',
  'agent-permission',
  'release',
]

export function sortChecksByCategory(
  checks: readonly DoctorCheck[],
): DoctorCheck[] {
  return [...checks].sort((a, b) => {
    const ai = CATEGORY_SORT_ORDER.indexOf(a.category)
    const bi = CATEGORY_SORT_ORDER.indexOf(b.category)
    const aIdx = ai === -1 ? CATEGORY_SORT_ORDER.length : ai
    const bIdx = bi === -1 ? CATEGORY_SORT_ORDER.length : bi
    return aIdx - bIdx
  })
}

/**
 * Runs all checks in the given registry (or a filtered subset), accumulating
 * rows. Suitable for unit tests and future `--category` flag support.
 */
export async function runChecks(
  ctx: DoctorCheckContext,
  checks: readonly DoctorCheck[],
): Promise<DoctorCheckRow[]> {
  const rows: DoctorCheckRow[] = []
  for (const check of checks) {
    await check.runner(ctx, rows)
  }
  return rows
}
