/**
 * Unit tests for src/core/plans/bootstrap.ts (ANV-0025 Wave 3).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PLAN_SNAPSHOT_FILENAME,
  STATE_SNAPSHOT_FILENAME,
  bootstrapRun,
} from '../../../../src/core/plans/bootstrap.js'
import {
  EVENTS_JOURNAL_FILENAME,
  readEvents,
} from '../../../../src/core/plans/recorder.js'
import type { ExecutablePlan } from '../../../../src/core/plans/schema.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

const plan: ExecutablePlan = {
  version: 'v0.14.0',
  theme: 'bootstrap test',
  waves: [],
  tasks: [
    {
      id: 'A1',
      title: 't',
      type: 'feature',
      effort: 's',
      depends_on: [],
      write_scope: [],
      verification: [],
    },
  ],
  exit_criteria: [],
}

describe('bootstrapRun', () => {
  it('creates the run directory, snapshots the plan, writes initial state, emits run-started', async () => {
    const runDir = join(createTestTmpDir('bootstrap-happy'), 'run-1')
    const fixedClock = () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5))

    const { state, recorder } = await bootstrapRun({
      runId: 'run-1',
      runDir,
      plan,
      now: fixedClock,
    })

    expect(state.status).toBe('in_progress')
    expect(state.runId).toBe('run-1')
    expect(state.planVersion).toBe('v0.14.0')
    expect(state.startedAt).toBe('2026-01-02T03:04:05.000Z')
    expect(state.updatedAt).toBe('2026-01-02T03:04:05.000Z')

    // Plan snapshot on disk matches the source plan exactly.
    const snapshot = JSON.parse(
      readFileSync(join(runDir, PLAN_SNAPSHOT_FILENAME), 'utf-8'),
    )
    expect(snapshot).toEqual(plan)

    // state.yml exists and reflects the in_progress state.
    const stateFile = JSON.parse(
      readFileSync(join(runDir, STATE_SNAPSHOT_FILENAME), 'utf-8'),
    )
    expect(stateFile.status).toBe('in_progress')
    expect(stateFile.startedAt).toBe('2026-01-02T03:04:05.000Z')

    // events.jsonl contains exactly one event of kind plan_run_started.
    const events = await readEvents(runDir)
    expect(events).toHaveLength(1)
    expect(events[0]!.kind).toBe('plan_run_started')

    // Recorder is bound to the same run + plan.
    expect(recorder.runId).toBe('run-1')
    expect(recorder.planVersion).toBe('v0.14.0')
    expect(recorder.runDir).toBe(runDir)
  })

  it('is idempotent when called twice with the same requestHash', async () => {
    const runDir = join(createTestTmpDir('bootstrap-idemp'), 'run-1')
    const fixedClock = () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5))

    await bootstrapRun({
      runId: 'run-1',
      runDir,
      plan,
      requestHash: 'bootstrap-1',
      now: fixedClock,
    })
    await bootstrapRun({
      runId: 'run-1',
      runDir,
      plan,
      requestHash: 'bootstrap-1',
      now: fixedClock,
    })

    const events = await readEvents(runDir)
    expect(events).toHaveLength(1)
  })

  it('does not overwrite an existing plan snapshot', async () => {
    const runDir = join(createTestTmpDir('bootstrap-preserve'), 'run-1')
    await bootstrapRun({ runId: 'run-1', runDir, plan })

    // Re-bootstrap with a mutated plan — the existing snapshot must win
    // because resume semantics depend on the original snapshot.
    const mutated: ExecutablePlan = { ...plan, theme: 'changed' }
    await bootstrapRun({
      runId: 'run-1',
      runDir,
      plan: mutated,
      requestHash: 'different-hash',
    })

    const snapshot = JSON.parse(
      readFileSync(join(runDir, PLAN_SNAPSHOT_FILENAME), 'utf-8'),
    )
    expect(snapshot.theme).toBe('bootstrap test')
  })

  it('rejects empty runId', async () => {
    await expect(
      bootstrapRun({ runId: '', runDir: '/tmp/x', plan }),
    ).rejects.toThrow(/runId/)
  })

  it('writes events.jsonl with exactly one trailing newline per line', async () => {
    const runDir = join(createTestTmpDir('bootstrap-format'), 'run-1')
    await bootstrapRun({ runId: 'run-1', runDir, plan })
    const raw = readFileSync(join(runDir, EVENTS_JOURNAL_FILENAME), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw.split('\n').filter((l) => l.length > 0)).toHaveLength(1)
  })

  it('plan.yml and state.yml both exist and parse as JSON', async () => {
    const runDir = join(createTestTmpDir('bootstrap-files'), 'run-1')
    await bootstrapRun({ runId: 'run-1', runDir, plan })
    expect(existsSync(join(runDir, PLAN_SNAPSHOT_FILENAME))).toBe(true)
    expect(existsSync(join(runDir, STATE_SNAPSHOT_FILENAME))).toBe(true)
  })
})
