import chalk from 'chalk'
import type { HookHandler } from '../../core/types.js'

/**
 * PreToolUse sub-handler: prints a colored one-line banner whenever Claude Code
 * is about to dispatch a Task subagent. Gives the user deterministic visibility
 * of delegation events, orthogonal to what any orchestrator skill prints.
 *
 * Format:
 *   ▶ <subagent_type> — <description>
 *
 * Gate: set `ANVIL_TASK_BANNER=off|0|false` in the environment to suppress all
 * output from this handler. Default is ON.
 *
 * Wired into the PreToolUse multiplexer (pre-tool-use.ts) as the last entry so
 * all blocking guards fire before this advisory handler.
 */

/**
 * Narrow typed extractor for the PreToolUse payload. Returns `null` when the
 * payload does not represent a Tool invocation at all.
 */
function readToolCall(payload: unknown): {
  tool: string
  input: Record<string, unknown>
} | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.tool_name !== 'string') return null
  const input =
    typeof p.tool_input === 'object' && p.tool_input !== null
      ? (p.tool_input as Record<string, unknown>)
      : {}
  return { tool: p.tool_name, input }
}

const DISABLED_VALUES = new Set(['off', '0', 'false'])

export const taskBannerHandler: HookHandler = async (ctx) => {
  // Env gate — silence the handler completely when the user opts out.
  const bannerEnv = ctx.env.ANVIL_TASK_BANNER
  if (bannerEnv !== undefined && DISABLED_VALUES.has(bannerEnv)) {
    return { exitCode: 0 }
  }

  const call = readToolCall(ctx.payload)

  // Only act on Task invocations.
  if (call === null || call.tool !== 'Task') {
    return { exitCode: 0 }
  }

  const subagentType =
    typeof call.input.subagent_type === 'string' &&
    call.input.subagent_type.length > 0
      ? call.input.subagent_type
      : 'subagent'

  let description: string
  if (
    typeof call.input.description === 'string' &&
    call.input.description.length > 0
  ) {
    description = call.input.description
  } else if (
    typeof call.input.prompt === 'string' &&
    call.input.prompt.length > 0
  ) {
    const raw = call.input.prompt
    description = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw
  } else {
    description = '(no description)'
  }

  const banner = `▶ ${chalk.cyan(subagentType)} — ${chalk.dim(description)}`

  return { exitCode: 0, message: banner }
}
