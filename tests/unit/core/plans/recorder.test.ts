/**
 * Unit tests for src/core/plans/recorder.ts (ANV-0025 Wave 3).
 *
 * Covers:
 *   - Round-trip: record → read produces an identical event sequence.
 *   - Idempotency: re-emitting the same requestHash is a no-op.
 *   - Append-only: existing journal content is preserved across recorder
 *     instantiations.
 *   - Cross-recorder hydration: a fresh recorder rejects duplicate
 *     requestHashes already on disk.
 *   - Mismatch guards: events whose runId/planVersion differ from the
 *     recorder's binding are rejected.
 *   - Reader: malformed JSON / invalid schema → throw.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PlanRunEvent } from '../../../../src/core/plans/events/schema.js'
import {
  EVENTS_JOURNAL_FILENAME,
  createRunRecorder,
  readEvents,
} from '../../../../src/core/plans/recorder.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

function makeStartedEvent(
  runId: string,
  planVersion: string,
  requestHash: string,
): PlanRunEvent {
  return {
    kind: 'plan_run_started',
    timestamp: '2026-05-15T12:00:00.000Z',
    runId,
    planVersion,
    requestHash,
  }
}

function makeTaskStartedEvent(
  runId: string,
  planVersion: string,
  requestHash: string,
  taskId: string,
): PlanRunEvent {
  return {
    kind: 'task_started',
    timestamp: '2026-05-15T12:00:01.000Z',
    runId,
    planVersion,
    requestHash,
    taskId,
    attempt: 1,
  }
}

describe('recordEvent / readEvents round-trip', () => {
  it('writes each event as one JSON line and reads them back identically', async () => {
    const runDir = join(createTestTmpDir('recorder-roundtrip'), 'run-1')
    const recorder = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })

    const ev1 = makeStartedEvent('run-1', 'v0.14.0', 'req-1')
    const ev2 = makeTaskStartedEvent('run-1', 'v0.14.0', 'req-2', 'A1')

    const r1 = await recorder.recordEvent(ev1)
    const r2 = await recorder.recordEvent(ev2)

    expect(r1.status).toBe('appended')
    expect(r2.status).toBe('appended')

    const events = await readEvents(runDir)
    expect(events).toEqual([ev1, ev2])

    // Raw on-disk check — confirm append-only line format.
    const raw = readFileSync(join(runDir, EVENTS_JOURNAL_FILENAME), 'utf-8')
    const lines = raw.split('\n').filter((l) => l.length > 0)
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toEqual(ev1)
    expect(JSON.parse(lines[1]!)).toEqual(ev2)
  })

  it('returns [] when the journal is missing', async () => {
    const runDir = join(createTestTmpDir('recorder-missing'), 'run-1')
    const events = await readEvents(runDir)
    expect(events).toEqual([])
  })

  it('returns [] when the journal exists but is empty', async () => {
    const runDir = join(createTestTmpDir('recorder-empty'), 'run-1')
    await mkdir(runDir, { recursive: true })
    writeFileSync(join(runDir, EVENTS_JOURNAL_FILENAME), '')
    const events = await readEvents(runDir)
    expect(events).toEqual([])
  })
})

describe('idempotency', () => {
  it('re-emitting the same requestHash is a no-op (single-recorder)', async () => {
    const runDir = join(createTestTmpDir('recorder-idemp-1'), 'run-1')
    const recorder = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })

    const ev = makeStartedEvent('run-1', 'v0.14.0', 'req-1')
    const r1 = await recorder.recordEvent(ev)
    const r2 = await recorder.recordEvent(ev)

    expect(r1.status).toBe('appended')
    expect(r2.status).toBe('duplicate')

    const events = await readEvents(runDir)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual(ev)
  })

  it('a fresh recorder hydrates dedup state from disk', async () => {
    const runDir = join(createTestTmpDir('recorder-idemp-2'), 'run-1')

    const first = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })
    const ev = makeStartedEvent('run-1', 'v0.14.0', 'req-1')
    await first.recordEvent(ev)

    // Simulate a fresh process — new recorder instance, same disk state.
    const second = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })
    const r = await second.recordEvent(ev)
    expect(r.status).toBe('duplicate')

    const events = await readEvents(runDir)
    expect(events).toHaveLength(1)
  })

  it('different requestHashes for otherwise-identical events both append', async () => {
    const runDir = join(createTestTmpDir('recorder-idemp-3'), 'run-1')
    const recorder = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })
    await recorder.recordEvent(makeStartedEvent('run-1', 'v0.14.0', 'a'))
    await recorder.recordEvent(makeStartedEvent('run-1', 'v0.14.0', 'b'))
    const events = await readEvents(runDir)
    expect(events).toHaveLength(2)
  })
})

describe('binding guards', () => {
  it('rejects events whose runId disagrees with the recorder', async () => {
    const runDir = join(createTestTmpDir('recorder-mismatch-1'), 'run-1')
    const recorder = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })
    await expect(
      recorder.recordEvent(makeStartedEvent('run-OTHER', 'v0.14.0', 'r')),
    ).rejects.toThrow(/runId/)
  })

  it('rejects events whose planVersion disagrees with the recorder', async () => {
    const runDir = join(createTestTmpDir('recorder-mismatch-2'), 'run-1')
    const recorder = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })
    await expect(
      recorder.recordEvent(makeStartedEvent('run-1', 'v9.9.9', 'r')),
    ).rejects.toThrow(/planVersion/)
  })

  it('rejects schema-invalid events at the boundary', async () => {
    const runDir = join(createTestTmpDir('recorder-schema-1'), 'run-1')
    const recorder = createRunRecorder({
      runId: 'run-1',
      planVersion: 'v0.14.0',
      runDir,
    })
    // Cast through unknown — simulating a caller passing dirty data.
    const bad = {
      kind: 'plan_run_started',
      timestamp: 'not-a-date',
      runId: 'run-1',
      planVersion: 'v0.14.0',
      requestHash: 'r',
    } as unknown as PlanRunEvent
    await expect(recorder.recordEvent(bad)).rejects.toThrow()
  })
})

describe('reader error paths', () => {
  it('throws on malformed JSON in the journal', async () => {
    const runDir = join(createTestTmpDir('recorder-bad-json'), 'run-1')
    await mkdir(runDir, { recursive: true })
    writeFileSync(join(runDir, EVENTS_JOURNAL_FILENAME), '{not json\n')
    await expect(readEvents(runDir)).rejects.toThrow(/line 1/)
  })

  it('throws on schema-invalid lines', async () => {
    const runDir = join(createTestTmpDir('recorder-bad-schema'), 'run-1')
    await mkdir(runDir, { recursive: true })
    writeFileSync(
      join(runDir, EVENTS_JOURNAL_FILENAME),
      `${JSON.stringify({ kind: 'no_such_event' })}\n`,
    )
    await expect(readEvents(runDir)).rejects.toThrow(/schema validation/)
  })
})

describe('factory guards', () => {
  it('rejects empty runId', () => {
    expect(() =>
      createRunRecorder({ runId: '', planVersion: 'v', runDir: '/tmp/x' }),
    ).toThrow(/runId/)
  })
  it('rejects empty planVersion', () => {
    expect(() =>
      createRunRecorder({ runId: 'r', planVersion: '', runDir: '/tmp/x' }),
    ).toThrow(/planVersion/)
  })
  it('rejects empty runDir', () => {
    expect(() =>
      createRunRecorder({ runId: 'r', planVersion: 'v', runDir: '' }),
    ).toThrow(/runDir/)
  })
})
