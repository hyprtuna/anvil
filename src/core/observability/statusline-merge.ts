/**
 * Statusline payload merge + rendering — ANV-0023.
 *
 * Layer 0 (core). Pure helpers; no I/O.
 *
 * The ANV-0025 plan-runner emits a `PlanRunStatuslinePayload` via
 * `buildStatuslinePayload(state)`. That payload uses `.passthrough()`
 * so additional sub-objects can ride alongside `planRun` without
 * breaking Wave-4 consumers.
 *
 * This module:
 *   1. `mergeStatuslinePayload(...)` — merges an ObservabilityPayload
 *      into the existing PlanRunStatuslinePayload, preserving every
 *      pre-existing key (passthrough boundary).
 *   2. `renderDirective(d)` — produces the compact `[ctx 78%]`-style
 *      string for a single directive. Highest-severity wins display
 *      priority (see `pickDirective`).
 */

import type { PlanRunStatuslinePayload } from '../plans/runner/statusline-payload.js'
import type { ObservabilityPayload } from './observability-payload.js'
import {
  type ObservabilityDirective,
  highestSeverity,
} from './system-directive.js'

/**
 * Merged shape consumed by the statusline renderer. Identical to
 * PlanRunStatuslinePayload at the type level (passthrough) plus an
 * `observability` sub-object — but the static shape is widened.
 */
export interface MergedStatuslinePayload extends PlanRunStatuslinePayload {
  observability?: ObservabilityPayload
}

/**
 * Merge an observability payload onto a plan-run payload. Non-mutating;
 * returns a fresh object. Both inputs are passthrough-shaped so
 * extra unknown keys survive the round trip.
 */
export function mergeStatuslinePayload(
  base: PlanRunStatuslinePayload,
  observability?: ObservabilityPayload,
): MergedStatuslinePayload {
  if (observability === undefined) return { ...base }
  return { ...base, observability }
}

/**
 * Pick the directive the statusline should render. Highest severity
 * wins; ties broken by emission order.
 */
export function pickDirective(
  directives: ObservabilityDirective[],
): ObservabilityDirective | undefined {
  return highestSeverity(directives)
}

/**
 * Render a directive into a compact statusline fragment.
 *
 * Examples:
 *   context-risk-high      → `[ctx 78%]`
 *   compaction-imminent    → `[compacting 12.3KB]`
 *   degradation-detected   → `[rules lost: 2]`
 *   verification-pending   → `[verify: tests]`
 *   gate-required          → `[gate: pre-push]`
 *   plan-run-active        → `[plan: in_progress]`
 *   instructions-loaded    → `[rules: 3]`
 *
 * Pure function — no colour codes or ANSI; consumers wrap with their
 * own styling. Severity is exposed through the shape:
 *   { fragment: string; severity: ObservabilitySeverity }
 */
export interface RenderedDirective {
  fragment: string
  severity: ObservabilityDirective['severity']
}

export function renderDirective(d: ObservabilityDirective): RenderedDirective {
  let fragment: string
  switch (d.kind) {
    case 'context-risk-high':
      fragment = `[ctx ${Math.round(d.payload.usedPercent)}%]`
      break
    case 'compaction-imminent': {
      const kb = (d.payload.preCompactBytes / 1024).toFixed(1)
      fragment = `[compacting ${kb}KB]`
      break
    }
    case 'degradation-detected':
      fragment = `[rules lost: ${d.payload.lostRules.length}]`
      break
    case 'verification-pending':
      fragment = `[verify: ${d.payload.target}]`
      break
    case 'gate-required':
      fragment = `[gate: ${d.payload.gate}]`
      break
    case 'plan-run-active':
      fragment = `[plan: ${d.payload.status}]`
      break
    case 'instructions-loaded':
      fragment = `[rules: ${d.payload.ruleCount}]`
      break
  }
  return { fragment, severity: d.severity }
}
