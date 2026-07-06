/**
 * Statusline payload for the plan-runner (ANV-0025 Wave 4).
 *
 * Layer 0 (core). Pure schema + builder; no I/O.
 *
 * Purpose: define the shape of the structured object the runner emits
 * for ANV-0023's statusline pipeline to consume. ANV-0023 has not
 * shipped yet (in flight); shipping the payload first lets that ticket
 * pick it up without coordinating a schema change in the same release.
 *
 * Payload shape:
 *   {
 *     planRun: {
 *       runId: string;
 *       planVersion: string;
 *       status: 'pending' | 'in_progress' | 'awaiting_gate' | 'completed' | 'aborted';
 *       currentPhaseId?: string;
 *       currentTaskId?: string;
 *       updatedAt?: string;
 *     }
 *   }
 *
 * Consumers MUST treat unknown keys as additive (schema is
 * `.passthrough()` so ANV-0023 can extend without breaking us).
 */

import { z } from 'zod'
import type { PlanRunState } from '../run-state.js'
import { PlanRunStatus } from '../run-state.js'

// ─── Schema ──────────────────────────────────────────────────────────────────

export const PlanRunStatuslinePayload = z
  .object({
    planRun: z
      .object({
        runId: z.string().min(1),
        planVersion: z.string().min(1),
        status: PlanRunStatus,
        currentPhaseId: z.string().optional(),
        currentTaskId: z.string().optional(),
        updatedAt: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough()

export type PlanRunStatuslinePayload = z.infer<typeof PlanRunStatuslinePayload>

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Project a `PlanRunState` into the statusline payload shape. Pure.
 *
 * Drops fields that have no value (status is always present; phase/task
 * IDs and timestamps only ride when set).
 */
export function buildStatuslinePayload(
  state: PlanRunState,
): PlanRunStatuslinePayload {
  return {
    planRun: {
      runId: state.runId,
      planVersion: state.planVersion,
      status: state.status,
      ...(state.currentPhaseId !== undefined
        ? { currentPhaseId: state.currentPhaseId }
        : {}),
      ...(state.currentTaskId !== undefined
        ? { currentTaskId: state.currentTaskId }
        : {}),
      ...(state.updatedAt !== undefined ? { updatedAt: state.updatedAt } : {}),
    },
  }
}
