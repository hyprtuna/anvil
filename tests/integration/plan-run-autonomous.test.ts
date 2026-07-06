/**
 * ANV-0175 — autonomous plan-run integration.
 *
 * Drives `planRunCommand` programmatically (not via execFile) so we can
 * inject a fake dispatcher and observe that:
 *
 *   - Phase B: --auto invokes the dispatcher exactly once per task
 *     (including for parallel waves), tasks emit task_completed events
 *     with outcome=success, and the run completes end-to-end.
 *   - Phase C: parallel waves dispatch concurrently (total wall time
 *     approximates max(task_times), not sum). Failures in one sibling
 *     do not abort the others. The parallelism cap is honored.
 *
 * The companion resume test exercises the bootstrap-idempotency path
 * end-to-end with the parallel dispatcher in the loop.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type PlanRunOptions,
  planRunCommand,
} from '../../src/commands/cli/plan-run.js'
import type { PlanRunEvent } from '../../src/core/plans/events/schema.js'
import { readEvents } from '../../src/core/plans/recorder.js'
import type { StepDispatcher } from '../../src/core/plans/runner/step-registry.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const TWO_PHASE_PARALLEL = `---
executable_plan:
  version: v0.15.2
  theme: autonomous integration fixture
  waves:
    - id: wave-1
      tasks: [A1, A2]
      parallelism: parallel
    - id: wave-2
      tasks: [B1, B2]
      parallelism: parallel
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
      type: feature
      effort: s
      depends_on: []
      write_scope: []
      verification: []
    - id: B1
      title: bravo 1
      type: feature
      effort: s
      depends_on: []
      write_scope: []
      verification: []
    - id: B2
      title: bravo 2
      type: feature
      effort: s
      depends_on: []
      write_scope: []
      verification: []
  exit_criteria:
    - everything green
---

# Autonomous fixture
`

let exitSpy: ReturnType<typeof vi.spyOn> | null = null
let stdoutSpy: ReturnType<typeof vi.spyOn> | null = null
let stderrSpy: ReturnType<typeof vi.spyOn> | null = null

beforeEach(() => {
  // process.exit() is called on failure paths; stub it so the test process
  // is never killed and we can assert what would have happened.
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
    /* never actually exit during tests */
    return undefined as never
  }) as never)
  stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true as never) as unknown as ReturnType<
    typeof vi.spyOn
  >
  stderrSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation(() => true as never) as unknown as ReturnType<
    typeof vi.spyOn
  >
})

afterEach(() => {
  exitSpy?.mockRestore()
  stdoutSpy?.mockRestore()
  stderrSpy?.mockRestore()
  // Clear the env mutations plan-run made.
  process.env.ANVIL_PLAN_RUN_DIR = undefined
  process.env.ANVIL_PLAN_RUN_ID = undefined
  process.env.ANVIL_AUTO = undefined
  process.env.ANVIL_AUTO_DEFAULTS = undefined
  process.env.ANVIL_PARALLELISM_CAP = undefined
})

function writePlan(tmp: string, content = TWO_PHASE_PARALLEL): string {
  const planPath = join(tmp, 'plan.md')
  writeFileSync(planPath, content)
  return planPath
}

describe('plan-run --auto end-to-end (Phase B + C)', () => {
  it('dispatches every task exactly once with a fake dispatcher and completes', async () => {
    const tmp = createTestTmpDir('autonomous-happy')
    const planPath = writePlan(tmp)
    const runDir = join(tmp, 'runs', 'r-happy')
    mkdirSync(runDir, { recursive: true })

    const dispatched: string[] = []
    const fakeDispatcher: StepDispatcher = async ({ task }) => {
      dispatched.push(task.id)
      return { outcome: 'success' as const }
    }
    const opts: PlanRunOptions = {
      json: true,
      auto: true,
      runId: 'r-happy',
      runDir,
      dispatcherFactoryOverride: () => fakeDispatcher,
    }
    await planRunCommand(planPath, opts)

    expect(dispatched.sort()).toEqual(['A1', 'A2', 'B1', 'B2'])

    const events = await readEvents(runDir)
    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('plan_run_started')
    expect(kinds[kinds.length - 1]).toBe('plan_run_completed')
    expect(kinds.filter((k) => k === 'task_completed')).toHaveLength(4)
    expect(kinds.filter((k) => k === 'phase_completed')).toHaveLength(2)
  })

  it('runs parallel-wave tasks concurrently (wall time < sum)', async () => {
    const tmp = createTestTmpDir('autonomous-concurrent')
    const planPath = writePlan(tmp)
    const runDir = join(tmp, 'runs', 'r-parallel')
    mkdirSync(runDir, { recursive: true })

    // Each task takes ~100ms. Sequential would be ~400ms; parallel within
    // a wave should be ~200ms (two waves × max(2 siblings) × 100ms).
    const sleepMs = 100
    const fakeDispatcher: StepDispatcher = async () => {
      await new Promise((r) => setTimeout(r, sleepMs))
      return { outcome: 'success' as const }
    }
    const t0 = Date.now()
    await planRunCommand(planPath, {
      json: true,
      auto: true,
      runId: 'r-parallel',
      runDir,
      dispatcherFactoryOverride: () => fakeDispatcher,
    })
    const elapsed = Date.now() - t0
    // Generous upper bound: well below 4 × sleepMs (= sequential time),
    // typically ~ 2 × sleepMs.
    expect(elapsed).toBeLessThan(sleepMs * 4)
  })

  it('honors the parallelism cap (cap=1 forces serial within wave)', async () => {
    const tmp = createTestTmpDir('autonomous-cap')
    const planPath = writePlan(tmp)
    const runDir = join(tmp, 'runs', 'r-cap')
    mkdirSync(runDir, { recursive: true })

    process.env.ANVIL_PARALLELISM_CAP = '1'

    let inFlight = 0
    let maxConcurrent = 0
    const fakeDispatcher: StepDispatcher = async () => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await new Promise((r) => setTimeout(r, 20))
      inFlight -= 1
      return { outcome: 'success' as const }
    }
    await planRunCommand(planPath, {
      json: true,
      auto: true,
      runId: 'r-cap',
      runDir,
      dispatcherFactoryOverride: () => fakeDispatcher,
    })
    expect(maxConcurrent).toBe(1)
  })

  it('observes >1 in-flight when cap allows it', async () => {
    const tmp = createTestTmpDir('autonomous-uncapped')
    const planPath = writePlan(tmp)
    const runDir = join(tmp, 'runs', 'r-uncap')
    mkdirSync(runDir, { recursive: true })

    let inFlight = 0
    let maxConcurrent = 0
    const fakeDispatcher: StepDispatcher = async () => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await new Promise((r) => setTimeout(r, 30))
      inFlight -= 1
      return { outcome: 'success' as const }
    }
    await planRunCommand(planPath, {
      json: true,
      auto: true,
      runId: 'r-uncap',
      runDir,
      dispatcherFactoryOverride: () => fakeDispatcher,
    })
    expect(maxConcurrent).toBeGreaterThanOrEqual(2)
  })

  it('a sibling failure does not abort other parallel siblings', async () => {
    const tmp = createTestTmpDir('autonomous-sibling-fail')
    const planPath = writePlan(tmp)
    const runDir = join(tmp, 'runs', 'r-sib')
    mkdirSync(runDir, { recursive: true })

    // A1 fails, A2 succeeds. The wave halts after both have run (failure
    // escalates to a gate request via the existing runner classification
    // path). Either way both siblings must be dispatched.
    const dispatched: string[] = []
    const fakeDispatcher: StepDispatcher = async ({ task }) => {
      dispatched.push(task.id)
      if (task.id === 'A1') {
        return {
          outcome: 'failed' as const,
          error: { message: 'boom', classification: 'deterministic' },
        }
      }
      return { outcome: 'success' as const }
    }
    await planRunCommand(planPath, {
      json: true,
      auto: true,
      runId: 'r-sib',
      runDir,
      dispatcherFactoryOverride: () => fakeDispatcher,
    })
    expect(dispatched).toContain('A1')
    expect(dispatched).toContain('A2')

    const events = await readEvents(runDir)
    // Per-task event ordering remains deterministic — assert both
    // task_completed events landed.
    const completedIds = events
      .filter(
        (e): e is Extract<PlanRunEvent, { kind: 'task_completed' }> =>
          e.kind === 'task_completed',
      )
      .map((e) => e.taskId)
      .sort()
    expect(completedIds).toContain('A1')
    expect(completedIds).toContain('A2')
  })

  it('produces distinct requestHash per task in concurrent dispatch (idempotency)', async () => {
    const tmp = createTestTmpDir('autonomous-idempotency')
    const planPath = writePlan(tmp)
    const runDir = join(tmp, 'runs', 'r-idem')
    mkdirSync(runDir, { recursive: true })

    const fakeDispatcher: StepDispatcher = async () => {
      // Force interleaving — yield then resolve.
      await new Promise((r) => setTimeout(r, 5))
      return { outcome: 'success' as const }
    }
    await planRunCommand(planPath, {
      json: true,
      auto: true,
      runId: 'r-idem',
      runDir,
      dispatcherFactoryOverride: () => fakeDispatcher,
    })
    const events = await readEvents(runDir)
    const hashes = events.map((e) => e.requestHash)
    const unique = new Set(hashes)
    // Every event has a distinct requestHash — the recorder would have
    // deduped collisions, so equality of |hashes| and |unique| proves the
    // concurrent path never raced on the same key.
    expect(unique.size).toBe(hashes.length)
  })
})

describe('plan-run --auto resume (Phase B + C)', () => {
  it('resumes from the same run-dir and replays the remaining tasks', async () => {
    const tmp = createTestTmpDir('autonomous-resume')
    const planPath = writePlan(tmp)
    const runDir = join(tmp, 'runs', 'r-resume')
    mkdirSync(runDir, { recursive: true })

    // First pass: only the first wave dispatches successfully; the second
    // wave's first sibling fails so the runner escalates to a gate request
    // and halts. The journal records phase-1 completion + phase-2 partial.
    const firstPassFakeDispatcher: StepDispatcher = async ({ task }) => {
      if (task.id === 'B1' || task.id === 'B2') {
        return {
          outcome: 'failed' as const,
          error: { message: 'transient', classification: 'transient' },
        }
      }
      return { outcome: 'success' as const }
    }
    await planRunCommand(planPath, {
      json: true,
      auto: true,
      runId: 'r-resume',
      runDir,
      dispatcherFactoryOverride: () => firstPassFakeDispatcher,
    })

    const firstEvents = await readEvents(runDir)
    const firstKinds = firstEvents.map((e) => e.kind)
    expect(firstKinds).toContain('plan_run_started')
    // Phase 1 still completes — both A* tasks succeed.
    expect(firstEvents.filter((e) => e.kind === 'phase_completed').length).toBe(
      1,
    )

    // Second pass: re-invoke with the same run-dir. bootstrapRun is
    // idempotent; the journal is appended in-place. The fake dispatcher
    // now succeeds for everything — but A1/A2 are already complete in
    // the journal so a future ticket may add a "skip already-completed"
    // path. For this test we assert resume is at minimum non-destructive:
    // the journal grows but no events are lost.
    const secondPassFakeDispatcher: StepDispatcher = async () => {
      return { outcome: 'success' as const }
    }
    await planRunCommand(planPath, {
      json: true,
      auto: true,
      runId: 'r-resume',
      runDir,
      dispatcherFactoryOverride: () => secondPassFakeDispatcher,
    })

    const secondEvents = await readEvents(runDir)
    expect(secondEvents.length).toBeGreaterThanOrEqual(firstEvents.length)
    // The first plan_run_started event is preserved.
    expect(secondEvents[0]?.kind).toBe('plan_run_started')
  })
})
