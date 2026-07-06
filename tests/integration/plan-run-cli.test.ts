/**
 * Integration: `anvil plan-run` against a fixture plan (ANV-0025 Wave 4).
 *
 * Drives the runner end-to-end on a small executable plan and asserts the
 * journal sequence and final status.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readEvents } from '../../src/core/plans/recorder.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const REPO_ROOT = resolve(__dirname, '..', '..')
const ANVIL_BIN = join(REPO_ROOT, 'bin', 'anvil.cjs')

const PLAN_MD = `---
executable_plan:
  version: v0.14.0
  theme: integration fixture for plan-run
  waves:
    - id: wave-1
      tasks: [A1, A2]
      parallelism: sequential
    - id: wave-2
      tasks: [B1, B2]
      parallelism: sequential
  tasks:
    - id: A1
      title: alpha 1
      type: feature
      effort: s
      depends_on: []
      write_scope: []
      verification: []
    - id: A2
      title: alpha 2
      type: docs
      effort: xs
      depends_on: []
      write_scope: []
      verification: []
    - id: B1
      title: bravo 1
      type: test
      effort: s
      depends_on: [A1]
      write_scope: []
      verification: []
    - id: B2
      title: bravo 2
      type: chore
      effort: xs
      depends_on: []
      write_scope: []
      verification: []
  exit_criteria:
    - everything is green
---

# Integration fixture plan
`

describe('anvil plan-run (integration)', () => {
  it('runs a 2-phase, 4-task plan in state-tracker mode', () => {
    const tmp = createTestTmpDir('plan-run-cli')
    const planPath = join(tmp, 'plan.md')
    writeFileSync(planPath, PLAN_MD)
    const runDir = join(tmp, 'runs', 'r1')

    const out = execFileSync(
      process.execPath,
      [
        ANVIL_BIN,
        'plan-run',
        planPath,
        '--json',
        '--run-dir',
        runDir,
        '--run-id',
        'r1',
      ],
      { encoding: 'utf-8' },
    )
    const payload = JSON.parse(out.trim()) as {
      ok: boolean
      runId: string
      status: string
      taskCount: number
      completedCount: number
    }
    expect(payload.ok).toBe(true)
    expect(payload.runId).toBe('r1')
    expect(payload.taskCount).toBe(4)
    expect(payload.completedCount).toBe(4)
    expect(payload.status).toBe('completed')
  })

  it('records the expected journal sequence', async () => {
    const tmp = createTestTmpDir('plan-run-sequence')
    const planPath = join(tmp, 'plan.md')
    writeFileSync(planPath, PLAN_MD)
    const runDir = join(tmp, 'runs', 'r2')

    execFileSync(
      process.execPath,
      [
        ANVIL_BIN,
        'plan-run',
        planPath,
        '--json',
        '--run-dir',
        runDir,
        '--run-id',
        'r2',
      ],
      { encoding: 'utf-8' },
    )

    const events = await readEvents(runDir)
    const kinds = events.map((e) => e.kind)

    // Expected sequence: started, [phase, started, completed]×4 split by wave, plan_run_completed.
    expect(kinds[0]).toBe('plan_run_started')
    expect(kinds[kinds.length - 1]).toBe('plan_run_completed')
    // 4 task_started + 4 task_completed
    expect(kinds.filter((k) => k === 'task_started')).toHaveLength(4)
    expect(kinds.filter((k) => k === 'task_completed')).toHaveLength(4)
    // 2 phase_started + 2 phase_completed
    expect(kinds.filter((k) => k === 'phase_started')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'phase_completed')).toHaveLength(2)
  })

  it('exits 1 when the plan file is missing', () => {
    const tmp = createTestTmpDir('plan-run-missing')
    let exitCode = 0
    let stdout = ''
    try {
      execFileSync(
        process.execPath,
        [ANVIL_BIN, 'plan-run', join(tmp, 'nope.md'), '--json'],
        { encoding: 'utf-8' },
      )
    } catch (err) {
      const e = err as { status?: number; stdout?: Buffer | string }
      exitCode = e.status ?? -1
      stdout =
        typeof e.stdout === 'string'
          ? e.stdout
          : (e.stdout?.toString('utf-8') ?? '')
    }
    expect(exitCode).toBe(1)
    const payload = JSON.parse(stdout.trim()) as {
      ok: boolean
      reason: string
    }
    expect(payload.ok).toBe(false)
    expect(payload.reason).toBe('plan-missing')
  })
})
