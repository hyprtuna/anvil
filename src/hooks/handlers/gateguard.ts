/**
 * GateGuard PreToolUse handler (Plan 39 Phase F; refactored Plan 43 Phase C).
 *
 * Blocks the *first* Edit|Write|MultiEdit per file in a session until 4 facts
 * have been observed (importers, API surface, schema, user instruction). See
 * `./gateguard/policy.ts` for fact-evaluation logic and `./gateguard/state.ts`
 * for the session state tracker. Activation rules live in `./gateguard/config.ts`.
 *
 * Never crashes the session — all disk errors are handled gracefully.
 */

import type { HookHandler, HookResult } from '../../core/types.js'
import { isGateguardEnabled } from './gateguard/config.js'
import { buildBlockMessage, evaluateFacts } from './gateguard/policy.js'
import { loadState, persistState } from './gateguard/state.js'

// ─── Payload extraction ───────────────────────────────────────────────────────

interface PreToolUsePayload {
  tool_name?: string
  tool?: string
  tool_input?: {
    file_path?: string
    path?: string
    edits?: Array<{ file_path?: string; path?: string }>
    [key: string]: unknown
  }
  session_id?: string
  [key: string]: unknown
}

function extractTargetPath(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as PreToolUsePayload
  const input = p.tool_input ?? {}
  const toolName = p.tool_name ?? p.tool ?? ''

  if (toolName === 'MultiEdit') {
    const edits = input.edits
    if (Array.isArray(edits) && edits.length > 0) {
      return edits[0].file_path ?? edits[0].path ?? null
    }
    return null
  }

  return input.file_path ?? input.path ?? null
}

function extractSessionId(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null) {
    const p = payload as PreToolUsePayload
    if (typeof p.session_id === 'string') return p.session_id
  }
  return null
}

// ─── Handler ──────────────────────────────────────────────────────────────────

const ALLOW: HookResult = { exitCode: 0 }

export const gateguardHandler: HookHandler = async (ctx) => {
  const enabled = await isGateguardEnabled(ctx.cwd, ctx.env)
  if (!enabled) return ALLOW

  const targetPath = extractTargetPath(ctx.payload)
  if (!targetPath) return ALLOW

  const sessionId = extractSessionId(ctx.payload)
  if (!sessionId) return ALLOW

  const state = await loadState(sessionId)

  if (state.firstEditsCompleted.includes(targetPath)) {
    return ALLOW
  }

  const factResult = evaluateFacts(targetPath, state)

  if (factResult.satisfied) {
    state.firstEditsCompleted.push(targetPath)
    await persistState(state)
    return {
      exitCode: 0,
      message: `GateGuard: all 4 facts satisfied for "${targetPath}" — edit allowed.`,
    }
  }

  const message = buildBlockMessage(targetPath, factResult.missing)
  return {
    exitCode: 2,
    message,
    context: {
      targetPath,
      missingFacts: factResult.missing.length,
      gateguardBlocked: true,
    },
  }
}
