/**
 * Phase-resolution matrix (Plan 36 Phase E).
 *
 * Pure function (with I/O for state + artifact reads):
 *   (intent, cwd, config?) → Directive
 *
 * The 7-intent × 4-artifact-state matrix enforces the SDD-over-application
 * safety property: non-implementation intents ALWAYS proceed; only
 * `implementation` is subject to SDD artifact gating.
 *
 * Layer 1-adjacent — imports from core/sdd (Layer 0) only.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { planPath, specPath } from '../core/sdd/feature-paths.js'
import { readState } from '../core/sdd/state-store.js'

// ── Directive type ─────────────────────────────────────────────────────────

/**
 * A routing directive emitted by the phase-resolution matrix.
 *
 * - `kind: 'proceed'` — continue as normal; no SDD redirect needed.
 * - `kind: 'redirect'` — user should run `anvil <target>` first.
 * - `target` — which CLI command to run (only on redirect).
 * - `soft` — true = advisory banner; false = hard-block (exit 2).
 * - `reason` — human-readable explanation.
 */
export interface Directive {
  kind: 'redirect' | 'proceed'
  target?: 'spec' | 'plan'
  soft: boolean
  reason: string
}

// ── Intent classification ─────────────────────────────────────────────────

/**
 * Intents that trigger SDD artifact checks.
 *
 * Only `implementation` requires SDD artifact gating. Every other intent —
 * including all router IntentName values (`autonomous`, `explore`, `review`,
 * `debug`, `test`, `mcp`, `document`, `refactor`, `review-respond`, `install`,
 * `plan`, `spec`) and the spec's semantic intent groups (`meta`, `research`,
 * `debug`, `review`, `verify`, `tdd`) — proceeds without SDD checks.
 *
 * This is the SDD-over-application safety property: the 28-case phase matrix
 * test in tests/unit/intent/phase-matrix.test.ts enforces it.
 */
const IMPLEMENTATION_INTENTS = new Set(['implementation'])

// ── resolvePhaseDirective ─────────────────────────────────────────────────

/**
 * Resolve the phase directive for a given intent string and working directory.
 *
 * Reads `.anvil/state.json` to get the active feature_slug, then checks
 * artifact presence at `.anvil/specs/features/<slug>/`.
 *
 * The phase matrix:
 *
 * | Intent         | No feature | Spec? | Plan? | Action         |
 * |----------------|-----------|-------|-------|----------------|
 * | meta           | *         | *     | *     | proceed        |
 * | research       | *         | *     | *     | proceed        |
 * | debug          | *         | *     | *     | proceed        |
 * | review         | *         | *     | *     | proceed        |
 * | verify         | *         | *     | *     | proceed        |
 * | tdd            | *         | *     | *     | proceed        |
 * | implementation | null      | -     | -     | redirect:spec  |
 * | implementation | set       | no    | -     | redirect:spec  |
 * | implementation | set       | yes   | no    | redirect:plan  |
 * | implementation | set       | yes   | yes   | proceed        |
 *
 * Note: 'soft' is always true in Phase E (hard-block via workflow-guard exit 2
 * is a separate code path; the directive soft flag reflects config defaults).
 * Phase F will wire ANVIL_FORCE and --force CLI flags to flip soft to false.
 */
export async function resolvePhaseDirective(
  intent: string,
  cwd: string,
): Promise<Directive> {
  // Non-implementation intents always proceed — SDD-over-application safeguard
  if (!IMPLEMENTATION_INTENTS.has(intent)) {
    return {
      kind: 'proceed',
      soft: true,
      reason: `${intent} intent does not require SDD artifacts — proceeding directly`,
    }
  }

  // Implementation intent: check artifact state
  let featureSlug: string | undefined

  try {
    const state = await readState(cwd)
    featureSlug = state.feature_slug
  } catch {
    // If state is unreadable, treat as no active feature
    featureSlug = undefined
  }

  // No active feature → redirect to /sdd-workflow
  if (!featureSlug) {
    return {
      kind: 'redirect',
      target: 'spec',
      soft: true,
      reason:
        'No active feature found in .anvil/state.json. Invoke /sdd-workflow <feature-name> to create the spec first.',
    }
  }

  // Active feature: check spec.md presence
  const specFilePath = join(cwd, specPath(featureSlug))
  const hasSpec = existsSync(specFilePath)

  if (!hasSpec) {
    return {
      kind: 'redirect',
      target: 'spec',
      soft: true,
      reason: `spec.md not found for feature "${featureSlug}". Invoke /sdd-workflow ${featureSlug} to create the spec first.`,
    }
  }

  // Spec present: check plan.md presence
  const planFilePath = join(cwd, planPath(featureSlug))
  const hasPlan = existsSync(planFilePath)

  if (!hasPlan) {
    return {
      kind: 'redirect',
      target: 'plan',
      soft: true,
      reason: `plan.md not found for feature "${featureSlug}". Run \`anvil plan --feature ${featureSlug}\` to create the plan from the spec.`,
    }
  }

  // Both artifacts present — proceed
  return {
    kind: 'proceed',
    soft: true,
    reason: `Feature "${featureSlug}" has spec.md and plan.md — SDD prerequisites satisfied`,
  }
}
