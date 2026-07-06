/**
 * Integration test for `anvil plan-status` (ANV-0025 Wave 3).
 *
 * Runs the CLI binary against a real run directory bootstrapped from
 * a fixture plan and asserts the JSON envelope shape.
 */

import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootstrapRun } from '../../src/core/plans/bootstrap.js'
import type { ExecutablePlan } from '../../src/core/plans/schema.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const REPO_ROOT = resolve(__dirname, '..', '..')
const ANVIL_BIN = join(REPO_ROOT, 'bin', 'anvil.cjs')

const plan: ExecutablePlan = {
  version: 'v0.14.0',
  theme: 'plan-status integration fixture',
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

describe('anvil plan-status (integration)', () => {
  it('prints a parseable JSON envelope for a bootstrapped run', async () => {
    const tmp = createTestTmpDir('plan-status-cli')
    const runDir = join(tmp, 'run-1')
    await bootstrapRun({
      runId: 'run-1',
      runDir,
      plan,
      now: () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    })

    const out = execFileSync(
      process.execPath,
      [ANVIL_BIN, 'plan-status', runDir, '--json'],
      { encoding: 'utf-8' },
    )
    const payload = JSON.parse(out.trim()) as {
      ok: boolean
      runId: string
      planVersion: string
      status: string
      eventCount: number
    }
    expect(payload.ok).toBe(true)
    expect(payload.runId).toBe('run-1')
    expect(payload.planVersion).toBe('v0.14.0')
    expect(payload.status).toBe('in_progress')
    expect(payload.eventCount).toBe(1)
  })

  it('exits non-zero for a missing run directory', () => {
    const tmp = createTestTmpDir('plan-status-cli-missing')
    const runDir = join(tmp, 'no-such-run')

    let exitCode = 0
    let stdout = ''
    try {
      execFileSync(
        process.execPath,
        [ANVIL_BIN, 'plan-status', runDir, '--json'],
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
    expect(payload.reason).toBe('run-dir-missing')
  })
})
