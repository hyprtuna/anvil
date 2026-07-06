/**
 * Claude Code Task() lifecycle subscriber (ANV-0025 Wave 4).
 *
 * Layer 2 (hooks). Best-effort observer: when the host adapter is Claude
 * Code and a plan run is active for the session, this handler observes
 * Task() dispatches and emits informational events back into the plan
 * journal so reports can correlate Anvil tasks with CC Task() invocations.
 *
 * Wave-4 scope:
 *   - PreToolUse path (Task creation): log a banner so the operator sees
 *     the correlation. We do NOT mutate plan state here — the runner's
 *     state machine owns startTask/completeTask emission.
 *   - SubagentStop path (Task completion): same; best-effort log only.
 *
 * Why best-effort: the host adapter is OPTIONAL. If no plan is active,
 * the handler is a no-op. If the active plan path is unreadable, we log
 * a one-line warn and continue — never block.
 *
 * Env gate: set `ANVIL_CC_TASK_EVENTS=off` to silence. Default is ON.
 *
 * Note: this handler reads `ctx.env.ANVIL_PLAN_RUN_DIR` to detect an
 * active plan run. The CLI (`anvil plan run`) exports this var into the
 * environment when it launches a session; absent the var, the handler
 * is a no-op.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HookHandler } from '../../core/types.js'

const DISABLED_VALUES = new Set(['off', '0', 'false'])

/** Narrow extractor: returns the Task() invocation payload, or null. */
function readTaskInvocation(payload: unknown): {
  subagent_type?: string
  description?: string
  prompt?: string
} | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (p.tool_name !== 'Task') return null
  const input =
    typeof p.tool_input === 'object' && p.tool_input !== null
      ? (p.tool_input as Record<string, unknown>)
      : {}
  return {
    subagent_type:
      typeof input.subagent_type === 'string' ? input.subagent_type : undefined,
    description:
      typeof input.description === 'string' ? input.description : undefined,
    prompt: typeof input.prompt === 'string' ? input.prompt : undefined,
  }
}

/**
 * Look up the active plan run from the env. Returns null when there is no
 * active run (env var absent, dir missing, plan snapshot unreadable).
 */
function activeRunSnapshot(env: Record<string, string>): {
  runDir: string
  runId: string | null
} | null {
  const runDir = env.ANVIL_PLAN_RUN_DIR
  if (typeof runDir !== 'string' || runDir.length === 0) return null
  if (!existsSync(runDir)) return null
  // We don't parse plan.yml here — we only care that a run is active.
  // Reading state.yml is cheap; runId is the only field we want.
  const statePath = join(runDir, 'state.yml')
  if (!existsSync(statePath)) {
    return { runDir, runId: null }
  }
  try {
    const raw = readFileSync(statePath, 'utf-8')
    const parsed = JSON.parse(raw) as { runId?: unknown }
    const runId = typeof parsed.runId === 'string' ? parsed.runId : null
    return { runDir, runId }
  } catch {
    return { runDir, runId: null }
  }
}

/**
 * PreToolUse hook entry: logs Task() dispatch when a plan run is active.
 *
 * Returns `exitCode: 0` unconditionally — this is observational. Failures
 * are silent (the runner never depends on this handler succeeding).
 */
export const ccTaskCreatedHandler: HookHandler = async (ctx) => {
  // Env gate.
  const flag = ctx.env.ANVIL_CC_TASK_EVENTS
  if (flag !== undefined && DISABLED_VALUES.has(flag)) {
    return { exitCode: 0 }
  }

  const active = activeRunSnapshot(ctx.env)
  if (active === null) return { exitCode: 0 }

  const invocation = readTaskInvocation(ctx.payload)
  if (invocation === null) return { exitCode: 0 }

  const subagent = invocation.subagent_type ?? '(unknown)'
  const desc = invocation.description ?? truncate(invocation.prompt ?? '', 60)
  const runTag = active.runId ?? '(no-run-id)'

  return {
    exitCode: 0,
    message: `plan-run:${runTag} observed Task → ${subagent} — ${desc}`,
    context: {
      planRunDir: active.runDir,
      planRunId: active.runId,
      ccTaskSubagent: subagent,
    },
  }
}

/**
 * SubagentStop hook entry: logs Task() completion when a plan run is active.
 *
 * Same best-effort contract as the create path. Never blocks.
 */
export const ccTaskCompletedHandler: HookHandler = async (ctx) => {
  const flag = ctx.env.ANVIL_CC_TASK_EVENTS
  if (flag !== undefined && DISABLED_VALUES.has(flag)) {
    return { exitCode: 0 }
  }

  const active = activeRunSnapshot(ctx.env)
  if (active === null) return { exitCode: 0 }

  return {
    exitCode: 0,
    message: `plan-run:${active.runId ?? '(no-run-id)'} observed subagent stop`,
    context: {
      planRunDir: active.runDir,
      planRunId: active.runId,
    },
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}
