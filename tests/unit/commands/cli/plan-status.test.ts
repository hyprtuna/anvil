/**
 * Unit tests for `anvil plan-status` (ANV-0025 Wave 3).
 *
 * Covers:
 *   - Pretty + JSON output on a freshly-bootstrapped run dir.
 *   - JSON envelope reflects replayed state after more events are recorded.
 *   - Failure path: missing run dir, missing plan.yml, corrupt journal.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapRun } from '../../../../src/core/plans/bootstrap.js'
import type { ExecutablePlan } from '../../../../src/core/plans/schema.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

const plan: ExecutablePlan = {
  version: 'v0.14.0',
  theme: 'plan-status fixture',
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

describe('commands/cli/plan-status', () => {
  let tmp: string
  let stdoutChunks: string[]
  let stderrChunks: string[]
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmp = createTestTmpDir('plan-status')
    stdoutChunks = []
    stderrChunks = []
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
        return true
      })
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
        return true
      })
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    exitSpy.mockRestore()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('JSON mode reports the post-bootstrap state', async () => {
    const runDir = join(tmp, 'run-1')
    await bootstrapRun({
      runId: 'run-1',
      runDir,
      plan,
      now: () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    })

    const { planStatusCommand } = await import(
      '../../../../src/commands/cli/plan-status.js'
    )
    await planStatusCommand(runDir, { json: true })

    expect(exitSpy).not.toHaveBeenCalled()
    const payload = JSON.parse(stdoutChunks.join('').trim()) as {
      ok: boolean
      runId: string
      status: string
      eventCount: number
      startedAt: string | null
    }
    expect(payload.ok).toBe(true)
    expect(payload.runId).toBe('run-1')
    expect(payload.status).toBe('in_progress')
    expect(payload.eventCount).toBe(1)
    expect(payload.startedAt).toBe('2026-01-02T03:04:05.000Z')
  })

  it('pretty mode prints OK with the runId and status', async () => {
    const runDir = join(tmp, 'run-1')
    await bootstrapRun({ runId: 'run-1', runDir, plan })

    const { planStatusCommand } = await import(
      '../../../../src/commands/cli/plan-status.js'
    )
    await planStatusCommand(runDir)

    expect(exitSpy).not.toHaveBeenCalled()
    const out = stdoutChunks.join('')
    expect(out).toMatch(/OK /)
    expect(out).toMatch(/run-1/)
    expect(out).toMatch(/in_progress/)
  })

  it('JSON reflects additional recorded events (task in flight)', async () => {
    const runDir = join(tmp, 'run-1')
    const { recorder } = await bootstrapRun({
      runId: 'run-1',
      runDir,
      plan,
    })
    await recorder.recordEvent({
      kind: 'task_started',
      timestamp: '2026-05-15T12:00:10.000Z',
      runId: 'run-1',
      planVersion: 'v0.14.0',
      requestHash: 'task-start-1',
      taskId: 'A1',
      attempt: 1,
    })

    const { planStatusCommand } = await import(
      '../../../../src/commands/cli/plan-status.js'
    )
    await planStatusCommand(runDir, { json: true })

    const payload = JSON.parse(stdoutChunks.join('').trim()) as {
      ok: boolean
      currentTaskId: string | null
      eventCount: number
    }
    expect(payload.ok).toBe(true)
    expect(payload.currentTaskId).toBe('A1')
    expect(payload.eventCount).toBe(2)
  })

  it('exits 1 with run-dir-missing when the directory does not exist', async () => {
    const { planStatusCommand } = await import(
      '../../../../src/commands/cli/plan-status.js'
    )
    await planStatusCommand(join(tmp, 'nope'), { json: true })

    expect(exitSpy).toHaveBeenCalledWith(1)
    const payload = JSON.parse(stdoutChunks.join('').trim()) as {
      ok: boolean
      reason: string
    }
    expect(payload.ok).toBe(false)
    expect(payload.reason).toBe('run-dir-missing')
  })

  it('exits 1 with plan-snapshot-missing when plan.yml is absent', async () => {
    const runDir = join(tmp, 'run-noplan')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(runDir, { recursive: true })

    const { planStatusCommand } = await import(
      '../../../../src/commands/cli/plan-status.js'
    )
    await planStatusCommand(runDir, { json: true })

    expect(exitSpy).toHaveBeenCalledWith(1)
    const payload = JSON.parse(stdoutChunks.join('').trim()) as {
      ok: boolean
      reason: string
    }
    expect(payload.ok).toBe(false)
    expect(payload.reason).toBe('plan-snapshot-missing')
  })

  it('exits 1 with journal-unreadable on a corrupt events.jsonl', async () => {
    const runDir = join(tmp, 'run-corrupt')
    await bootstrapRun({ runId: 'run-corrupt', runDir, plan })

    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(runDir, 'events.jsonl'), '{not json\n', 'utf-8')

    const { planStatusCommand } = await import(
      '../../../../src/commands/cli/plan-status.js'
    )
    await planStatusCommand(runDir, { json: true })

    expect(exitSpy).toHaveBeenCalledWith(1)
    const payload = JSON.parse(stdoutChunks.join('').trim()) as {
      ok: boolean
      reason: string
    }
    expect(payload.ok).toBe(false)
    expect(payload.reason).toBe('journal-unreadable')
  })
})
