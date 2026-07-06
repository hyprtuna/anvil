import type { HookHandler, HookResult } from '../../core/types.js'
import { agentRedirectHandler } from './agent-redirect.js'
import { contextMonitorHandler } from './context-monitor.js'
import { gateguardHandler } from './gateguard.js'
import { memoryValidatorHandler } from './memory-validator.js'
import { promptGuardHandler } from './prompt-guard.js'
import { readGuardHandler } from './read-guard.js'
import { rulesInjectorHandler } from './rules-injector.js'
import { taskBannerHandler } from './task-banner.js'
import { workflowGuardHandler } from './workflow-guard.js'

/**
 * Claude Code's PreToolUse event entry point.
 *
 * Multiplexes the v2 security + context handlers (prompt-guard, read-guard,
 * workflow-guard, rules-injector, context-monitor) so they all fire when
 * Claude Code dispatches PreToolUse. Runs them in a fixed priority order:
 * guards first (blocking potential), then advisory.
 *
 * Worst exit code wins. Context objects are merged shallowly (later
 * handlers can overwrite keys produced by earlier ones).
 *
 * Phase G: task-banner is observational/non-blocking and is fired async
 * (setImmediate, does not participate in exit-code aggregation).
 */
export const preToolUseHandler: HookHandler = async (ctx) => {
  // Phase G: task-banner is observational — fire async so it never
  // adds latency to the blocking PreToolUse gate.
  setImmediate(() => {
    Promise.resolve(taskBannerHandler(ctx)).catch(() => {
      // Best-effort; task-banner failures are silent (advisory only)
    })
  })

  const orderedHandlers: Array<{ name: string; handler: HookHandler }> = [
    { name: 'prompt-guard', handler: promptGuardHandler },
    { name: 'read-guard', handler: readGuardHandler },
    // Plan 45 Phase C2 — agent-redirect: deny Task dispatch when subagent_type
    // "anvil:<slug>" resolves to a skill rather than an agent. Self-gating
    // (no-op when workflow.agent_redirect=false). Runs before workflow-guard
    // so the model receives the redirect hint before any workflow gate fires.
    { name: 'agent-redirect', handler: agentRedirectHandler },
    { name: 'workflow-guard', handler: workflowGuardHandler },
    // Plan 39 Phase F — GateGuard: blocks first edit per file until 4 facts
    // observed. Self-gating (no-op when disabled); runs after workflow-guard
    // so the more expensive gate runs first on hard blocks.
    { name: 'gateguard', handler: gateguardHandler },
    // ANV-0125 — memory-validator: blocks edits to CLAUDE.md / AGENTS.md
    // that would violate structural invariants (H1 presence, stub parity
    // for paired files, no dropped table headings). Bypass via
    // ANVIL_ALLOW_RESTRUCTURE=1 for intentional restructuring.
    { name: 'memory-validator', handler: memoryValidatorHandler },
    { name: 'rules-injector', handler: rulesInjectorHandler },
    { name: 'context-monitor', handler: contextMonitorHandler },
  ]

  let worstExit: 0 | 1 | 2 = 0
  const messages: string[] = []
  const mergedContext: Record<string, unknown> = {}

  for (const { name, handler } of orderedHandlers) {
    let result: HookResult
    try {
      result = await handler(ctx)
    } catch (err) {
      messages.push(
        `${name} threw: ${err instanceof Error ? err.message : String(err)}`,
      )
      worstExit = 2
      continue
    }
    if (result.exitCode > worstExit) worstExit = result.exitCode
    if (result.message) messages.push(`${name}: ${result.message}`)
    if (result.context) {
      Object.assign(mergedContext, result.context)
    }
    if (result.exitCode === 2) break // hard stop — don't run later handlers
  }

  return {
    exitCode: worstExit,
    ...(messages.length > 0 ? { message: messages.join('\n') } : {}),
    ...(Object.keys(mergedContext).length > 0
      ? { context: mergedContext }
      : {}),
  }
}
