/**
 * Plan-run state shape + pure replay function (ANV-0025 Wave 3).
 *
 * Layer 0 (core) — pure data + pure reducer. No I/O.
 *
 * Persistence model:
 *   - The plan is snapshotted once at run-bootstrap into `<runDir>/plan.yml`
 *     so resume works even after the source plan is deleted.
 *   - The journal (`<runDir>/events.jsonl`) is the source of truth for
 *     run progress. State at any moment is computable by replaying the
 *     journal against the snapshot.
 *   - An optional `<runDir>/state.yml` snapshot may be written for fast
 *     status reads (avoids replaying the whole journal). The journal is
 *     authoritative when the two disagree.
 *
 * Scope of this module:
 *   - The `PlanRunState` data shape + Zod schema.
 *   - The `replayState(plan, events)` pure reducer.
 *
 * Out of scope (Wave 4):
 *   - The runner state machine that *emits* events.
 *   - Persistence/serialisation to disk (bootstrap helpers live alongside).
 *
 * Reducer semantics:
 *   - `plan_run_started`     → status: 'in_progress', startedAt set.
 *   - `phase_started`        → currentPhaseId set; status stays in_progress.
 *   - `phase_completed`      → currentPhaseId cleared; status stays in_progress.
 *   - `task_started`         → currentTaskId set.
 *   - `task_completed`       → currentTaskId cleared (regardless of outcome —
 *                              the runner is what decides on retry).
 *   - `gate_requested`       → status: 'awaiting_gate'.
 *   - `gate_approved`:
 *       - decision='approved' → status: 'in_progress'.
 *       - decision='rejected' → status: 'aborted'.
 *       - decision='deferred' → status stays 'awaiting_gate'.
 *   - `evidence_attached`    → no state change (informational).
 *   - `plan_run_completed`   → status: 'completed', completedAt set.
 *   - `plan_run_aborted`     → status: 'aborted', completedAt set.
 *
 * Every event also bumps `updatedAt` to its timestamp.
 */

import { z } from 'zod'
import type { PlanRunEvent } from './events/schema.js'
import type { ExecutablePlan } from './schema.js'
import { ExecutablePlan as ExecutablePlanSchema } from './schema.js'

// ─── Status enum ─────────────────────────────────────────────────────────────

export const PlanRunStatus = z.enum([
  'pending',
  'in_progress',
  'awaiting_gate',
  'completed',
  'aborted',
])
export type PlanRunStatus = z.infer<typeof PlanRunStatus>

// ─── PlanRunState ────────────────────────────────────────────────────────────

/**
 * Persistent state for a single plan run.
 *
 * `planSnapshot` is the verbatim copy of the plan as it existed at
 * run-bootstrap. The replay reducer treats it as read-only.
 */
export const PlanRunState = z.object({
  runId: z.string().min(1),
  planVersion: z.string().min(1),
  status: PlanRunStatus,
  /** ID of the currently-active phase, when one is open. */
  currentPhaseId: z.string().optional(),
  /** ID of the currently-running task, when one is in flight. */
  currentTaskId: z.string().optional(),
  /** ISO timestamp of run start (set on `plan_run_started`). */
  startedAt: z.string().optional(),
  /** ISO timestamp of the last event applied. */
  updatedAt: z.string().optional(),
  /** ISO timestamp of run completion or abort. */
  completedAt: z.string().optional(),
  /** Verbatim copy of the plan as captured at bootstrap. */
  planSnapshot: ExecutablePlanSchema,
})
export type PlanRunState = z.infer<typeof PlanRunState>

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Build a base "pending" state for a plan snapshot. Useful as the seed
 * argument to `replayState` and as the bootstrap initial state.
 */
export function initialRunState(
  runId: string,
  plan: ExecutablePlan,
): PlanRunState {
  return {
    runId,
    planVersion: plan.version,
    status: 'pending',
    planSnapshot: plan,
  }
}

/**
 * Apply every event in order to the seed state. Pure function — does not
 * read or write disk. Returns a new state object; never mutates input.
 *
 * The reducer is deliberately permissive about event ordering — it
 * applies transitions one at a time. The runner (Wave 4) is responsible
 * for *only emitting* legal transitions; the reducer just bookkeeps.
 */
export function replayState(
  plan: ExecutablePlan,
  events: readonly PlanRunEvent[],
  opts: { runId?: string } = {},
): PlanRunState {
  // Seed runId from the first event if the caller didn't pin one.
  const seedRunId = opts.runId ?? events[0]?.runId ?? ''
  let state: PlanRunState = initialRunState(seedRunId, plan)

  for (const ev of events) {
    state = applyEvent(state, ev)
  }
  return state
}

/**
 * Apply a single event to a state snapshot, returning the next state.
 * Exported for callers that want to drive the reducer incrementally.
 */
export function applyEvent(
  prev: PlanRunState,
  event: PlanRunEvent,
): PlanRunState {
  // Always bump updatedAt to the event timestamp.
  const base: PlanRunState = { ...prev, updatedAt: event.timestamp }

  switch (event.kind) {
    case 'plan_run_started':
      return {
        ...base,
        status: 'in_progress',
        startedAt: base.startedAt ?? event.timestamp,
      }

    case 'phase_started':
      return { ...base, currentPhaseId: event.phaseId }

    case 'phase_completed':
      // Only clear if it matches; an out-of-order completion is ignored
      // for the `currentPhaseId` slot but still bumps updatedAt.
      if (base.currentPhaseId === event.phaseId) {
        const next = { ...base }
        next.currentPhaseId = undefined
        return next
      }
      return base

    case 'task_started':
      return { ...base, currentTaskId: event.taskId }

    case 'task_completed':
      if (base.currentTaskId === event.taskId) {
        const next = { ...base }
        next.currentTaskId = undefined
        return next
      }
      return base

    case 'gate_requested':
      return { ...base, status: 'awaiting_gate' }

    case 'gate_approved':
      switch (event.decision) {
        case 'approved':
          return { ...base, status: 'in_progress' }
        case 'rejected':
          return {
            ...base,
            status: 'aborted',
            completedAt: base.completedAt ?? event.timestamp,
          }
        case 'deferred':
          // Stay paused. No state change beyond updatedAt.
          return base
      }
      // exhaustive — silence non-exhaustive switch warning
      return base

    case 'evidence_attached':
      // Informational — already bumped updatedAt above.
      return base

    case 'plan_run_completed':
      return {
        ...base,
        status: 'completed',
        completedAt: base.completedAt ?? event.timestamp,
      }

    case 'plan_run_aborted':
      return {
        ...base,
        status: 'aborted',
        completedAt: base.completedAt ?? event.timestamp,
      }
  }
}
