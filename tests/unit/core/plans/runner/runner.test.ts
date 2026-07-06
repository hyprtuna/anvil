/**
 * ANV-0025 Wave 4 — runner state machine unit tests.
 *
 * The runner emits validated events into the Wave-3 recorder. Each
 * transition method (startPhase / completePhase / startTask /
 * completeTask / requestGate / approveGate / abort) records exactly one
 * event with a stable, derived requestHash so repeated calls are
 * idempotent.
 */

import { describe, expect, it } from 'vitest'
import { bootstrapRun } from '../../../../../src/core/plans/bootstrap.js'
import type { PlanRunEvent } from '../../../../../src/core/plans/events/schema.js'
import { readEvents } from '../../../../../src/core/plans/recorder.js'
import { createPlanRunner } from '../../../../../src/core/plans/runner/runner.js'
import type { ExecutablePlan } from '../../../../../src/core/plans/schema.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

const plan: ExecutablePlan = {
  version: 'v0.14.0',
  theme: 'runner state machine fixture',
  waves: [
    { id: 'wave-1', tasks: ['A1', 'A2'], parallelism: 'sequential' },
    { id: 'wave-2', tasks: ['B1'], parallelism: 'sequential' },
  ],
  tasks: [
    {
      id: 'A1',
      title: 'task A1',
      type: 'feature',
      effort: 's',
      depends_on: [],
      write_scope: [],
      verification: [],
    },
    {
      id: 'A2',
      title: 'task A2',
      type: 'feature',
      effort: 's',
      depends_on: [],
      write_scope: [],
      verification: [],
    },
    {
      id: 'B1',
      title: 'task B1',
      type: 'feature',
      effort: 's',
      depends_on: ['A1'],
      write_scope: [],
      verification: [],
    },
  ],
  exit_criteria: [],
}

async function bootstrap() {
  const tmp = createTestTmpDir('runner-state')
  const { recorder } = await bootstrapRun({
    runId: 'r1',
    runDir: tmp,
    plan,
    now: () => new Date(Date.UTC(2026, 0, 1)),
  })
  return { recorder, runDir: tmp }
}

describe('createPlanRunner — transitions emit events', () => {
  it('startPhase records a phase_started event with the right phaseId', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    await runner.startPhase('wave-1')
    const events = await readEvents(runDir)
    const started = events.find(
      (e): e is Extract<PlanRunEvent, { kind: 'phase_started' }> =>
        e.kind === 'phase_started',
    )
    expect(started).toBeDefined()
    expect(started?.phaseId).toBe('wave-1')
  })

  it('completePhase records a phase_completed event', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    await runner.startPhase('wave-1')
    await runner.completePhase('wave-1')
    const events = await readEvents(runDir)
    expect(events.some((e) => e.kind === 'phase_completed')).toBe(true)
  })

  it('startTask + completeTask emit task_started then task_completed', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    await runner.startPhase('wave-1')
    await runner.startTask('A1')
    await runner.completeTask('A1', { outcome: 'success' })
    const events = await readEvents(runDir)
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('task_started')
    expect(kinds).toContain('task_completed')
  })

  it('requestGate records gate_requested + flips status to awaiting_gate', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    await runner.requestGate('approval-1', 'human review needed')
    const events = await readEvents(runDir)
    const gate = events.find(
      (e): e is Extract<PlanRunEvent, { kind: 'gate_requested' }> =>
        e.kind === 'gate_requested',
    )
    expect(gate).toBeDefined()
    expect(gate?.gateId).toBe('approval-1')
    const state = await runner.currentState()
    expect(state.status).toBe('awaiting_gate')
  })

  it('approveGate(decision=approved) flips status back to in_progress', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    await runner.requestGate('g1', 'review please')
    await runner.approveGate('g1', { decision: 'approved', reviewer: 'op' })
    const state = await runner.currentState()
    expect(state.status).toBe('in_progress')
  })

  it('abort records plan_run_aborted + marks the run aborted', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    await runner.abort('user cancelled')
    const state = await runner.currentState()
    expect(state.status).toBe('aborted')
  })

  it('transitions are idempotent — repeated startTask only records once', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    await runner.startPhase('wave-1')
    await runner.startTask('A1')
    await runner.startTask('A1')
    const events = await readEvents(runDir)
    const startedCount = events.filter(
      (e) => e.kind === 'task_started' && 'taskId' in e && e.taskId === 'A1',
    ).length
    expect(startedCount).toBe(1)
  })

  it('currentState replays journal each call (re-query-after-step)', async () => {
    const { recorder, runDir } = await bootstrap()
    const runner = createPlanRunner({ recorder, plan, runDir })
    const before = await runner.currentState()
    expect(before.status).toBe('in_progress')
    expect(before.currentPhaseId).toBeUndefined()
    await runner.startPhase('wave-1')
    const after = await runner.currentState()
    expect(after.currentPhaseId).toBe('wave-1')
  })
})
