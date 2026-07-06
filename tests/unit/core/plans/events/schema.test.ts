/**
 * Unit tests for src/core/plans/events/schema.ts (ANV-0025 Wave 3).
 *
 * Each event-kind has a happy-path accept + at least one reject case.
 * The discriminated union round-trips every kind.
 */

import { describe, expect, it } from 'vitest'
import {
  EvidenceAttachedEvent,
  GateApprovedEvent,
  GateRequestedEvent,
  PLAN_RUN_EVENT_KINDS,
  PhaseCompletedEvent,
  PhaseStartedEvent,
  PlanRunAbortedEvent,
  PlanRunCompletedEvent,
  PlanRunEvent,
  PlanRunStartedEvent,
  TaskCompletedEvent,
  TaskStartedEvent,
} from '../../../../../src/core/plans/events/schema.js'

// ─── Fixture envelope ────────────────────────────────────────────────────────

const envelope = {
  timestamp: '2026-05-15T12:00:00.000Z',
  runId: 'run-abc-123',
  planVersion: 'v0.14.0',
  requestHash: 'req-001',
}

// ─── Per-kind accept + reject ────────────────────────────────────────────────

describe('PlanRunStartedEvent', () => {
  it('accepts a minimal valid event', () => {
    const parsed = PlanRunStartedEvent.parse({
      kind: 'plan_run_started',
      ...envelope,
    })
    expect(parsed.kind).toBe('plan_run_started')
  })

  it('rejects a missing runId', () => {
    const { runId: _runId, ...rest } = envelope
    const r = PlanRunStartedEvent.safeParse({
      kind: 'plan_run_started',
      ...rest,
    })
    expect(r.success).toBe(false)
  })

  it('rejects a non-ISO timestamp', () => {
    const r = PlanRunStartedEvent.safeParse({
      kind: 'plan_run_started',
      ...envelope,
      timestamp: 'not-a-date',
    })
    expect(r.success).toBe(false)
  })
})

describe('PhaseStartedEvent', () => {
  it('accepts a phase with task IDs', () => {
    const parsed = PhaseStartedEvent.parse({
      kind: 'phase_started',
      ...envelope,
      phaseId: 'phase-1',
      taskIds: ['A1', 'A2'],
    })
    expect(parsed.taskIds).toEqual(['A1', 'A2'])
  })

  it('defaults taskIds to empty', () => {
    const parsed = PhaseStartedEvent.parse({
      kind: 'phase_started',
      ...envelope,
      phaseId: 'phase-1',
    })
    expect(parsed.taskIds).toEqual([])
  })

  it('rejects a malformed phase ID', () => {
    const r = PhaseStartedEvent.safeParse({
      kind: 'phase_started',
      ...envelope,
      phaseId: '-leading-dash',
    })
    expect(r.success).toBe(false)
  })

  it('rejects a malformed task ID', () => {
    const r = PhaseStartedEvent.safeParse({
      kind: 'phase_started',
      ...envelope,
      phaseId: 'phase-1',
      taskIds: ['a1'],
    })
    expect(r.success).toBe(false)
  })
})

describe('PhaseCompletedEvent', () => {
  it('defaults outcome to success', () => {
    const parsed = PhaseCompletedEvent.parse({
      kind: 'phase_completed',
      ...envelope,
      phaseId: 'phase-1',
    })
    expect(parsed.outcome).toBe('success')
  })

  it('accepts each declared outcome', () => {
    for (const outcome of ['success', 'partial', 'failed'] as const) {
      const r = PhaseCompletedEvent.safeParse({
        kind: 'phase_completed',
        ...envelope,
        phaseId: 'phase-1',
        outcome,
      })
      expect(r.success).toBe(true)
    }
  })

  it('rejects an unknown outcome', () => {
    const r = PhaseCompletedEvent.safeParse({
      kind: 'phase_completed',
      ...envelope,
      phaseId: 'phase-1',
      outcome: 'maybe',
    })
    expect(r.success).toBe(false)
  })
})

describe('TaskStartedEvent', () => {
  it('defaults attempt to 1', () => {
    const parsed = TaskStartedEvent.parse({
      kind: 'task_started',
      ...envelope,
      taskId: 'A1',
    })
    expect(parsed.attempt).toBe(1)
  })

  it('accepts an explicit attempt > 1', () => {
    const parsed = TaskStartedEvent.parse({
      kind: 'task_started',
      ...envelope,
      taskId: 'A1',
      attempt: 2,
    })
    expect(parsed.attempt).toBe(2)
  })

  it('rejects attempt = 0', () => {
    const r = TaskStartedEvent.safeParse({
      kind: 'task_started',
      ...envelope,
      taskId: 'A1',
      attempt: 0,
    })
    expect(r.success).toBe(false)
  })
})

describe('TaskCompletedEvent', () => {
  it('accepts a success outcome', () => {
    const r = TaskCompletedEvent.safeParse({
      kind: 'task_completed',
      ...envelope,
      taskId: 'A1',
      outcome: 'success',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a failure with classified error', () => {
    const parsed = TaskCompletedEvent.parse({
      kind: 'task_completed',
      ...envelope,
      taskId: 'A1',
      outcome: 'failed',
      error: { message: 'boom', classification: 'flaky' },
    })
    expect(parsed.error?.classification).toBe('flaky')
  })

  it('rejects empty error message', () => {
    const r = TaskCompletedEvent.safeParse({
      kind: 'task_completed',
      ...envelope,
      taskId: 'A1',
      outcome: 'failed',
      error: { message: '' },
    })
    expect(r.success).toBe(false)
  })
})

describe('GateRequestedEvent', () => {
  it('accepts a request with prompt', () => {
    const parsed = GateRequestedEvent.parse({
      kind: 'gate_requested',
      ...envelope,
      gateId: 'gate-review',
      prompt: 'Please review the diff',
    })
    expect(parsed.gateId).toBe('gate-review')
  })

  it('rejects empty prompt', () => {
    const r = GateRequestedEvent.safeParse({
      kind: 'gate_requested',
      ...envelope,
      gateId: 'gate-review',
      prompt: '',
    })
    expect(r.success).toBe(false)
  })
})

describe('GateApprovedEvent', () => {
  it.each(['approved', 'rejected', 'deferred'] as const)(
    'accepts decision=%s',
    (decision) => {
      const r = GateApprovedEvent.safeParse({
        kind: 'gate_approved',
        ...envelope,
        gateId: 'gate-review',
        decision,
        reviewer: 'alice',
      })
      expect(r.success).toBe(true)
    },
  )

  it('rejects unknown decision', () => {
    const r = GateApprovedEvent.safeParse({
      kind: 'gate_approved',
      ...envelope,
      gateId: 'gate-review',
      decision: 'maybe',
      reviewer: 'alice',
    })
    expect(r.success).toBe(false)
  })

  it('rejects empty reviewer', () => {
    const r = GateApprovedEvent.safeParse({
      kind: 'gate_approved',
      ...envelope,
      gateId: 'gate-review',
      decision: 'approved',
      reviewer: '',
    })
    expect(r.success).toBe(false)
  })
})

describe('EvidenceAttachedEvent', () => {
  it('accepts evidence with taskId reference', () => {
    const parsed = EvidenceAttachedEvent.parse({
      kind: 'evidence_attached',
      ...envelope,
      taskId: 'A1',
      evidenceKind: 'log',
      location: 'artifacts/a1.log',
    })
    expect(parsed.evidenceKind).toBe('log')
  })

  it('accepts evidence with phaseId reference', () => {
    const r = EvidenceAttachedEvent.safeParse({
      kind: 'evidence_attached',
      ...envelope,
      phaseId: 'phase-1',
      evidenceKind: 'transcript',
      location: 'artifacts/phase-1.md',
    })
    expect(r.success).toBe(true)
  })

  it('rejects empty evidenceKind', () => {
    const r = EvidenceAttachedEvent.safeParse({
      kind: 'evidence_attached',
      ...envelope,
      taskId: 'A1',
      evidenceKind: '',
      location: 'x',
    })
    expect(r.success).toBe(false)
  })
})

describe('PlanRunCompletedEvent / PlanRunAbortedEvent', () => {
  it('accepts a completion', () => {
    const r = PlanRunCompletedEvent.safeParse({
      kind: 'plan_run_completed',
      ...envelope,
    })
    expect(r.success).toBe(true)
  })

  it('accepts an abort with reason', () => {
    const parsed = PlanRunAbortedEvent.parse({
      kind: 'plan_run_aborted',
      ...envelope,
      reason: 'gate rejected',
    })
    expect(parsed.reason).toBe('gate rejected')
  })

  it('rejects abort with empty reason', () => {
    const r = PlanRunAbortedEvent.safeParse({
      kind: 'plan_run_aborted',
      ...envelope,
      reason: '',
    })
    expect(r.success).toBe(false)
  })
})

// ─── Union ───────────────────────────────────────────────────────────────────

describe('PlanRunEvent (discriminated union)', () => {
  it('round-trips every declared kind', () => {
    const samples: Array<{ kind: string }> = [
      { kind: 'plan_run_started', ...envelope },
      { kind: 'phase_started', ...envelope, phaseId: 'phase-1' },
      { kind: 'phase_completed', ...envelope, phaseId: 'phase-1' },
      { kind: 'task_started', ...envelope, taskId: 'A1' },
      {
        kind: 'task_completed',
        ...envelope,
        taskId: 'A1',
        outcome: 'success',
      },
      {
        kind: 'gate_requested',
        ...envelope,
        gateId: 'g1',
        prompt: 'review me',
      },
      {
        kind: 'gate_approved',
        ...envelope,
        gateId: 'g1',
        decision: 'approved',
        reviewer: 'alice',
      },
      {
        kind: 'evidence_attached',
        ...envelope,
        taskId: 'A1',
        evidenceKind: 'log',
        location: 'a.log',
      },
      { kind: 'plan_run_completed', ...envelope },
      { kind: 'plan_run_aborted', ...envelope, reason: 'op cancel' },
    ]
    for (const s of samples) {
      const r = PlanRunEvent.safeParse(s)
      expect(r.success, `failed to parse ${s.kind}: ${JSON.stringify(r)}`).toBe(
        true,
      )
    }
  })

  it('rejects an unknown kind', () => {
    const r = PlanRunEvent.safeParse({
      kind: 'something_else',
      ...envelope,
    })
    expect(r.success).toBe(false)
  })

  it('PLAN_RUN_EVENT_KINDS includes every union member', () => {
    expect(new Set(PLAN_RUN_EVENT_KINDS)).toEqual(
      new Set([
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
      ]),
    )
  })
})
