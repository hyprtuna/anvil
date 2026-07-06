/**
 * Plan-runner state machine (ANV-0025 Wave 4).
 *
 * Layer 0 (core). Owns no fresh I/O of its own — delegates writes to the
 * Wave-3 recorder and reads via `readEvents` + `replayState`.
 *
 * What this module does:
 *   - Exposes a transition API the CLI / hook handlers call.
 *   - Emits exactly one event per transition with a stable, derived
 *     `requestHash` so repeated calls are no-ops (idempotency).
 *   - Re-reads the journal before each non-trivial transition to recover
 *     state after a crash-restart (the "re-query-after-step" pattern from
 *     GSD `phase-runner.ts:91-311`).
 *   - Enforces verify-blocks-advance: a task with a non-empty
 *     `verification` array cannot transition to `task_completed` until at
 *     least one `evidence_attached` event references it. (See
 *     `runner.completeTask`.)
 *   - Performs retry-once classification on task failures via
 *     `classifyError` (`classify.ts`).
 *
 * Out of scope (deliberately):
 *   - Walking the plan's waves; that's the CLI's job (`plan-run.ts`).
 *   - Spawning real Task() calls; the CLI passes a dispatcher to each
 *     step in the step registry.
 */

import { createHash } from 'node:crypto'
import type { PlanRunEvent } from '../events/schema.js'
import { type PlanRunRecorder, readEvents } from '../recorder.js'
import { type PlanRunState, replayState } from '../run-state.js'
import type { ExecutablePlan } from '../schema.js'
import {
  type ErrorClassification,
  type TaskFailureInfo,
  classifyError,
} from './classify.js'

// ─── Public types ────────────────────────────────────────────────────────────

/** Optional lifecycle callbacks the CLI can wire for logging / statusline. */
export interface RunnerHooks {
  onEvent?: (event: PlanRunEvent) => void | Promise<void>
  onStateChange?: (state: PlanRunState) => void | Promise<void>
}

export interface PlanRunner {
  readonly runId: string
  readonly planVersion: string
  startPhase(phaseId: string, taskIds?: string[]): Promise<void>
  completePhase(
    phaseId: string,
    outcome?: 'success' | 'partial' | 'failed',
  ): Promise<void>
  startTask(taskId: string, phaseId?: string): Promise<void>
  completeTask(
    taskId: string,
    result: {
      outcome: 'success' | 'failed' | 'skipped'
      error?: { message: string; classification?: string }
      phaseId?: string
    },
  ): Promise<TaskCompletionResult>
  requestGate(gateId: string, prompt: string, phaseId?: string): Promise<void>
  approveGate(
    gateId: string,
    opts: {
      decision: 'approved' | 'rejected' | 'deferred'
      reviewer: string
      comment?: string
    },
  ): Promise<void>
  attachEvidence(opts: {
    taskId?: string
    phaseId?: string
    gateId?: string
    evidenceKind: string
    location: string
    summary?: string
  }): Promise<void>
  completeRun(): Promise<void>
  abort(reason: string): Promise<void>
  currentState(): Promise<PlanRunState>
}

/** What `completeTask` returns. */
export interface TaskCompletionResult {
  /** What the runner did with the failure (or 'completed' on success). */
  action: 'completed' | 'retry-scheduled' | 'gate-requested' | 'blocked'
  /** Present when the action is gate-requested / retry-scheduled. */
  classification?: ErrorClassification
}

export interface CreatePlanRunnerOpts {
  recorder: PlanRunRecorder
  plan: ExecutablePlan
  runDir: string
  hooks?: RunnerHooks
  /** Clock injection for tests; defaults to `() => new Date()`. */
  now?: () => Date
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createPlanRunner(opts: CreatePlanRunnerOpts): PlanRunner {
  const { recorder, plan, runDir, hooks } = opts
  const now = opts.now ?? (() => new Date())
  const runId = recorder.runId
  const planVersion = recorder.planVersion

  // The journal is the source of truth for attempt counts; a process-restart
  // must recover the same numbering. `nextAttempt(taskId)` inspects the
  // journal: if a prior task_started exists for this task without a
  // matching task_completed, we re-emit the SAME attempt (the recorder
  // dedups). After a task_completed(failed), attempt = prior_max + 1.
  function ts(): string {
    return now().toISOString()
  }

  async function attemptForTask(taskId: string): Promise<number> {
    const events = await readEvents(runDir)
    let lastStarted = 0
    let lastCompleted = 0
    for (const ev of events) {
      if (ev.kind === 'task_started' && ev.taskId === taskId) {
        if (ev.attempt > lastStarted) lastStarted = ev.attempt
      } else if (ev.kind === 'task_completed' && ev.taskId === taskId) {
        if (ev.attempt > lastCompleted) lastCompleted = ev.attempt
      }
    }
    // If there's a started attempt without a matching completion, re-use it.
    if (lastStarted > lastCompleted) return lastStarted
    // Otherwise we're either starting fresh (lastStarted === 0) or starting
    // a new attempt after a completed one — both paths bump by 1.
    return lastStarted + 1
  }

  async function emit(event: PlanRunEvent): Promise<void> {
    await recorder.recordEvent(event)
    if (hooks?.onEvent) {
      await hooks.onEvent(event)
    }
    if (hooks?.onStateChange) {
      const state = await currentState()
      await hooks.onStateChange(state)
    }
  }

  async function currentState(): Promise<PlanRunState> {
    const events = await readEvents(runDir)
    return replayState(plan, events, { runId })
  }

  async function startPhase(
    phaseId: string,
    taskIds: string[] = [],
  ): Promise<void> {
    await emit({
      kind: 'phase_started',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.phase_started.${phaseId}`,
      phaseId,
      taskIds,
    })
  }

  async function completePhase(
    phaseId: string,
    outcome: 'success' | 'partial' | 'failed' = 'success',
  ): Promise<void> {
    await emit({
      kind: 'phase_completed',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.phase_completed.${phaseId}`,
      phaseId,
      outcome,
    })
  }

  async function startTask(taskId: string, phaseId?: string): Promise<void> {
    const attempt = await attemptForTask(taskId)
    await emit({
      kind: 'task_started',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.task_started.${taskId}.${attempt}`,
      taskId,
      ...(phaseId !== undefined ? { phaseId } : {}),
      attempt,
    })
  }

  async function completeTask(
    taskId: string,
    result: {
      outcome: 'success' | 'failed' | 'skipped'
      error?: { message: string; classification?: string }
      phaseId?: string
    },
  ): Promise<TaskCompletionResult> {
    // Verify-blocks-advance invariant: if the task declares verification
    // commands, at least one evidence_attached event must reference it
    // before we allow a `success` completion. (Failures are exempt — the
    // gate-or-retry path resolves them.)
    if (result.outcome === 'success') {
      const task = plan.tasks.find((t) => t.id === taskId)
      if (task !== undefined && task.verification.length > 0) {
        const events = await readEvents(runDir)
        const hasEvidence = events.some(
          (e) =>
            e.kind === 'evidence_attached' &&
            'taskId' in e &&
            e.taskId === taskId,
        )
        if (!hasEvidence) {
          throw new Error(
            `verify-blocks-advance: task "${taskId}" declares ${task.verification.length} verification command(s) but no evidence_attached event references it`,
          )
        }
      }
    }

    // Find the most recent task_started attempt for this task — that's
    // the one we're completing.
    const journalEvents = await readEvents(runDir)
    let attempt = 1
    for (const ev of journalEvents) {
      if (ev.kind === 'task_started' && ev.taskId === taskId) {
        if (ev.attempt > attempt) attempt = ev.attempt
      }
    }
    const completionEvent: PlanRunEvent = {
      kind: 'task_completed',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.task_completed.${taskId}.${attempt}`,
      taskId,
      ...(result.phaseId !== undefined ? { phaseId: result.phaseId } : {}),
      attempt,
      outcome: result.outcome,
      ...(result.error !== undefined ? { error: result.error } : {}),
    }
    await emit(completionEvent)

    if (result.outcome !== 'failed') {
      return { action: 'completed' }
    }

    // Failure path — classify and either retry, gate, or block.
    const failure: TaskFailureInfo = {
      taskId,
      attempt,
      error: result.error,
    }
    const classification = classifyError(failure)

    if (classification === 'transient' && attempt < 2) {
      // Retry-once: schedule another task_started with attempt+1.
      await startTask(taskId, result.phaseId)
      return { action: 'retry-scheduled', classification }
    }

    // Either deterministic, gate-required, or transient on attempt >= 2.
    // All three escalate to a gate request.
    await emit({
      kind: 'gate_requested',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.gate_requested.${taskId}.${attempt}`,
      gateId: `task-failure-${taskId}-${attempt}`,
      ...(result.phaseId !== undefined ? { phaseId: result.phaseId } : {}),
      prompt: `Task ${taskId} failed (attempt ${attempt}, classification: ${classification}): ${result.error?.message ?? 'unknown error'}`,
    })
    return { action: 'gate-requested', classification }
  }

  async function requestGate(
    gateId: string,
    prompt: string,
    phaseId?: string,
  ): Promise<void> {
    await emit({
      kind: 'gate_requested',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.gate_requested.${gateId}`,
      gateId,
      ...(phaseId !== undefined ? { phaseId } : {}),
      prompt,
    })
  }

  async function approveGate(
    gateId: string,
    opts: {
      decision: 'approved' | 'rejected' | 'deferred'
      reviewer: string
      comment?: string
    },
  ): Promise<void> {
    await emit({
      kind: 'gate_approved',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.gate_approved.${gateId}.${opts.decision}`,
      gateId,
      decision: opts.decision,
      reviewer: opts.reviewer,
      ...(opts.comment !== undefined ? { comment: opts.comment } : {}),
    })
  }

  async function attachEvidence(opts: {
    taskId?: string
    phaseId?: string
    gateId?: string
    evidenceKind: string
    location: string
    summary?: string
  }): Promise<void> {
    const anchorKey = opts.taskId ?? opts.phaseId ?? opts.gateId ?? 'run'
    // `location` may contain path separators that the requestHash regex
    // rejects ([A-Za-z0-9._-] only). Hash it so we keep a stable
    // idempotency key without leaking arbitrary characters.
    const locDigest = createHash('sha256')
      .update(opts.location)
      .digest('hex')
      .slice(0, 12)
    await emit({
      kind: 'evidence_attached',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.evidence.${anchorKey}.${opts.evidenceKind}.${locDigest}`,
      ...(opts.taskId !== undefined ? { taskId: opts.taskId } : {}),
      ...(opts.phaseId !== undefined ? { phaseId: opts.phaseId } : {}),
      ...(opts.gateId !== undefined ? { gateId: opts.gateId } : {}),
      evidenceKind: opts.evidenceKind,
      location: opts.location,
      ...(opts.summary !== undefined ? { summary: opts.summary } : {}),
    })
  }

  async function completeRun(): Promise<void> {
    await emit({
      kind: 'plan_run_completed',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.plan_run_completed`,
    })
  }

  async function abort(reason: string): Promise<void> {
    await emit({
      kind: 'plan_run_aborted',
      timestamp: ts(),
      runId,
      planVersion,
      requestHash: `${runId}.plan_run_aborted`,
      reason,
    })
  }

  return {
    runId,
    planVersion,
    startPhase,
    completePhase,
    startTask,
    completeTask,
    requestGate,
    approveGate,
    attachEvidence,
    completeRun,
    abort,
    currentState,
  }
}
