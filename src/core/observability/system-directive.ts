/**
 * Typed observability directive vocabulary — ANV-0023.
 *
 * Layer 0 (core). Pure schema + builder; no I/O.
 *
 * Purpose: a discriminated union of typed events emitted by Anvil's
 * observability hooks (PreCompact / PostCompact / InstructionsLoaded)
 * and consumed by the statusline payload pipeline. Each event carries
 * a typed payload + severity so renderers can prioritise the
 * highest-severity directive when surfacing context-pressure signals
 * to the user.
 *
 * This is the structured-event counterpart to `src/core/types.ts §
 * SystemDirectiveType` — that enum tags model-visible systemInsert
 * strings for dedupe; this module models *user-visible* observability
 * events with full typed payloads. The two vocabularies are
 * intentionally separate: one targets the model, the other targets
 * the user / statusline.
 */

import { z } from 'zod'

// ─── Severity ───────────────────────────────────────────────────────────────

export const ObservabilitySeverity = z.enum(['info', 'warn', 'critical'])
export type ObservabilitySeverity = z.infer<typeof ObservabilitySeverity>

const SEVERITY_RANK: Record<ObservabilitySeverity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
}

/**
 * Compare two severities — returns positive when `a` outranks `b`.
 * Used by renderers to pick the highest-severity directive when
 * multiple are present.
 */
export function compareSeverity(
  a: ObservabilitySeverity,
  b: ObservabilitySeverity,
): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b]
}

// ─── Per-kind payload schemas ───────────────────────────────────────────────

const ContextRiskHighPayload = z.object({
  /** Estimated context usage percentage (0–100). */
  usedPercent: z.number().min(0).max(100),
  /** Total input tokens currently consumed, if known. */
  totalInputTokens: z.number().int().nonnegative().optional(),
  /** Configured context window size in tokens, if known. */
  contextWindowSize: z.number().int().positive().optional(),
})

const CompactionImminentPayload = z.object({
  /** Bytes about to be discarded by compaction. */
  preCompactBytes: z.number().int().nonnegative(),
  /** Rule files captured in the pre-compact snapshot. */
  capturedRuleCount: z.number().int().nonnegative(),
  /** Path the snapshot was written to. */
  snapshotPath: z.string(),
})

const DegradationDetectedPayload = z.object({
  /** Rule count seen at InstructionsLoaded time (pre-compact baseline). */
  baselineRuleCount: z.number().int().nonnegative(),
  /** Rule count observed post-compact. */
  observedRuleCount: z.number().int().nonnegative(),
  /** Names of rules present in the baseline but absent post-compact. */
  lostRules: z.array(z.string()),
  /** Snapshot path used for the comparison, if any. */
  snapshotPath: z.string().optional(),
})

const VerificationPendingPayload = z.object({
  /** What needs verification (e.g. "gate", "tests", "typecheck"). */
  target: z.string().min(1),
  /** Why verification is pending (free-form, ≤200 chars). */
  reason: z.string().max(200),
})

const GateRequiredPayload = z.object({
  /** Identifier of the gate that must run (e.g. "pre-push", "pre-commit"). */
  gate: z.string().min(1),
})

const PlanRunActivePayload = z.object({
  runId: z.string().min(1),
  status: z.string().min(1),
  currentPhaseId: z.string().optional(),
  currentTaskId: z.string().optional(),
})

const InstructionsLoadedPayload = z.object({
  /** Total bytes loaded across all rule sources. */
  totalBytes: z.number().int().nonnegative(),
  /** Number of rule files / sources loaded. */
  ruleCount: z.number().int().nonnegative(),
  /** Names of rule sources (e.g. "AGENTS.md", "rules/anvil-routing.md"). */
  sourceNames: z.array(z.string()),
})

// ─── Discriminated union ────────────────────────────────────────────────────

/**
 * Severity defaults per kind. Critical when the directive should
 * dominate display priority; warn for actionable but non-blocking
 * signals; info for advisory events.
 */
export const DIRECTIVE_DEFAULT_SEVERITY = {
  'context-risk-high': 'warn',
  'compaction-imminent': 'critical',
  'degradation-detected': 'critical',
  'verification-pending': 'warn',
  'gate-required': 'warn',
  'plan-run-active': 'info',
  'instructions-loaded': 'info',
} as const satisfies Record<string, ObservabilitySeverity>

/** Union of all observability directive kinds. */
export const ObservabilityDirectiveKind = z.enum([
  'context-risk-high',
  'compaction-imminent',
  'degradation-detected',
  'verification-pending',
  'gate-required',
  'plan-run-active',
  'instructions-loaded',
])
export type ObservabilityDirectiveKind = z.infer<
  typeof ObservabilityDirectiveKind
>

const directiveBase = z.object({
  severity: ObservabilitySeverity,
  /** ISO 8601 timestamp the directive was emitted. */
  emittedAt: z.string().min(1),
})

export const ObservabilityDirective = z.discriminatedUnion('kind', [
  directiveBase.extend({
    kind: z.literal('context-risk-high'),
    payload: ContextRiskHighPayload,
  }),
  directiveBase.extend({
    kind: z.literal('compaction-imminent'),
    payload: CompactionImminentPayload,
  }),
  directiveBase.extend({
    kind: z.literal('degradation-detected'),
    payload: DegradationDetectedPayload,
  }),
  directiveBase.extend({
    kind: z.literal('verification-pending'),
    payload: VerificationPendingPayload,
  }),
  directiveBase.extend({
    kind: z.literal('gate-required'),
    payload: GateRequiredPayload,
  }),
  directiveBase.extend({
    kind: z.literal('plan-run-active'),
    payload: PlanRunActivePayload,
  }),
  directiveBase.extend({
    kind: z.literal('instructions-loaded'),
    payload: InstructionsLoadedPayload,
  }),
])
export type ObservabilityDirective = z.infer<typeof ObservabilityDirective>

// ─── Builders ───────────────────────────────────────────────────────────────

/**
 * Pure builder that constructs a typed directive with the default
 * severity for its kind. Severity may be overridden by passing
 * `severity` in the second argument.
 *
 * The result is Zod-validated before return; invalid payloads throw.
 */
type DirectivePayload<K extends ObservabilityDirectiveKind> = Extract<
  ObservabilityDirective,
  { kind: K }
>['payload']

export function buildDirective<K extends ObservabilityDirectiveKind>(
  kind: K,
  payload: DirectivePayload<K>,
  opts: { severity?: ObservabilitySeverity; emittedAt?: string } = {},
): ObservabilityDirective {
  const severity = opts.severity ?? DIRECTIVE_DEFAULT_SEVERITY[kind]
  const emittedAt = opts.emittedAt ?? new Date().toISOString()
  // Cast through unknown — discriminated-union narrowing in TS doesn't
  // line up cleanly with the generic K, but Zod parse below catches
  // any mismatch.
  const raw = { kind, payload, severity, emittedAt } as unknown
  return ObservabilityDirective.parse(raw)
}

/**
 * Pick the highest-severity directive from a list. Returns `undefined`
 * for an empty list. Ties broken by first-emitted (input order).
 */
export function highestSeverity(
  directives: ObservabilityDirective[],
): ObservabilityDirective | undefined {
  if (directives.length === 0) return undefined
  let winner = directives[0]
  if (!winner) return undefined
  for (let i = 1; i < directives.length; i++) {
    const candidate = directives[i]
    if (!candidate) continue
    if (compareSeverity(candidate.severity, winner.severity) > 0) {
      winner = candidate
    }
  }
  return winner
}
