/**
 * GateGuard state tracker (Plan 39 Phase F).
 *
 * Combined PostToolUse + UserPromptSubmit handler that tracks observable facts
 * into a session-scoped state file at `~/.anvil/state/gateguard-<sessionId>.json`.
 *
 * Facts tracked:
 *  - PostToolUse Read  → state.reads grows (feeds fact 2 + fact 3)
 *  - PostToolUse Grep  → state.greps grows (feeds fact 1)
 *  - PostToolUse Glob  → state.globs grows (feeds fact 1)
 *  - UserPromptSubmit  → state.userPromptSubmitted = true (feeds fact 4)
 *
 * 24h TTL on the state file: stale files are deleted and recreated.
 * Per-process Map<sessionId, GateGuardState> cache avoids disk hits on every event.
 *
 * Never blocks (exitCode 0 always). Best-effort: any disk error is silently
 * ignored so the tracker never crashes the agent session.
 */

import { mkdirSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { safeWrite } from '../../../core/io/safe-write.js'
import type { HookHandler, HookResult } from '../../../core/types.js'

// ─── State shape ─────────────────────────────────────────────────────────────

export interface GateGuardState {
  sessionId: string
  startedAt: string
  userPromptSubmitted: boolean
  reads: Array<{ path: string; at: string }>
  greps: Array<{ pattern: string; at: string }>
  globs: Array<{ pattern: string; at: string }>
  firstEditsCompleted: string[]
}

// ─── Module-level cache ───────────────────────────────────────────────────────

const STATE_CACHE = new Map<string, GateGuardState>()
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// ─── State file path ──────────────────────────────────────────────────────────

export function stateDir(): string {
  return join(homedir(), '.anvil', 'state')
}

export function stateFilePath(sessionId: string): string {
  return join(stateDir(), `gateguard-${sessionId}.json`)
}

// ─── State persistence ────────────────────────────────────────────────────────

function ensureStateDir(): void {
  mkdirSync(stateDir(), { recursive: true })
}

function isStale(filePath: string): boolean {
  try {
    const stats = statSync(filePath)
    const age = Date.now() - stats.mtimeMs
    return age > TTL_MS
  } catch {
    return false // can't stat → not stale (missing)
  }
}

function deleteStale(filePath: string): void {
  try {
    rmSync(filePath, { force: true })
  } catch {
    // best-effort
  }
}

export function emptyState(sessionId: string): GateGuardState {
  return {
    sessionId,
    startedAt: new Date().toISOString(),
    userPromptSubmitted: false,
    reads: [],
    greps: [],
    globs: [],
    firstEditsCompleted: [],
  }
}

export async function loadState(sessionId: string): Promise<GateGuardState> {
  // Check cache first
  const cached = STATE_CACHE.get(sessionId)
  if (cached) return cached

  const filePath = stateFilePath(sessionId)

  // TTL check — delete stale files
  if (isStale(filePath)) {
    deleteStale(filePath)
    const fresh = emptyState(sessionId)
    STATE_CACHE.set(sessionId, fresh)
    return fresh
  }

  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as GateGuardState
    STATE_CACHE.set(sessionId, parsed)
    return parsed
  } catch {
    // Missing or corrupt — start fresh
    const fresh = emptyState(sessionId)
    STATE_CACHE.set(sessionId, fresh)
    return fresh
  }
}

export async function persistState(state: GateGuardState): Promise<void> {
  STATE_CACHE.set(state.sessionId, state)
  try {
    ensureStateDir()
    // Reads/greps/globs are pruned to 200/500/500 entries upstream — generous
    // 512 KB cap covers worst-case payload while still refusing oversize.
    safeWrite(stateFilePath(state.sessionId), JSON.stringify(state, null, 2), {
      maxBytes: 512 * 1024,
    })
  } catch {
    // best-effort
  }
}

// ─── Payload type guards ──────────────────────────────────────────────────────

interface PostToolUsePayload {
  tool_name?: string
  tool?: string
  tool_input?: {
    file_path?: string
    path?: string
    pattern?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function getSessionId(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>
    if (typeof p.session_id === 'string') return p.session_id
  }
  return null
}

function getToolName(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null) {
    const p = payload as PostToolUsePayload
    return p.tool_name ?? p.tool ?? null
  }
  return null
}

function getToolInput(payload: unknown): PostToolUsePayload['tool_input'] {
  if (typeof payload === 'object' && payload !== null) {
    const p = payload as PostToolUsePayload
    return p.tool_input ?? {}
  }
  return {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────

const NOOP: HookResult = { exitCode: 0 }

/**
 * Unified PostToolUse + UserPromptSubmit handler.
 *
 * For PostToolUse with Read|Grep|Glob tools: appends to the appropriate
 * arrays in the session state file.
 *
 * For UserPromptSubmit: sets userPromptSubmitted = true.
 *
 * For any other invocation: no-op (exitCode 0).
 */
export const gateguardStateHandler: HookHandler = async (ctx) => {
  const sessionId = getSessionId(ctx.payload)
  if (!sessionId) return NOOP

  const kind = ctx.kind

  // UserPromptSubmit
  if (kind === 'user-prompt-submit') {
    const state = await loadState(sessionId)
    if (!state.userPromptSubmitted) {
      state.userPromptSubmitted = true
      await persistState(state)
    }
    return NOOP
  }

  // PostToolUse
  if (kind === 'post-tool-use') {
    const toolName = getToolName(ctx.payload)
    const input = getToolInput(ctx.payload)
    const at = new Date().toISOString()

    if (toolName === 'Read') {
      const path = input?.file_path ?? input?.path ?? ''
      if (!path) return NOOP
      const state = await loadState(sessionId)
      // Idempotent: don't add duplicates for exact same path
      const alreadyTracked = state.reads.some((r) => r.path === path)
      if (!alreadyTracked) {
        state.reads.push({ path, at })
        // Prune to last 200 reads to prevent unbounded growth
        if (state.reads.length > 200) state.reads = state.reads.slice(-200)
        await persistState(state)
      }
      return NOOP
    }

    if (toolName === 'Grep') {
      const pattern = input?.pattern ?? ''
      if (!pattern) return NOOP
      const state = await loadState(sessionId)
      state.greps.push({ pattern: String(pattern), at })
      if (state.greps.length > 500) state.greps = state.greps.slice(-500)
      await persistState(state)
      return NOOP
    }

    if (toolName === 'Glob') {
      const pattern = input?.pattern ?? input?.file_path ?? ''
      if (!pattern) return NOOP
      const state = await loadState(sessionId)
      state.globs.push({ pattern: String(pattern), at })
      if (state.globs.length > 500) state.globs = state.globs.slice(-500)
      await persistState(state)
      return NOOP
    }
  }

  return NOOP
}

// ─── Cache reset (exposed for testing) ───────────────────────────────────────

export function resetStateCache(): void {
  STATE_CACHE.clear()
}
