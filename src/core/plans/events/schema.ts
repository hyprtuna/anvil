/**
 * Plan-runner event schema (ANV-0025 Wave 3).
 *
 * Layer 0 (core) — pure Zod schemas, no I/O.
 *
 * Defines the discriminated union of events the plan-runner journal records.
 * The journal is an append-only JSONL file at `runs/<runId>/events.jsonl`.
 * State at any point is computed by replaying the journal (see
 * `../run-state.ts:replayState`).
 *
 * Scope of this module:
 *   - Define Zod schemas for each event kind.
 *   - Provide the `PlanRunEvent` discriminated union and inferred type.
 *
 * Out of scope:
 *   - Writing the journal (`../recorder.ts`).
 *   - Replaying events into a state shape (`../run-state.ts`).
 *   - The runner state machine that *emits* these events — that is Wave 4.
 *
 * Design notes:
 *   - Every event carries `runId`, `planVersion`, `timestamp`, and
 *     `requestHash`. The `requestHash` is the idempotency key — the recorder
 *     no-ops on duplicates.
 *   - `kind` is the discriminator (Zod `discriminatedUnion`).
 *   - Identifiers for tasks / phases / gates ride in the payload-shaped
 *     fields (`taskId`, `phaseId`, `gateId`) so consumers can branch
 *     without re-narrowing.
 *   - All timestamps are ISO-8601 strings — easy to grep, no timezone gotchas.
 */

import { z } from 'zod'
import { TaskIdPattern } from '../schema.js'

// ─── Primitive sub-schemas ───────────────────────────────────────────────────

/**
 * Run ID — opaque token assigned at run-bootstrap.
 *
 * Loose pattern: 1-128 chars of `[A-Za-z0-9._-]`. Lets callers use ULIDs,
 * UUIDs, monotonic counters, or human-readable slugs interchangeably.
 */
export const RunIdPattern = /^[A-Za-z0-9._-]{1,128}$/
const RunId = z
  .string()
  .regex(RunIdPattern, 'runId must match /^[A-Za-z0-9._-]{1,128}$/')

/**
 * Phase ID — kebab/snake/dot tokens. Phases are coarser than tasks (a phase
 * may bundle a wave's worth of tasks). Loose by design: the runner that
 * authors phases (Wave 4) gets to choose the naming convention.
 */
export const PhaseIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const PhaseId = z
  .string()
  .regex(
    PhaseIdPattern,
    'phaseId must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/',
  )

/** Gate ID — same shape as phase ID; gates are first-class checkpoints. */
const GateId = z
  .string()
  .regex(
    PhaseIdPattern,
    'gateId must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/',
  )

/** Task ID — reuses the executable-plan task convention (e.g. `A1`, `C3.1`). */
const TaskId = z
  .string()
  .regex(TaskIdPattern, 'taskId must match /^[A-Z]\\d+(?:\\.\\d+)?$/')

/**
 * Plan version — loose mirror of `ExecutablePlan.version`. We do not re-run
 * the strict semver pattern here because (a) the version is copied from
 * the plan snapshot the runner already validated, and (b) events MAY
 * outlive a strict-pattern change in a future schema version.
 */
const PlanVersion = z.string().min(1, 'planVersion must be non-empty')

/** ISO-8601 timestamp string. We accept any non-empty string and parse downstream. */
const Timestamp = z
  .string()
  .min(1, 'timestamp must be non-empty')
  .refine(
    (s) => !Number.isNaN(Date.parse(s)),
    'timestamp must be ISO-8601 parseable',
  )

/**
 * Idempotency hash. Caller-supplied; treated as opaque by the recorder.
 * 1-128 chars of `[A-Za-z0-9._-]`.
 */
const RequestHash = z
  .string()
  .regex(
    /^[A-Za-z0-9._-]{1,128}$/,
    'requestHash must match /^[A-Za-z0-9._-]{1,128}$/',
  )

// ─── Common envelope ─────────────────────────────────────────────────────────

/**
 * Fields present on every event. Each event schema spreads this in below.
 * Kept as a plain object literal (not a Zod schema) so each event's
 * discriminated `kind` literal stays the first key — easier to read in JSON.
 */
const envelope = {
  timestamp: Timestamp,
  runId: RunId,
  planVersion: PlanVersion,
  requestHash: RequestHash,
} as const

// ─── Per-kind event schemas ──────────────────────────────────────────────────

/** Run lifecycle has begun. Emitted exactly once at bootstrap. */
export const PlanRunStartedEvent = z.object({
  kind: z.literal('plan_run_started'),
  ...envelope,
})
export type PlanRunStartedEvent = z.infer<typeof PlanRunStartedEvent>

/** A phase boundary opens. Carries the phase ID and the task IDs it bundles. */
export const PhaseStartedEvent = z.object({
  kind: z.literal('phase_started'),
  ...envelope,
  phaseId: PhaseId,
  /** Tasks the phase will dispatch (informational; runner-authored). */
  taskIds: z.array(TaskId).default([]),
})
export type PhaseStartedEvent = z.infer<typeof PhaseStartedEvent>

/** A phase boundary closes. */
export const PhaseCompletedEvent = z.object({
  kind: z.literal('phase_completed'),
  ...envelope,
  phaseId: PhaseId,
  /** Outcome — informational; the runner (Wave 4) authors policy. */
  outcome: z.enum(['success', 'partial', 'failed']).default('success'),
})
export type PhaseCompletedEvent = z.infer<typeof PhaseCompletedEvent>

/** A single task has been dispatched. */
export const TaskStartedEvent = z.object({
  kind: z.literal('task_started'),
  ...envelope,
  taskId: TaskId,
  phaseId: PhaseId.optional(),
  /**
   * Attempt counter for retry-once classification (Wave 4 will populate
   * this on the second attempt). Starts at 1.
   */
  attempt: z.number().int().positive().default(1),
})
export type TaskStartedEvent = z.infer<typeof TaskStartedEvent>

/** A task finished — success, failure, or skipped. */
export const TaskCompletedEvent = z.object({
  kind: z.literal('task_completed'),
  ...envelope,
  taskId: TaskId,
  phaseId: PhaseId.optional(),
  attempt: z.number().int().positive().default(1),
  outcome: z.enum(['success', 'failed', 'skipped']),
  /** Optional structured error captured when outcome === 'failed'. */
  error: z
    .object({
      message: z.string().min(1),
      /** Optional classification tag (e.g. `flaky`, `infra`, `code`). Wave 4 owns the taxonomy. */
      classification: z.string().optional(),
    })
    .optional(),
})
export type TaskCompletedEvent = z.infer<typeof TaskCompletedEvent>

/** A human-review gate has been requested; the run is paused. */
export const GateRequestedEvent = z.object({
  kind: z.literal('gate_requested'),
  ...envelope,
  gateId: GateId,
  phaseId: PhaseId.optional(),
  /** Human-readable prompt rendered to the reviewer. */
  prompt: z.string().min(1),
})
export type GateRequestedEvent = z.infer<typeof GateRequestedEvent>

/** A human reviewer has resolved a gate. */
export const GateApprovedEvent = z.object({
  kind: z.literal('gate_approved'),
  ...envelope,
  gateId: GateId,
  /**
   * Resolution — explicit. `approved` releases the gate; `rejected` aborts
   * the run; `deferred` leaves the run in `awaiting_gate`.
   */
  decision: z.enum(['approved', 'rejected', 'deferred']),
  /** Reviewer identifier — free-form (email, username, "anon"). */
  reviewer: z.string().min(1),
  /** Optional comment captured at decision time. */
  comment: z.string().optional(),
})
export type GateApprovedEvent = z.infer<typeof GateApprovedEvent>

/** Evidence (log, artifact, transcript) was attached to a task or phase. */
export const EvidenceAttachedEvent = z.object({
  kind: z.literal('evidence_attached'),
  ...envelope,
  /** What this evidence is *for*. At least one of taskId / phaseId / gateId. */
  taskId: TaskId.optional(),
  phaseId: PhaseId.optional(),
  gateId: GateId.optional(),
  /** Free-form evidence kind tag (`log`, `transcript`, `screenshot`, ...). */
  evidenceKind: z.string().min(1),
  /** Path relative to the run directory, OR a URI. */
  location: z.string().min(1),
  /** Optional one-line human summary. */
  summary: z.string().optional(),
})
export type EvidenceAttachedEvent = z.infer<typeof EvidenceAttachedEvent>

/** Run completed successfully (every phase closed, no abort). */
export const PlanRunCompletedEvent = z.object({
  kind: z.literal('plan_run_completed'),
  ...envelope,
})
export type PlanRunCompletedEvent = z.infer<typeof PlanRunCompletedEvent>

/** Run aborted — gate rejection, hard failure, or operator interruption. */
export const PlanRunAbortedEvent = z.object({
  kind: z.literal('plan_run_aborted'),
  ...envelope,
  reason: z.string().min(1),
})
export type PlanRunAbortedEvent = z.infer<typeof PlanRunAbortedEvent>

// ─── Discriminated union ─────────────────────────────────────────────────────

/**
 * The full set of events the journal accepts.
 *
 * Why discriminated union (not z.union):
 *   - Cheap to validate (Zod can index on `kind`).
 *   - Type-narrowing in consumers is automatic on `ev.kind`.
 *   - New event kinds are additive — adding a member never breaks
 *     existing exhaustive switches *until* the consumer adds the case.
 */
export const PlanRunEvent = z.discriminatedUnion('kind', [
  PlanRunStartedEvent,
  PhaseStartedEvent,
  PhaseCompletedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  GateRequestedEvent,
  GateApprovedEvent,
  EvidenceAttachedEvent,
  PlanRunCompletedEvent,
  PlanRunAbortedEvent,
])
export type PlanRunEvent = z.infer<typeof PlanRunEvent>

/** String-union of every accepted `kind`. Useful for exhaustiveness checks. */
export type PlanRunEventKind = PlanRunEvent['kind']

/** Tuple literal of every accepted `kind` (mirror of the union above). */
export const PLAN_RUN_EVENT_KINDS: readonly PlanRunEventKind[] = [
  'plan_run_started',
  'phase_started',
  'phase_completed',
  'task_started',
  'task_completed',
  'gate_requested',
  'gate_approved',
  'evidence_attached',
  'plan_run_completed',
  'plan_run_aborted',
] as const
