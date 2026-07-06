/**
 * ANV-0175 Phase B — Real Task() dispatcher for `anvil plan-run --auto`.
 *
 * Layer 4 (commands). Produces a `StepDispatcher` (the function type defined in
 * the layer-0 step-registry) that the `DefaultExecutorStep` consumes when the
 * runner is in auto-mode.
 *
 * Two flavours:
 *
 *   - **Subprocess dispatcher** — spawns a host CLI (`claude` for Claude Code,
 *     `opencode` for OpenCode) with a print-mode invocation that targets the
 *     `anvil:<slug>` subagent referenced by the task's `ticket` (or a generic
 *     worker slug when no ticket is named). Returns `success` on exit code 0,
 *     `failed` otherwise. The host binary path is detected from the env via
 *     simple `which`-style probing; if neither binary is on PATH the dispatcher
 *     falls back to the no-op flavour with a stderr warning so the run still
 *     records observability events.
 *
 *   - **No-op dispatcher** — preserves the pre-Phase-B behaviour: records the
 *     state transition without actually invoking anything. Useful for tests
 *     and for environments where the host CLI is not installed.
 *
 * The selection logic lives in `resolveTaskDispatcher` so a single entry point
 * keeps `plan-run.ts` short.
 *
 * Idempotency note (Phase C): the runner's `startTask` / `completeTask` already
 * derive distinct `requestHash` values per (taskId, attempt) tuple. The
 * dispatcher itself is stateless and re-entrant — concurrent parallel calls
 * with different `task.id` values produce independent subprocess invocations
 * and never share state.
 */

import { spawn } from 'node:child_process'
import type { StepDispatcher } from '../../core/plans/runner/step-registry.js'
import type { PlanTask } from '../../core/plans/schema.js'
import type { RuntimeContext } from '../../core/runtime/context.js'

/** Host kind inferred from the environment. */
export type DispatchHost = 'claude-code' | 'opencode' | 'none'

/** Options that govern dispatcher construction. */
export interface ResolveTaskDispatcherOptions {
  runtime: RuntimeContext
  /** Override host detection. Useful for tests. */
  host?: DispatchHost
  /** Override the binary path discovery (tests only). */
  hostBinary?: string
  /** Override the spawn implementation (tests only). */
  spawnImpl?: SpawnLike
  /** Override the timeout per dispatched call (ms). Default 10 minutes. */
  timeoutMs?: number
  /** When true, never dispatch — return a structured success.
   *  Default depends on `runtime.autoMode`. */
  forceNoop?: boolean
  /** Active plan run directory; threaded into the child env so observers
   *  (cc-task-events) correlate the Task() with the active plan. */
  planRunDir?: string
  /** Active plan run id; same purpose. */
  planRunId?: string
}

/** Narrow surface of `child_process.spawn` we actually use. */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: {
    env: NodeJS.ProcessEnv
    stdio: ['ignore', 'pipe', 'pipe']
  },
) => SpawnedProcess

interface SpawnedProcess {
  on(event: 'exit', listener: (code: number | null) => void): void
  on(event: 'error', listener: (err: Error) => void): void
  kill(signal?: NodeJS.Signals): void
  stdout: { on: (event: 'data', listener: (chunk: Buffer) => void) => void }
  stderr: { on: (event: 'data', listener: (chunk: Buffer) => void) => void }
}

/** Default subprocess timeout — 10 minutes. */
export const DEFAULT_DISPATCH_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Detect the host kind from `process.env`. Honors an explicit override env
 * `ANVIL_DISPATCH_HOST=claude-code|opencode|none` for tests / forced runs.
 *
 *   - `claude-code` when `CLAUDE_CODE=1`, `CLAUDECODE=1`, or `ANTHROPIC_HOST`
 *     looks like a Claude session.
 *   - `opencode` when `OPENCODE=1` or `OPENCODE_HOST=1`.
 *   - `none` otherwise.
 */
export function detectDispatchHost(
  env: NodeJS.ProcessEnv = process.env,
): DispatchHost {
  const override = env.ANVIL_DISPATCH_HOST
  if (
    override === 'claude-code' ||
    override === 'opencode' ||
    override === 'none'
  ) {
    return override
  }
  if (
    env.CLAUDE_CODE === '1' ||
    env.CLAUDECODE === '1' ||
    typeof env.ANTHROPIC_HOST === 'string'
  ) {
    return 'claude-code'
  }
  if (env.OPENCODE === '1' || env.OPENCODE_HOST === '1') return 'opencode'
  return 'none'
}

/**
 * Map a task to a subagent slug. Uses the explicit ticket→slug correspondence
 * when available (`ANV-0175` → `anvil:ultra-worker` by default), otherwise
 * falls back to the generic `anvil:ultra-worker` slug. The ticket-to-agent
 * routing is intentionally simple — the goal is to plumb a real Task() call,
 * not to encode every per-ticket preference. Tickets that need a specific
 * agent can override via `ANVIL_DISPATCH_DEFAULT_AGENT`.
 */
export function resolveSubagentSlug(
  task: PlanTask,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitDefault = env.ANVIL_DISPATCH_DEFAULT_AGENT
  if (typeof explicitDefault === 'string' && explicitDefault.length > 0) {
    return explicitDefault
  }
  // Per-task override via a sentinel ticket prefix would land here in a
  // future ticket; for now `task` is consulted only for its ticket field
  // (already surfaced in the prompt body).
  void task
  // Generic worker for now. A future ticket can add a per-task `agent` field
  // on PlanTask and consult it here.
  return 'anvil:ultra-worker'
}

/** Build the prompt the host CLI hands to the subagent. */
export function buildDispatchPrompt(
  task: PlanTask,
  opts: { planRunId?: string; planRunDir?: string } = {},
): string {
  const lines: string[] = []
  lines.push(`# Plan task: ${task.id} — ${task.title}`)
  lines.push('')
  lines.push(`Type: ${task.type}`)
  lines.push(`Effort: ${task.effort}`)
  if (task.ticket !== undefined) {
    lines.push(`Ticket: ${task.ticket}`)
  }
  if (task.write_scope.length > 0) {
    lines.push(`Write scope: ${task.write_scope.join(', ')}`)
  }
  if (task.verification.length > 0) {
    lines.push('')
    lines.push('Verification commands (run before claiming success):')
    for (const v of task.verification) {
      lines.push(`  - ${v}`)
    }
  }
  if (opts.planRunId !== undefined) {
    lines.push('')
    lines.push(`Plan run id: ${opts.planRunId}`)
  }
  if (opts.planRunDir !== undefined) {
    lines.push(`Plan run dir: ${opts.planRunDir}`)
  }
  lines.push('')
  lines.push(
    'Execute the task end-to-end. Return status: DONE on success, BLOCKED with a reason otherwise.',
  )
  return lines.join('\n')
}

/**
 * Return a `StepDispatcher` according to the resolved runtime.
 *
 *   - When `runtime.autoMode === false` or `opts.forceNoop === true`, returns
 *     a no-op dispatcher that records `outcome: 'success'`.
 *   - When auto-mode is on and a host is detected, returns a subprocess
 *     dispatcher.
 *   - When auto-mode is on but no host is detected, returns a no-op
 *     dispatcher (after writing a one-line stderr notice) so the run can still
 *     complete in tracker mode.
 */
export function resolveTaskDispatcher(
  opts: ResolveTaskDispatcherOptions,
): StepDispatcher {
  const noop = opts.forceNoop === true || opts.runtime.autoMode === false
  if (noop) {
    return makeNoopDispatcher()
  }
  const host = opts.host ?? detectDispatchHost()
  if (host === 'none') {
    process.stderr.write(
      '[anvil:plan-run] --auto requested but no host CLI detected (claude / opencode). Falling back to no-op dispatcher.\n',
    )
    return makeNoopDispatcher()
  }
  const binary = opts.hostBinary ?? defaultBinaryFor(host)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS
  const spawnImpl =
    opts.spawnImpl ?? ((cmd, args, options) => spawn(cmd, args, options))
  return makeSubprocessDispatcher({
    host,
    binary,
    timeoutMs,
    spawnImpl,
    planRunDir: opts.planRunDir,
    planRunId: opts.planRunId,
  })
}

function defaultBinaryFor(host: DispatchHost): string {
  if (host === 'claude-code') return 'claude'
  if (host === 'opencode') return 'opencode'
  return ''
}

function makeNoopDispatcher(): StepDispatcher {
  return async (_input: { task: PlanTask }) => {
    return { outcome: 'success' as const }
  }
}

interface SubprocessDispatcherInputs {
  host: DispatchHost
  binary: string
  timeoutMs: number
  spawnImpl: SpawnLike
  planRunDir?: string
  planRunId?: string
}

function makeSubprocessDispatcher(
  inputs: SubprocessDispatcherInputs,
): StepDispatcher {
  return async ({ task }) => {
    const subagent = resolveSubagentSlug(task)
    const prompt = buildDispatchPrompt(task, {
      planRunId: inputs.planRunId,
      planRunDir: inputs.planRunDir,
    })
    const args = buildHostArgs(inputs.host, subagent, prompt)
    const childEnv = {
      ...process.env,
      ...(inputs.planRunDir !== undefined
        ? { ANVIL_PLAN_RUN_DIR: inputs.planRunDir }
        : {}),
      ...(inputs.planRunId !== undefined
        ? { ANVIL_PLAN_RUN_ID: inputs.planRunId }
        : {}),
    }
    const exit = await runChild(
      inputs.spawnImpl,
      inputs.binary,
      args,
      childEnv,
      inputs.timeoutMs,
    )
    if (exit.timedOut) {
      return {
        outcome: 'failed',
        error: {
          message: `dispatch timed out after ${inputs.timeoutMs}ms`,
          classification: 'transient',
        },
      }
    }
    if (exit.spawnError !== undefined) {
      return {
        outcome: 'failed',
        error: {
          message: `spawn ${inputs.binary} failed: ${exit.spawnError}`,
          classification: 'deterministic',
        },
      }
    }
    if (exit.code === 0) return { outcome: 'success' }
    return {
      outcome: 'failed',
      error: {
        message: `${inputs.binary} exited ${exit.code ?? 'null'}: ${exit.stderr.trim() || exit.stdout.trim().slice(-200)}`,
      },
    }
  }
}

function buildHostArgs(
  host: DispatchHost,
  subagent: string,
  prompt: string,
): string[] {
  // For both hosts we use print mode: a single non-interactive turn whose
  // initial prompt names the subagent in a structured way the host can
  // dispatch via its Agent / Task primitive. The exact prompt shape is
  // best-effort — hosts evolve their flags; the spawn boundary is the
  // testable contract.
  const fullPrompt = `Dispatch the ${subagent} agent with the following payload:\n\n${prompt}`
  if (host === 'claude-code') {
    return ['--print', fullPrompt]
  }
  // opencode
  return ['run', '--print', fullPrompt]
}

interface ChildExit {
  code: number | null
  timedOut: boolean
  spawnError?: string
  stdout: string
  stderr: string
}

function runChild(
  spawnImpl: SpawnLike,
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<ChildExit> {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let child: SpawnedProcess
    try {
      child = spawnImpl(binary, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      resolve({ code: null, timedOut: false, spawnError: msg, stdout, stderr })
      return
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGTERM')
      } catch {
        /* best-effort */
      }
      resolve({ code: null, timedOut: true, stdout, stderr })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        code: null,
        timedOut: false,
        spawnError: err.message,
        stdout,
        stderr,
      })
    })
    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, timedOut: false, stdout, stderr })
    })
  })
}
