/**
 * Integration: plan-run resume semantics (ANV-0025 Wave 4).
 *
 * bootstrapRun → emit 3 events through a runner → discard the runner →
 * re-create from the same runDir → confirm replayState recovers state.
 */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootstrapRun } from '../../src/core/plans/bootstrap.js'
import { readEvents } from '../../src/core/plans/recorder.js'
import { replayState } from '../../src/core/plans/run-state.js'
import { createPlanRunner } from '../../src/core/plans/runner/runner.js'
import type { ExecutablePlan } from '../../src/core/plans/schema.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const plan: ExecutablePlan = {
  version: 'v0.14.0',
  theme: 'resume fixture',
  waves: [{ id: 'wave-1', tasks: ['A1'], parallelism: 'sequential' }],
  tasks: [
    {
      id: 'A1',
      title: 'a1',
      type: 'feature',
      effort: 's',
      depends_on: [],
      write_scope: [],
      verification: [],
    },
  ],
  exit_criteria: [],
}

describe('plan-run resume', () => {
  it('replays the journal correctly after recorder re-create', async () => {
    const tmp = createTestTmpDir('plan-resume')
    const runDir = join(tmp, 'r1')

    // Phase 1: bootstrap + emit 2 transitions (3 events including started).
    const { recorder: rec1 } = await bootstrapRun({
      runId: 'r1',
      runDir,
      plan,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
    })
    const runner1 = createPlanRunner({ recorder: rec1, plan, runDir })
    await runner1.startPhase('wave-1', ['A1'])
    await runner1.startTask('A1', 'wave-1')

    // Drop runner1 reference — simulate process exit.

    // Phase 2: re-bootstrap from the same dir. bootstrapRun is idempotent;
    // the existing plan.yml and run_started event survive.
    const { recorder: rec2 } = await bootstrapRun({
      runId: 'r1',
      runDir,
      plan,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 10)),
    })

    // Re-read events from disk; should see plan_run_started, phase_started,
    // task_started — exactly three meaningful events.
    const events = await readEvents(runDir)
    const kinds = events.map((e) => e.kind)
    expect(kinds).toEqual(['plan_run_started', 'phase_started', 'task_started'])

    // The recovered state should reflect both transitions.
    const recovered = replayState(plan, events, { runId: 'r1' })
    expect(recovered.status).toBe('in_progress')
    expect(recovered.currentPhaseId).toBe('wave-1')
    expect(recovered.currentTaskId).toBe('A1')

    // Now bind a fresh runner and complete the task; the same journal
    // continues to accept new events.
    const runner2 = createPlanRunner({ recorder: rec2, plan, runDir })
    await runner2.completeTask('A1', { outcome: 'success', phaseId: 'wave-1' })

    const finalEvents = await readEvents(runDir)
    const finalState = replayState(plan, finalEvents, { runId: 'r1' })
    expect(finalState.currentTaskId).toBeUndefined()
  })
})
