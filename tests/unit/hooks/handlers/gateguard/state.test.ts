/**
 * Tests for gateguard-state.ts — PostToolUse + UserPromptSubmit event tracker.
 * Plan 39 Phase F.
 */
import { rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../../src/core/config/defaults.js'
import {
  emptyState,
  gateguardStateHandler,
  loadState,
  persistState,
  resetStateCache,
  stateFilePath,
} from '../../../../../src/hooks/handlers/gateguard/state.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(kind: string, payload: unknown) {
  return {
    kind: kind as import('../../../../../src/core/types.js').HookKind,
    cwd: '/tmp/test-cwd',
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

const SESSION_A = 'test-session-a'
const SESSION_B = 'test-session-b'

function cleanStateFile(sessionId: string) {
  try {
    rmSync(stateFilePath(sessionId), { force: true })
  } catch {
    // ignore
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  resetStateCache()
  cleanStateFile(SESSION_A)
  cleanStateFile(SESSION_B)
})

afterEach(() => {
  resetStateCache()
  cleanStateFile(SESSION_A)
  cleanStateFile(SESSION_B)
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('gateguard-state: emptyState()', () => {
  it('returns a blank state with correct sessionId', () => {
    const s = emptyState(SESSION_A)
    expect(s.sessionId).toBe(SESSION_A)
    expect(s.userPromptSubmitted).toBe(false)
    expect(s.reads).toEqual([])
    expect(s.greps).toEqual([])
    expect(s.globs).toEqual([])
    expect(s.firstEditsCompleted).toEqual([])
    expect(s.startedAt).toBeTruthy()
  })
})

describe('gateguard-state: persist + load round-trip', () => {
  it('persists and reads back state correctly', async () => {
    const state = emptyState(SESSION_A)
    state.reads.push({ path: '/src/foo.ts', at: new Date().toISOString() })
    await persistState(state)

    resetStateCache()
    const loaded = await loadState(SESSION_A)
    expect(loaded.reads).toHaveLength(1)
    expect(loaded.reads[0].path).toBe('/src/foo.ts')
  })

  it('returns empty state for unknown session', async () => {
    const loaded = await loadState('nonexistent-session-xyz')
    expect(loaded.reads).toEqual([])
    expect(loaded.userPromptSubmitted).toBe(false)
  })
})

describe('gateguard-state: PostToolUse Read', () => {
  it('appends to state.reads on Read tool', async () => {
    const ctx = makeCtx('post-tool-use', {
      session_id: SESSION_A,
      tool_name: 'Read',
      tool_input: { file_path: '/src/core/types.ts' },
    })
    const result = await gateguardStateHandler(ctx)
    expect(result.exitCode).toBe(0)

    resetStateCache()
    const state = await loadState(SESSION_A)
    expect(state.reads).toHaveLength(1)
    expect(state.reads[0].path).toBe('/src/core/types.ts')
  })

  it('deduplicates identical Read paths', async () => {
    const ctx = makeCtx('post-tool-use', {
      session_id: SESSION_A,
      tool_name: 'Read',
      tool_input: { file_path: '/src/core/types.ts' },
    })
    await gateguardStateHandler(ctx)
    await gateguardStateHandler(ctx)

    resetStateCache()
    const state = await loadState(SESSION_A)
    expect(state.reads).toHaveLength(1)
  })
})

describe('gateguard-state: PostToolUse Grep', () => {
  it('appends to state.greps on Grep tool', async () => {
    const ctx = makeCtx('post-tool-use', {
      session_id: SESSION_A,
      tool_name: 'Grep',
      tool_input: { pattern: 'importFoo' },
    })
    const result = await gateguardStateHandler(ctx)
    expect(result.exitCode).toBe(0)

    resetStateCache()
    const state = await loadState(SESSION_A)
    expect(state.greps).toHaveLength(1)
    expect(state.greps[0].pattern).toBe('importFoo')
  })
})

describe('gateguard-state: PostToolUse Glob', () => {
  it('appends to state.globs on Glob tool', async () => {
    const ctx = makeCtx('post-tool-use', {
      session_id: SESSION_A,
      tool_name: 'Glob',
      tool_input: { pattern: 'src/**/*.ts' },
    })
    const result = await gateguardStateHandler(ctx)
    expect(result.exitCode).toBe(0)

    resetStateCache()
    const state = await loadState(SESSION_A)
    expect(state.globs).toHaveLength(1)
    expect(state.globs[0].pattern).toBe('src/**/*.ts')
  })
})

describe('gateguard-state: UserPromptSubmit', () => {
  it('sets userPromptSubmitted = true on UserPromptSubmit', async () => {
    const ctx = makeCtx('user-prompt-submit', {
      session_id: SESSION_A,
      prompt: 'implement the feature',
    })
    const result = await gateguardStateHandler(ctx)
    expect(result.exitCode).toBe(0)

    resetStateCache()
    const state = await loadState(SESSION_A)
    expect(state.userPromptSubmitted).toBe(true)
  })

  it('is idempotent: multiple UserPromptSubmit calls do not create duplicate entries', async () => {
    const ctx = makeCtx('user-prompt-submit', {
      session_id: SESSION_A,
      prompt: 'do something',
    })
    await gateguardStateHandler(ctx)
    await gateguardStateHandler(ctx)

    resetStateCache()
    const state = await loadState(SESSION_A)
    expect(state.userPromptSubmitted).toBe(true)
    // firstEditsCompleted should remain empty — userPromptSubmitted is a boolean
    expect(state.firstEditsCompleted).toEqual([])
  })
})

describe('gateguard-state: multi-session isolation', () => {
  it('two session IDs produce two independent state files', async () => {
    await gateguardStateHandler(
      makeCtx('post-tool-use', {
        session_id: SESSION_A,
        tool_name: 'Read',
        tool_input: { file_path: '/src/foo.ts' },
      }),
    )
    await gateguardStateHandler(
      makeCtx('post-tool-use', {
        session_id: SESSION_B,
        tool_name: 'Read',
        tool_input: { file_path: '/src/bar.ts' },
      }),
    )

    resetStateCache()
    const stateA = await loadState(SESSION_A)
    const stateB = await loadState(SESSION_B)
    expect(stateA.reads.map((r) => r.path)).toEqual(['/src/foo.ts'])
    expect(stateB.reads.map((r) => r.path)).toEqual(['/src/bar.ts'])
  })
})

describe('gateguard-state: 24h TTL', () => {
  it('stale state file (>24h) is recreated as empty', async () => {
    // Persist a state
    const state = emptyState(SESSION_A)
    state.reads.push({
      path: '/old/file.ts',
      at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    })
    await persistState(state)

    // Manually backdate the file mtime by overwriting mtime via utimes
    const { utimesSync } = await import('node:fs')
    const staleTime = (Date.now() - 25 * 60 * 60 * 1000) / 1000
    try {
      utimesSync(stateFilePath(SESSION_A), staleTime, staleTime)
    } catch {
      // If utimes fails (rare), skip this specific check
      return
    }

    resetStateCache()
    const loaded = await loadState(SESSION_A)
    // Should be fresh — stale file was deleted and recreated
    expect(loaded.reads).toEqual([])
    expect(loaded.sessionId).toBe(SESSION_A)
  })
})

describe('gateguard-state: no-op for unknown tools', () => {
  it('returns exitCode 0 for unrecognized tool names', async () => {
    const ctx = makeCtx('post-tool-use', {
      session_id: SESSION_A,
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    })
    const result = await gateguardStateHandler(ctx)
    expect(result.exitCode).toBe(0)

    resetStateCache()
    const state = await loadState(SESSION_A)
    expect(state.reads).toEqual([])
    expect(state.greps).toEqual([])
    expect(state.globs).toEqual([])
  })

  it('returns exitCode 0 when no session_id in payload', async () => {
    const ctx = makeCtx('post-tool-use', {
      tool_name: 'Read',
      tool_input: { file_path: '/src/foo.ts' },
      // no session_id
    })
    const result = await gateguardStateHandler(ctx)
    expect(result.exitCode).toBe(0)
  })
})
