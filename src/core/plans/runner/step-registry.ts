/**
 * Plan-runner step registry (ANV-0025 Wave 4).
 *
 * Layer 0 (core). Pure data + step contracts; no I/O.
 *
 * The runner consults a
 * `STEP_REGISTRY` keyed by task `type_key`. Each entry is a `StepBase`
 * subclass implementing `execute(ctx) → StepResult`. Most types share
 * `DefaultExecutorStep`, which (when `--auto` is set) delegates to a
 * caller-supplied `dispatch` function and otherwise returns a non-dispatched
 * success — useful as a state-tracker before autonomous execution is trusted.
 *
 * Scope of this module:
 *   - `StepBase` interface + `StepContext` / `StepResult` shapes.
 *   - `DefaultExecutorStep` (the common implementation).
 *   - `STEP_REGISTRY: Map<PlanTaskType, StepBase>` — one entry per type.
 *
 * Out of scope:
 *   - The runner state machine itself (`runner.ts`).
 *   - Error classification (`classify.ts`).
 *   - Verify-blocks-advance enforcement (lives in the runner).
 */

import type { PlanTask, PlanTaskType } from '../schema.js'
import { PlanTaskType as PlanTaskTypeSchema } from '../schema.js'

// ─── Public types ────────────────────────────────────────────────────────────

/** Input to a step's `execute()` call. */
export interface StepContext {
  /** The task this step is being asked to handle. */
  task: PlanTask
  /** When false, the runner is in state-tracker mode (no dispatch). */
  auto: boolean
  /**
   * Caller-supplied dispatcher. When `auto: true` and a dispatcher is
   * present, `DefaultExecutorStep` calls it and propagates the outcome.
   * Absent dispatch returns a non-dispatched success.
   */
  dispatch?: StepDispatcher
}

/** Function the runner injects to delegate to a real Task() call. */
export type StepDispatcher = (input: {
  task: PlanTask
}) => Promise<{
  outcome: 'success' | 'failed' | 'skipped'
  error?: { message: string; classification?: string }
}>

/** Outcome of `step.execute()`. */
export interface StepResult {
  outcome: 'success' | 'failed' | 'skipped'
  /** True iff a real dispatch was attempted (vs. tracker-mode no-op). */
  dispatched: boolean
  error?: { message: string; classification?: string }
}

/** Base contract every concrete step must satisfy. */
export interface StepBase {
  readonly type_key: PlanTaskType
  execute(ctx: StepContext): Promise<StepResult>
}

// ─── Concrete default implementation ─────────────────────────────────────────

/**
 * The common step implementation.
 *
 *   - `auto: false` (default) → record state transitions only;
 *     resolve with `outcome: 'success', dispatched: false`. Lets the
 *     runner serve as a state-tracker before autonomous dispatch is
 *     trusted.
 *   - `auto: true` + no dispatcher → same as above (best-effort no-op).
 *   - `auto: true` + dispatcher → call the dispatcher; propagate outcome.
 */
export class DefaultExecutorStep implements StepBase {
  readonly type_key: PlanTaskType

  constructor(typeKey: PlanTaskType) {
    this.type_key = typeKey
  }

  async execute(ctx: StepContext): Promise<StepResult> {
    if (!ctx.auto || ctx.dispatch === undefined) {
      return { outcome: 'success', dispatched: false }
    }
    const dispatched = await ctx.dispatch({ task: ctx.task })
    return {
      outcome: dispatched.outcome,
      dispatched: true,
      ...(dispatched.error !== undefined ? { error: dispatched.error } : {}),
    }
  }
}

// ─── Registry (validated at module load) ─────────────────────────────────────

/**
 * Map every `PlanTaskType` to a concrete step.
 *
 * Today every task type uses `DefaultExecutorStep`. Specialised subclasses
 * (e.g. an integration-test runner that streams stdout) can be added by
 * subclassing `DefaultExecutorStep` and overriding `execute`. The Zod
 * `PlanTaskType` enum is the source of truth — we eagerly check at module
 * load that every member is registered. A missing key throws synchronously
 * at import time so consumers fail fast.
 */
export const STEP_REGISTRY: Map<PlanTaskType, StepBase> = buildRegistry()

function buildRegistry(): Map<PlanTaskType, StepBase> {
  const map = new Map<PlanTaskType, StepBase>()
  for (const typeKey of PlanTaskTypeSchema.options) {
    map.set(typeKey, new DefaultExecutorStep(typeKey))
  }
  // Eager invariant: every type in the schema is keyed in the registry.
  for (const typeKey of PlanTaskTypeSchema.options) {
    if (!map.has(typeKey)) {
      throw new Error(
        `STEP_REGISTRY missing entry for task type "${typeKey}" — this is a Wave-4 schema gap`,
      )
    }
  }
  return map
}
