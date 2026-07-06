/**
 * ANV-0025 Wave 4 — retry-once + verify-blocks-advance tests.
 *
 * These tests exercise the failure-classification path and the
 * verification-evidence invariant in `runner.completeTask`.
 */

import { describe, expect, it } from 'vitest'
import { bootstrapRun } from '../../../../../src/core/plans/bootstrap.js'
import type { PlanRunEvent } from '../../../../../src/core/plans/events/schema.js'
import { readEvents } from '../../../../../src/core/plans/recorder.js'
import { createPlanRunner } from '../../../../../src/core/plans/runner/runner.js'
import type { ExecutablePlan } from '../../../../../src/core/plans/schema.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

function makePlan(verification: string[] = []): ExecutablePlan {
  return {
    version: 'v0.14.0',
    theme: 'retry/verify fixture',
    waves: [],
    tasks: [
      {
        id: 'A1',
        title: 'A1',
        type: 'feature',
        effort: 's',
        depends_on: [],
        write_scope: [],
        verification,
      },
    ],
    exit_criteria: [],
  }
}

async function makeRunner(verification: string[] = []) {
  const tmp = createTestTmpDir('retry-verify')
  const plan = makePlan(verification)
  const { recorder } = await bootstrapRun({
    runId: 'r1',
    runDir: tmp,
    plan,
    now: () => new Date(Date.UTC(2026, 0, 1)),
  })
  const runner = createPlanRunner({ recorder, plan, runDir: tmp })
  return { runner, runDir: tmp }
}

describe('completeTask — retry-once classification', () => {
  it('transient failure on attempt 1 schedules a retry (attempt 2)', async () => {
    const { runner, runDir } = await makeRunner()
    await runner.startTask('A1')
    const result = await runner.completeTask('A1', {
      outcome: 'failed',
      error: { message: 'ECONNRESET while fetching' },
    })
    expect(result.action).toBe('retry-scheduled')
    expect(result.classification).toBe('transient')
    const events = await readEvents(runDir)
    const startedAttempts = events
      .filter(
        (e): e is Extract<PlanRunEvent, { kind: 'task_started' }> =>
          e.kind === 'task_started',
      )
      .map((e) => e.attempt)
    expect(startedAttempts).toEqual([1, 2])
  })

  it('transient failure on attempt 2 escalates to gate-required', async () => {
    const { runner, runDir } = await makeRunner()
    await runner.startTask('A1')
    await runner.completeTask('A1', {
      outcome: 'failed',
      error: { message: 'timeout' },
    })
    // The runner auto-restarted attempt 2 via startTask inside completeTask.
    // Now fail again on attempt 2:
    const second = await runner.completeTask('A1', {
      outcome: 'failed',
      error: { message: 'timeout again' },
    })
    expect(second.action).toBe('gate-requested')
    const events = await readEvents(runDir)
    expect(events.some((e) => e.kind === 'gate_requested')).toBe(true)
  })

  it('deterministic failure immediately requests a gate (no retry)', async () => {
    const { runner, runDir } = await makeRunner()
    await runner.startTask('A1')
    const result = await runner.completeTask('A1', {
      outcome: 'failed',
      error: { message: 'assertion failed: expected 1 got 2' },
    })
    expect(result.action).toBe('gate-requested')
    expect(result.classification).toBe('deterministic')
    const events = await readEvents(runDir)
    // No attempt-2 task_started should have been recorded.
    const startedAttempts = events
      .filter(
        (e): e is Extract<PlanRunEvent, { kind: 'task_started' }> =>
          e.kind === 'task_started',
      )
      .map((e) => e.attempt)
    expect(startedAttempts).toEqual([1])
  })

  it('explicit gate-required tag bypasses retry path', async () => {
    const { runner } = await makeRunner()
    await runner.startTask('A1')
    const result = await runner.completeTask('A1', {
      outcome: 'failed',
      error: {
        message: 'timeout-but-actually-needs-human',
        classification: 'gate-required',
      },
    })
    expect(result.action).toBe('gate-requested')
    expect(result.classification).toBe('gate-required')
  })
})

describe('completeTask — verify-blocks-advance', () => {
  it('refuses success without an evidence_attached event', async () => {
    const { runner } = await makeRunner(['bun test'])
    await runner.startTask('A1')
    await expect(
      runner.completeTask('A1', { outcome: 'success' }),
    ).rejects.toThrow(/verify-blocks-advance/)
  })

  it('allows success once evidence is attached', async () => {
    const { runner } = await makeRunner(['bun test'])
    await runner.startTask('A1')
    await runner.attachEvidence({
      taskId: 'A1',
      evidenceKind: 'log',
      location: 'runs/r1/A1.log',
    })
    const result = await runner.completeTask('A1', { outcome: 'success' })
    expect(result.action).toBe('completed')
  })

  it('does NOT block a failed completion (failure path resolves separately)', async () => {
    const { runner } = await makeRunner(['bun test'])
    await runner.startTask('A1')
    // No evidence attached, but outcome is failed — the invariant exempts
    // failures because the gate/retry path handles them.
    const result = await runner.completeTask('A1', {
      outcome: 'failed',
      error: { message: 'assertion failed' },
    })
    expect(result.action).toBe('gate-requested')
  })

  it('allows success when the task has no verification commands', async () => {
    const { runner } = await makeRunner([])
    await runner.startTask('A1')
    const result = await runner.completeTask('A1', { outcome: 'success' })
    expect(result.action).toBe('completed')
  })
})
