import { parseLeadingMention } from './mention.js'
import type { ParsedAgent } from './schema.js'
import { appendTelemetry } from './telemetry.js'

/** Marker prefix for the injected agent persona system message (D-05). */
export function agentMarker(slug: string): string {
  return `<!-- anvil:agent:${slug} -->`
}

/** Marker prefix for unknown-agent warning system message. */
export function unknownMarker(slug: string): string {
  return `<!-- anvil:agent:unknown:${slug} -->`
}

/**
 * Options for dispatchAgent.
 */
export interface DispatchOptions {
  /**
   * Override for the logs directory (passed to appendTelemetry in tests).
   */
  logsDir?: string
}

/**
 * Apply leading-mention agent dispatch to the incoming message array (D-03).
 *
 * Pipeline:
 * 1. If first message is not a user message → pass through.
 * 2. Parse leading `@anvil:<slug>` mention from first user message.
 * 3. No match → pass through.
 * 4. Unknown slug → prepend warning system message; leave user message intact.
 * 5. Known slug + marker not already present → prepend persona system message;
 *    replace first user message content with stripped `rest`.
 * 6. Marker already present → no-op (idempotency guard, D-05).
 * 7. On dispatch (step 5) → call appendTelemetry best-effort (D-11).
 *
 * @param messages - Raw message array from OpenCode transform hook.
 * @param agents   - Loaded agent registry (Map<slug, ParsedAgent>).
 * @param options  - Optional overrides (logsDir for tests).
 * @returns Transformed message array.
 */
export async function dispatchAgent(
  messages: Array<{ role: string; content: string } & Record<string, unknown>>,
  agents: Map<string, ParsedAgent>,
  options: DispatchOptions = {},
): Promise<Array<{ role: string; content: string } & Record<string, unknown>>> {
  // Step 1: Find the first user message.
  // Note: the routing directive (system message) may already be prepended when
  // dispatchAgent is called from the transform pipeline, so we look for the
  // first user message rather than requiring messages[0].role === 'user'.
  const firstUserIdx = messages.findIndex((m) => m.role === 'user')
  if (firstUserIdx === -1) return messages

  const firstUser = messages[firstUserIdx]

  // Step 2: Parse leading mention from the first user message.
  const mention = parseLeadingMention(firstUser.content)
  if (!mention) return messages

  const { slug, rest } = mention

  // Step 3: Check for existing marker (idempotency, D-05).
  const hasMarker = messages.some(
    (m) =>
      typeof m.content === 'string' &&
      (m.content.includes(agentMarker(slug)) ||
        m.content.includes(unknownMarker(slug))),
  )
  if (hasMarker) return messages

  // Step 4: Unknown slug — warning passthrough.
  // The warning system message is inserted just before the first user message.
  const agent = agents.get(slug)
  if (!agent) {
    const warningContent = `${unknownMarker(slug)}\nUnknown Anvil agent \`${slug}\` — passing through.`
    return [
      ...messages.slice(0, firstUserIdx),
      { role: 'system', content: warningContent },
      ...messages.slice(firstUserIdx),
    ]
  }

  // Step 5: Known slug — inject persona and strip prefix from user message.
  // The persona system message is inserted just before the first user message,
  // so the ordering in the full array is: routing → agent-persona → user.
  const toolsLine =
    agent.tools && agent.tools.length > 0
      ? `\nThis agent prefers tools: ${agent.tools.join(', ')}.`
      : ''
  const personaContent = `${agentMarker(slug)}\nYou are now operating as the @anvil:${slug} agent. Follow its instructions for this turn.${toolsLine}\n\n${agent.systemBody}`

  const updatedFirstUser = { ...firstUser, content: rest }

  // Step 7: Telemetry (best-effort, D-11).
  await appendTelemetry(slug, options.logsDir)

  return [
    ...messages.slice(0, firstUserIdx),
    { role: 'system', content: personaContent },
    updatedFirstUser,
    ...messages.slice(firstUserIdx + 1),
  ]
}
