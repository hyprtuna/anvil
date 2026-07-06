/**
 * Unit tests for src/core/plans/run-state.ts (ANV-0025 Wave 3).
 *
 * Pure-reducer tests — drive `replayState` against representative event
 * sequences and assert the projected state. No I/O.
 */

import { describe, expect, it } from 'vitest'
import type { PlanRunEvent } from '../../../../src/core/plans/events/schema.js'
import {
  applyEvent,
  initialRunState,
  replayState,
} from '../../../../src/core/plans/run-state.js'
import type { ExecutablePlan } from '../../../../src/core/plans/schema.js'

// ─── Plan fixture ────────────────────────────────────────────────────────────

const plan: ExecutablePlan = {
  version: 'v0.14.0',
  theme: 'Test theme',
  waves: [{ id: 'wave-1', tasks: ['A1', 'A2'], parallelism: 'sequential' }],
  tasks: [
    {
      id: 'A1',
      title: 't1',
      type: 'feature',
      effort: 's',
      depends_on: [],
      write_scope: [],
      verification: [],
    },
    {
      id: 'A2',
      title: 't2',
      type: 'feature',
      effort: 's',
      depends_on: ['A1'],
      write_scope: [],
      verification: [],
    },
  ],
  exit_criteria: [],
}

// ─── Helper ──────────────────────────────────────────────────────────────────

let clock = 0
function ts(offsetSec = 0): string {
  clock = offsetSec === 0 ? clock + 1 : offsetSec
  // Use a 60-second base step so increments stay within minute boundaries
  return new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString()
}

function ev(
  partial: Partial<PlanRunEvent> & Pick<PlanRunEvent, 'kind'>,
): PlanRunEvent {
  return {
    timestamp: ts(),
    runId: 'run-1',
    planVersion: 'v0.14.0',
    requestHash: `req-${Math.random()}`,
    ...partial,
  } as PlanRunEvent
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('initialRunState', () => {
  it('returns a pending state with the snapshot embedded', () => {
    const s = initialRunState('run-1', plan)
    expect(s.status).toBe('pending')
    expect(s.runId).toBe('run-1')
    expect(s.planVersion).toBe('v0.14.0')
    expect(s.planSnapshot).toEqual(plan)
    expect(s.currentTaskId).toBeUndefined()
    expect(s.currentPhaseId).toBeUndefined()
  })
})

describe('replayState — happy path', () => {
  it('runs through start → phase → task → task complete → phase complete → done', () => {
    const events: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({
        kind: 'phase_started',
        phaseId: 'phase-1',
        taskIds: ['A1', 'A2'],
      } as PlanRunEvent),
      ev({ kind: 'task_started', taskId: 'A1', attempt: 1 } as PlanRunEvent),
      ev({
        kind: 'task_completed',
        taskId: 'A1',
        outcome: 'success',
        attempt: 1,
      } as PlanRunEvent),
      ev({ kind: 'task_started', taskId: 'A2', attempt: 1 } as PlanRunEvent),
      ev({
        kind: 'task_completed',
        taskId: 'A2',
        outcome: 'success',
        attempt: 1,
      } as PlanRunEvent),
      ev({ kind: 'phase_completed', phaseId: 'phase-1' } as PlanRunEvent),
      ev({ kind: 'plan_run_completed' }),
    ]
    const state = replayState(plan, events)
    expect(state.status).toBe('completed')
    expect(state.currentTaskId).toBeUndefined()
    expect(state.currentPhaseId).toBeUndefined()
    expect(state.startedAt).toBe(events[0]!.timestamp)
    expect(state.completedAt).toBe(events[events.length - 1]!.timestamp)
    expect(state.updatedAt).toBe(events[events.length - 1]!.timestamp)
  })
})

describe('replayState — gate flow', () => {
  it('gate_requested moves to awaiting_gate; approved resumes; deferred stays', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({
        kind: 'gate_requested',
        gateId: 'g1',
        prompt: 'review',
      } as PlanRunEvent),
    ]
    const paused = replayState(plan, evs)
    expect(paused.status).toBe('awaiting_gate')

    const deferred = applyEvent(
      paused,
      ev({
        kind: 'gate_approved',
        gateId: 'g1',
        decision: 'deferred',
        reviewer: 'alice',
      } as PlanRunEvent),
    )
    expect(deferred.status).toBe('awaiting_gate')

    const approved = applyEvent(
      paused,
      ev({
        kind: 'gate_approved',
        gateId: 'g1',
        decision: 'approved',
        reviewer: 'alice',
      } as PlanRunEvent),
    )
    expect(approved.status).toBe('in_progress')
  })

  it('rejected gate aborts the run', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({
        kind: 'gate_requested',
        gateId: 'g1',
        prompt: 'review',
      } as PlanRunEvent),
      ev({
        kind: 'gate_approved',
        gateId: 'g1',
        decision: 'rejected',
        reviewer: 'alice',
      } as PlanRunEvent),
    ]
    const state = replayState(plan, evs)
    expect(state.status).toBe('aborted')
    expect(state.completedAt).toBeDefined()
  })
})

describe('replayState — abort', () => {
  it('plan_run_aborted records reason in updatedAt and marks aborted', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({
        kind: 'plan_run_aborted',
        reason: 'operator cancel',
      } as PlanRunEvent),
    ]
    const state = replayState(plan, evs)
    expect(state.status).toBe('aborted')
    expect(state.completedAt).toBe(evs[1]!.timestamp)
  })
})

describe('replayState — task failure does NOT auto-abort', () => {
  it('task_completed with outcome=failed only clears currentTaskId; runner decides retry', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({ kind: 'task_started', taskId: 'A1', attempt: 1 } as PlanRunEvent),
      ev({
        kind: 'task_completed',
        taskId: 'A1',
        outcome: 'failed',
        attempt: 1,
        error: { message: 'broken' },
      } as PlanRunEvent),
    ]
    const state = replayState(plan, evs)
    expect(state.status).toBe('in_progress')
    expect(state.currentTaskId).toBeUndefined()
  })
})

describe('replayState — out-of-order resilience', () => {
  it('phase_completed for an unknown phase does not clear currentPhaseId', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({ kind: 'phase_started', phaseId: 'phase-1' } as PlanRunEvent),
      ev({ kind: 'phase_completed', phaseId: 'phase-other' } as PlanRunEvent),
    ]
    const state = replayState(plan, evs)
    expect(state.currentPhaseId).toBe('phase-1')
  })

  it('task_completed for a non-current task does not clear currentTaskId', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'task_started', taskId: 'A1' } as PlanRunEvent),
      ev({
        kind: 'task_completed',
        taskId: 'A2',
        outcome: 'success',
      } as PlanRunEvent),
    ]
    const state = replayState(plan, evs)
    expect(state.currentTaskId).toBe('A1')
  })
})

describe('replayState — evidence is a no-op for state', () => {
  it('evidence_attached only bumps updatedAt', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({
        kind: 'evidence_attached',
        taskId: 'A1',
        evidenceKind: 'log',
        location: 'a.log',
      } as PlanRunEvent),
    ]
    const state = replayState(plan, evs)
    expect(state.status).toBe('in_progress')
    expect(state.updatedAt).toBe(evs[1]!.timestamp)
  })
})

describe('replayState — idempotency under duplicate replay', () => {
  it('replaying the same event sequence twice yields the same state', () => {
    const evs: PlanRunEvent[] = [
      ev({ kind: 'plan_run_started' }),
      ev({ kind: 'task_started', taskId: 'A1' } as PlanRunEvent),
      ev({
        kind: 'task_completed',
        taskId: 'A1',
        outcome: 'success',
      } as PlanRunEvent),
      ev({ kind: 'plan_run_completed' }),
    ]
    const a = replayState(plan, evs)
    const b = replayState(plan, evs)
    expect(a).toEqual(b)
  })
})

describe('replayState — empty journal', () => {
  it('returns pending when no events present', () => {
    const state = replayState(plan, [], { runId: 'run-empty' })
    expect(state.status).toBe('pending')
    expect(state.runId).toBe('run-empty')
  })
})
