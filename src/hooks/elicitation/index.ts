/**
 * ANV-0037 — MCP `Elicitation` event subscription scaffolding.
 *
 * Minimal in-process registry. The host runtime (Claude Code / OpenCode) is
 * the actual source of Elicitation events; Anvil only carries the type
 * contract and provides a place to register handlers that the host (or a
 * future adapter) can dispatch into. Lifecycle of MCP servers themselves is
 * out of scope for this release — Anvil declares only.
 */
import type {
  Elicitation,
  ElicitationHandler,
  ElicitationResult,
  ElicitationSubscription,
} from '../../core/types.js'

const handlers = new Set<ElicitationHandler>()

/** Register a handler invoked for every incoming Elicitation event. */
export function registerElicitationHandler(
  handler: ElicitationHandler,
): ElicitationSubscription {
  handlers.add(handler)
  return {
    unsubscribe(): void {
      handlers.delete(handler)
    },
  }
}

/**
 * Dispatch an Elicitation event to every registered handler. Returns the
 * first non-cancelled handler result, or a synthetic cancelled result if
 * no handler is registered. Used by the host adapter when an MCP server
 * raises an Elicitation.
 */
export async function dispatchElicitation(
  event: Elicitation,
): Promise<ElicitationResult> {
  for (const handler of handlers) {
    const result = await handler(event)
    if (!result.cancelled) return result
  }
  return {
    type: 'elicitation-result',
    serverName: event.serverName,
    toolName: event.toolName,
    cancelled: true,
    value: undefined,
  }
}

/** Test helper — clear all registered handlers. */
export function resetElicitationRegistry(): void {
  handlers.clear()
}
