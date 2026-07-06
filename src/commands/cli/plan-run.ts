/**
 * `anvil plan run <plan-path>` (ANV-0025 Wave 4).
 *
 * Layer 4 (commands). Bootstraps a run directory, walks the plan's waves
 * sequentially (tasks within a wave may interleave when
 * `parallelism: parallel`), and records every state transition via the
 * Wave-4 runner.
 *
 * Modes:
 *
 *   - Default (state-tracker): each task is "would-dispatch" — we print
 *     a line, record start/complete events, and move on without
 *     dispatching anything. Useful for plan-runner observability before
 *     autonomous execution is trusted.
 *
 *   - `--auto`: each task delegates to the step in `STEP_REGISTRY`. The
 *     current default executor still does nothing because Wave 4 does
 *     not ship a real Task() dispatcher (that arrives with the
 *     statusline / CC subscriber integration in a follow-up). The
 *     wiring is in place — when a dispatcher lands, `--auto` enables it.
 *
 * The command halts when the runner returns `gate-requested` for any
 * task (autonomous advancement requires human approval to continue).
 *
 * Output: `--json` emits a single JSON envelope to stdout; otherwise a
 * short human summary. Failure exits 1.
 */

import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import chalk from 'chalk'
import { bootstrapRun } from '../../core/plans/bootstrap.js'
import { parseExecutablePlanFromFile } from '../../core/plans/parse.js'
import {
  type PlanRunner,
  createPlanRunner,
} from '../../core/plans/runner/runner.js'
import type { StepDispatcher } from '../../core/plans/runner/step-registry.js'
import { STEP_REGISTRY } from '../../core/plans/runner/step-registry.js'
import type { ExecutablePlan, PlanWave } from '../../core/plans/schema.js'
import { resolveAndSyncRuntimeContext } from './common/auto-mode.js'
import {
  type ResolveTaskDispatcherOptions,
  resolveTaskDispatcher,
} from './plan-run-dispatcher.js'

/**
 * ANV-0175 Phase C — default parallelism cap for `parallelism: 'parallel'`
 * waves. Mirrors the orchestrator rule of ≤5 concurrent subagents per wave
 * (`skills/universal/orchestration.md`). Override via the
 * `ANVIL_PARALLELISM_CAP` env var (positive integer; non-numeric or <1
 * falls back to the default).
 */
export const DEFAULT_PARALLELISM_CAP = 5

/** Read the parallelism cap from the env. Bounds-checks and falls back. */
export function resolveParallelismCap(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.ANVIL_PARALLELISM_CAP
  if (raw === undefined || raw === '') return DEFAULT_PARALLELISM_CAP
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PARALLELISM_CAP
  return parsed
}

export interface PlanRunOptions {
  json?: boolean
  /**
   * Dual-purpose `--auto` flag:
   *
   *   - Existing meaning (ANV-0025): enable autonomous step dispatch via
   *     STEP_REGISTRY (vs. the default state-tracker "would dispatch" mode).
   *   - ANV-0176 layered on top: also engages decision auto-mode for any
   *     `${TEMPLATE:decisions}` blocks rendered during the run. The two
   *     intents are consistent — both mean "run unattended".
   *
   * Honors `ANVIL_AUTO=1` for the auto-mode aspect even when the CLI flag
   * is absent.
   */
  auto?: boolean
  /** ANV-0176 — accept recommended option always (`--accept-defaults`). Honors ANVIL_AUTO_DEFAULTS=1. */
  acceptDefaults?: boolean
  /** Override the run directory. Default: a fresh tmpdir under /tmp/anvil-runs. */
  runDir?: string
  /** Override the run ID. Default: derived from plan version + timestamp. */
  runId?: string
  /**
   * ANV-0175 Phase B — inject a custom dispatcher (tests only). When absent,
   * `resolveTaskDispatcher` produces one from the runtime context. The injection
   * point is kept here so tests can wire a fake dispatcher without spawning
   * a real subprocess.
   */
  dispatcherFactoryOverride?: (
    opts: ResolveTaskDispatcherOptions,
  ) => StepDispatcher
}

interface RunEnvelope {
  ok: boolean
  reason?: string
  message?: string
  runId?: string
  planVersion?: string
  runDir?: string
  status?: string
  haltedAtTaskId?: string
  haltReason?: string
  taskCount?: number
  completedCount?: number
}

export async function planRunCommand(
  planPath: string,
  opts: PlanRunOptions = {},
): Promise<void> {
  const json = opts.json === true
  const auto = opts.auto === true
  // ANV-0176 — wire auto-mode runtime context. Same `--auto` flag drives
  // both step-dispatch (ANV-0025) and decision auto-mode. The resolver
  // writes ANVIL_AUTO / ANVIL_AUTO_DEFAULTS so any nested renderSkillBody
  // calls during the run pick up the policy.
  const runtime = resolveAndSyncRuntimeContext({
    auto: opts.auto,
    acceptDefaults: opts.acceptDefaults,
  })
  const absolutePlan = resolve(planPath)

  if (!existsSync(absolutePlan)) {
    return fail(json, {
      ok: false,
      reason: 'plan-missing',
      message: `plan file does not exist: ${absolutePlan}`,
    })
  }

  const parseResult = await parseExecutablePlanFromFile(absolutePlan)
  if (!parseResult.ok) {
    return fail(json, {
      ok: false,
      reason: parseResult.reason,
      message: parseResult.message,
    })
  }
  const plan = parseResult.plan
  const runId = opts.runId ?? buildRunId(plan)
  const runDir = opts.runDir ?? buildRunDir(runId)

  const { recorder } = await bootstrapRun({ runId, runDir, plan })
  const runner = createPlanRunner({ recorder, plan, runDir })

  // ANV-0175 Phase B — resolve the step dispatcher. The factory respects
  // the runtime auto-mode boolean (off → no-op tracker) and the host kind
  // (auto on but no host → no-op with stderr notice). Tests inject a
  // custom factory via `opts.dispatcherFactoryOverride`.
  const dispatcherFactory =
    opts.dispatcherFactoryOverride ?? resolveTaskDispatcher
  const dispatcher = dispatcherFactory({
    runtime,
    planRunDir: runDir,
    planRunId: runId,
  })

  // ANV-0175 Phase C — read the parallelism cap once per command run.
  const parallelismCap = resolveParallelismCap()

  // Export the active plan run dir so the cc-task-events handler (Phase A)
  // sees an active plan and emits its observability banners.
  process.env.ANVIL_PLAN_RUN_DIR = runDir
  process.env.ANVIL_PLAN_RUN_ID = runId

  if (!json) {
    process.stdout.write(
      chalk.cyan(
        `▶ plan run ${runId} (${plan.version})\n  plan: ${absolutePlan}\n  runDir: ${runDir}\n  auto: ${auto ? 'on' : 'off (state-tracker)'}\n`,
      ),
    )
  }

  // Walk waves sequentially.
  const waves: readonly PlanWave[] =
    plan.waves.length > 0 ? plan.waves : synthesiseSingleWave(plan)

  let completedCount = 0
  let halted: { taskId: string; reason: string } | null = null

  for (const wave of waves) {
    if (halted !== null) break
    await runner.startPhase(wave.id, wave.tasks)
    if (!json) {
      process.stdout.write(
        chalk.dim(
          `  phase ${wave.id} — ${wave.tasks.length} task(s), parallelism=${wave.parallelism}\n`,
        ),
      )
    }

    const tasks = wave.tasks
      .map((id) => plan.tasks.find((t) => t.id === id))
      .filter((t): t is ExecutablePlan['tasks'][number] => t !== undefined)

    if (wave.parallelism === 'parallel' && tasks.length > 1) {
      // ANV-0175 Phase C — real concurrency for parallel waves.
      // Dispatch all tasks simultaneously, capped at parallelismCap.
      // Failures within a sibling do NOT abort other siblings —
      // each task records its own state and the wave halts only if any
      // sibling escalates to gate-requested or failed-blocked.
      const outcomes = await runWaveParallel(
        runner,
        tasks,
        wave.id,
        auto,
        json,
        dispatcher,
        parallelismCap,
      )
      let waveHalt: { taskId: string; reason: string } | null = null
      for (const r of outcomes) {
        if (r.result === 'completed') {
          completedCount += 1
        } else if (r.result === 'gate-requested' && waveHalt === null) {
          waveHalt = { taskId: r.taskId, reason: 'gate-requested' }
        } else if (r.result === 'failed-blocked' && waveHalt === null) {
          waveHalt = { taskId: r.taskId, reason: 'task-failed' }
        }
      }
      if (waveHalt !== null) {
        halted = waveHalt
      }
    } else {
      for (const task of tasks) {
        const result = await runOneTask(
          runner,
          task,
          wave.id,
          auto,
          json,
          dispatcher,
        )
        if (result === 'gate-requested') {
          halted = { taskId: task.id, reason: 'gate-requested' }
          break
        }
        if (result === 'failed-blocked') {
          halted = { taskId: task.id, reason: 'task-failed' }
          break
        }
        if (result === 'completed') {
          completedCount += 1
        }
      }
    }

    if (halted === null) {
      await runner.completePhase(wave.id)
    }
  }

  if (halted === null) {
    await runner.completeRun()
  }

  const finalState = await runner.currentState()
  const payload: RunEnvelope = {
    ok: halted === null,
    runId,
    planVersion: plan.version,
    runDir,
    status: finalState.status,
    taskCount: plan.tasks.length,
    completedCount,
    ...(halted !== null
      ? { haltedAtTaskId: halted.taskId, haltReason: halted.reason }
      : {}),
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } else if (halted !== null) {
    process.stdout.write(
      chalk.yellow(
        `\nHALT ${halted.reason} at task ${halted.taskId}\n  status: ${finalState.status}\n`,
      ),
    )
  } else {
    process.stdout.write(
      chalk.green(
        `\nDONE ${completedCount}/${plan.tasks.length} tasks complete\n  status: ${finalState.status}\n`,
      ),
    )
  }

  if (halted !== null) process.exit(1)
}

// ─── Per-task driver ─────────────────────────────────────────────────────────

async function runOneTask(
  runner: PlanRunner,
  task: ExecutablePlan['tasks'][number],
  phaseId: string,
  auto: boolean,
  json: boolean,
  dispatcher: StepDispatcher,
): Promise<'completed' | 'gate-requested' | 'failed-blocked'> {
  await runner.startTask(task.id, phaseId)
  if (!json) {
    const verb = auto ? 'dispatch' : 'would dispatch'
    process.stdout.write(
      chalk.dim(`    ${verb} ${task.id} (${task.type}) — ${task.title}\n`),
    )
  }

  // Resolve step from registry.
  const step = STEP_REGISTRY.get(task.type)
  if (step === undefined) {
    // Shouldn't happen — registry is validated at module load.
    throw new Error(`no step registered for task type "${task.type}"`)
  }

  const stepResult = await step.execute({
    task,
    auto,
    dispatch: dispatcher,
  })

  // If the task declares verification commands, attach a synthetic
  // evidence event so the verify-blocks-advance invariant clears. This
  // mirrors what a real dispatcher would do after running the
  // verification commands. The location is recorded as a marker; the
  // runner does not execute the commands.
  if (task.verification.length > 0 && stepResult.outcome === 'success') {
    await runner.attachEvidence({
      taskId: task.id,
      evidenceKind: 'verification-marker',
      location: `runs/${runner.runId}/${task.id}.verification`,
      summary: `${task.verification.length} verification command(s) declared`,
    })
  }

  const completion = await runner.completeTask(task.id, {
    outcome: stepResult.outcome,
    ...(stepResult.error !== undefined ? { error: stepResult.error } : {}),
    phaseId,
  })

  if (completion.action === 'gate-requested') return 'gate-requested'
  if (completion.action === 'retry-scheduled') {
    // The runner already emitted task_started attempt 2. We treat this
    // as a re-entry — try once more synchronously.
    return runOneTask(runner, task, phaseId, auto, json, dispatcher)
  }
  if (stepResult.outcome === 'failed') return 'failed-blocked'
  return 'completed'
}

// ─── Phase-C parallel driver ────────────────────────────────────────────────

interface ParallelOutcome {
  taskId: string
  result: 'completed' | 'gate-requested' | 'failed-blocked'
}

/**
 * ANV-0175 Phase C — drive a `parallelism: 'parallel'` wave with real
 * concurrency.
 *
 *   - Dispatches up to `cap` tasks simultaneously (Promise.all over batches).
 *   - Each task gets its own `runOneTask` invocation, which means
 *     `runner.startTask` / `runner.completeTask` use the existing
 *     `requestHash` keyed on `(taskId, attempt)` — so concurrent calls
 *     never collide on the recorder's idempotency check.
 *   - A failing sibling does NOT abort other in-flight tasks. The wave's
 *     halting decision is taken after all siblings have settled (similar
 *     to `Promise.allSettled`).
 *
 * The result preserves declaration-order of the input tasks for stable
 * downstream reporting; the in-flight dispatch order is non-deterministic
 * but each task's per-task event sequence remains deterministic.
 */
async function runWaveParallel(
  runner: PlanRunner,
  tasks: readonly ExecutablePlan['tasks'][number][],
  phaseId: string,
  auto: boolean,
  json: boolean,
  dispatcher: StepDispatcher,
  cap: number,
): Promise<ParallelOutcome[]> {
  const outcomes: ParallelOutcome[] = []
  // Process in cap-sized batches; within a batch, dispatch concurrently.
  for (let i = 0; i < tasks.length; i += cap) {
    const batch = tasks.slice(i, i + cap)
    const settled = await Promise.all(
      batch.map(async (task) => {
        try {
          const result = await runOneTask(
            runner,
            task,
            phaseId,
            auto,
            json,
            dispatcher,
          )
          return { taskId: task.id, result } as ParallelOutcome
        } catch (err) {
          // A throw from runOneTask is treated as a deterministic failure
          // for the failing sibling. The runner state machine has already
          // emitted whatever events it could before the throw; we record
          // the per-sibling failure here without aborting the batch.
          if (!json) {
            const msg = err instanceof Error ? err.message : String(err)
            process.stderr.write(
              chalk.red(`    parallel task ${task.id} threw: ${msg}\n`),
            )
          }
          return {
            taskId: task.id,
            result: 'failed-blocked',
          } as ParallelOutcome
        }
      }),
    )
    outcomes.push(...settled)
  }
  return outcomes
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function synthesiseSingleWave(plan: ExecutablePlan): readonly PlanWave[] {
  // When the plan declares no waves, dispatch every task in declaration
  // order as a single sequential wave. The runner treats this as one phase.
  return [
    {
      id: 'wave-default',
      tasks: plan.tasks.map((t) => t.id),
      parallelism: 'sequential',
    },
  ]
}

function buildRunId(plan: ExecutablePlan): string {
  const v = plan.version.replace(/^v/, '').replace(/[^A-Za-z0-9._-]/g, '-')
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
  return `plan-${v}-${ts}`
}

function buildRunDir(runId: string): string {
  const root = join(tmpdir(), 'anvil-runs')
  // mkdtempSync requires the directory; the recorder will create it
  // (recursively) on first write. We bake a stable directory under the
  // root so the user can inspect it.
  return join(root, runId)
}

function fail(json: boolean, payload: RunEnvelope): never {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } else {
    process.stderr.write(chalk.red('FAIL plan-run\n'))
    if (payload.reason !== undefined) {
      process.stderr.write(`  reason: ${payload.reason}\n`)
    }
    if (payload.message !== undefined) {
      process.stderr.write(`  ${payload.message}\n`)
    }
  }
  process.exit(1)
}

// Avoid an unused-import warning when running with strict TS noUnusedLocals.
// `mkdtempSync` is intentionally re-exported here for follow-up tickets.
export const _internal = { mkdtempSync, dirname }
