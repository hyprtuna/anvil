/**
 * Tests for gateguard.ts — PreToolUse handler (4-fact gate).
 * Plan 39 Phase F.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import type { HookKind } from '../../../../src/core/types.js'
import { gateguardHandler } from '../../../../src/hooks/handlers/gateguard.js'
import {
  emptyState,
  persistState,
  resetStateCache,
  stateFilePath,
} from '../../../../src/hooks/handlers/gateguard/state.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SESSION = 'gateguard-test-session'
// Use a non-schema file so schema detection tests work correctly
const TARGET_FILE = '/home/user/project/src/hooks/handlers/workflow-guard.ts'

function makeCtx(
  payload: unknown,
  opts: { gateguardEnv?: string; cwd?: string } = {},
) {
  const env: Record<string, string> = {}
  if (opts.gateguardEnv) env.ANVIL_GATEGUARD = opts.gateguardEnv
  return {
    kind: 'pre-tool-use' as HookKind,
    cwd: opts.cwd ?? '/tmp/gateguard-test-cwd',
    config: buildDefaultConfig(),
    env,
    payload,
  }
}

function editPayload(filePath: string, sessionId = SESSION) {
  return {
    session_id: sessionId,
    tool_name: 'Edit',
    tool_input: { file_path: filePath },
  }
}

function writePayload(filePath: string, sessionId = SESSION) {
  return {
    session_id: sessionId,
    tool_name: 'Write',
    tool_input: { file_path: filePath },
  }
}

function multiEditPayload(filePath: string, sessionId = SESSION) {
  return {
    session_id: sessionId,
    tool_name: 'MultiEdit',
    tool_input: {
      edits: [{ file_path: filePath }],
    },
  }
}

async function setupFullState(targetPath = TARGET_FILE) {
  const state = emptyState(SESSION)
  state.userPromptSubmitted = true
  // Fact 2: read the target file
  state.reads.push({ path: targetPath, at: new Date().toISOString() })
  // Fact 3: read a schema file
  state.reads.push({
    path: '/home/user/project/src/core/types.ts',
    at: new Date().toISOString(),
  })
  // Fact 1: grep for the target file's name (without extension)
  state.greps.push({ pattern: 'workflow-guard', at: new Date().toISOString() })
  await persistState(state)
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  resetStateCache()
  // Clean up state file
  try {
    rmSync(stateFilePath(SESSION), { force: true })
  } catch {
    /* ignore */
  }
  // Clean up test cwd config
  try {
    rmSync('/tmp/gateguard-test-cwd', { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  Reflect.deleteProperty(process.env, 'ANVIL_GATEGUARD')
})

afterEach(() => {
  resetStateCache()
  try {
    rmSync(stateFilePath(SESSION), { force: true })
  } catch {
    /* ignore */
  }
  try {
    rmSync('/tmp/gateguard-test-cwd', { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  Reflect.deleteProperty(process.env, 'ANVIL_GATEGUARD')
})

// ─── Disabled by default ──────────────────────────────────────────────────────

describe('gateguard: disabled by default', () => {
  it('returns exitCode 0 (no-op) when ANVIL_GATEGUARD is unset and no config', async () => {
    const result = await gateguardHandler(makeCtx(editPayload(TARGET_FILE)))
    expect(result.exitCode).toBe(0)
    expect(result.context?.gateguardBlocked).toBeUndefined()
  })

  it('returns exitCode 0 (no-op) for Write when disabled', async () => {
    const result = await gateguardHandler(makeCtx(writePayload(TARGET_FILE)))
    expect(result.exitCode).toBe(0)
  })
})

// ─── Env-var activation ───────────────────────────────────────────────────────

describe('gateguard: ANVIL_GATEGUARD=1 activation', () => {
  it('activates when ANVIL_GATEGUARD=1 in ctx.env', async () => {
    const state = emptyState(SESSION)
    // No facts at all
    await persistState(state)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.context?.gateguardBlocked).toBe(true)
  })

  it('activates when process.env.ANVIL_GATEGUARD=1', async () => {
    process.env.ANVIL_GATEGUARD = '1'
    const state = emptyState(SESSION)
    await persistState(state)
    const result = await gateguardHandler(makeCtx(editPayload(TARGET_FILE)))
    expect(result.exitCode).toBe(2)
  })
})

// ─── Config activation ────────────────────────────────────────────────────────

describe('gateguard: config-file activation', () => {
  it('activates when workflow.gateguard=true in anvil.config.json', async () => {
    const cwd = '/tmp/gateguard-test-cwd'
    mkdirSync(join(cwd, '.anvil'), { recursive: true })
    writeFileSync(
      join(cwd, '.anvil', 'anvil.config.json'),
      JSON.stringify({ gateguard: true }),
      'utf-8',
    )
    const state = emptyState(SESSION)
    await persistState(state)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { cwd }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.context?.gateguardBlocked).toBe(true)
  })
})

// ─── Fact blocking ────────────────────────────────────────────────────────────

describe('gateguard: fact blocking (ANVIL_GATEGUARD=1)', () => {
  it('blocks with 4 missing facts when state file is absent', async () => {
    // No state file at all
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.message).toContain('GateGuard')
    expect(result.message).toContain('BLOCKED')
    // All 4 facts missing
    expect(result.context?.missingFacts).toBe(4)
  })

  it('blocks when only fact 4 (user instruction) is present', async () => {
    const state = emptyState(SESSION)
    state.userPromptSubmitted = true
    // No reads, no greps — facts 1+2+3 missing
    await persistState(state)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.context?.missingFacts).toBe(3)
  })

  it('blocks when facts 1+4 satisfied but 2+3 missing', async () => {
    const state = emptyState(SESSION)
    state.userPromptSubmitted = true
    // Fact 1: grep for target basename 'workflow-guard.ts'
    state.greps.push({
      pattern: 'workflow-guard',
      at: new Date().toISOString(),
    })
    // No reads at all — facts 2+3 missing
    await persistState(state)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.context?.missingFacts).toBe(2)
  })

  it('blocks when facts 1+2+4 satisfied but fact 3 (schema) missing', async () => {
    const state = emptyState(SESSION)
    state.userPromptSubmitted = true
    // Fact 1: grep matches target basename
    state.greps.push({
      pattern: 'workflow-guard',
      at: new Date().toISOString(),
    })
    // Fact 2: read target file
    state.reads.push({ path: TARGET_FILE, at: new Date().toISOString() })
    // No schema file read — fact 3 missing
    await persistState(state)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.context?.missingFacts).toBe(1)
    expect(result.message).toContain('Fact 3')
  })

  it('blocks when facts 1+2+3 satisfied but fact 4 (user instruction) missing', async () => {
    const state = emptyState(SESSION)
    state.userPromptSubmitted = false
    // Fact 1: grep matches target
    state.greps.push({
      pattern: 'workflow-guard',
      at: new Date().toISOString(),
    })
    // Fact 2: read target
    state.reads.push({ path: TARGET_FILE, at: new Date().toISOString() })
    // Fact 3: read schema file
    state.reads.push({
      path: '/src/core/types.ts',
      at: new Date().toISOString(),
    })
    await persistState(state)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.context?.missingFacts).toBe(1)
    expect(result.message).toContain('Fact 4')
  })

  it('fact 4 missing → message mentions user instruction', async () => {
    const state = emptyState(SESSION)
    // userPromptSubmitted = false
    await persistState(state)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
    expect(result.message).toContain('user instruction')
  })
})

// ─── Allow when all 4 facts satisfied ────────────────────────────────────────

describe('gateguard: allow when all 4 facts satisfied', () => {
  it('allows Edit when all 4 facts are satisfied', async () => {
    await setupFullState(TARGET_FILE)
    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(0)
    expect(result.context?.gateguardBlocked).toBeUndefined()
  })

  it('allows Write when all 4 facts are satisfied', async () => {
    await setupFullState(TARGET_FILE)
    const result = await gateguardHandler(
      makeCtx(writePayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(0)
  })

  it('allows MultiEdit when all 4 facts are satisfied', async () => {
    await setupFullState(TARGET_FILE)
    const result = await gateguardHandler(
      makeCtx(multiEditPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(0)
  })

  it('marks path as firstEditCompleted after first allowed edit', async () => {
    await setupFullState(TARGET_FILE)
    await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )

    resetStateCache()
    const { loadState } = await import(
      '../../../../src/hooks/handlers/gateguard/state.js'
    )
    const state = await loadState(SESSION)
    expect(state.firstEditsCompleted).toContain(TARGET_FILE)
  })
})

// ─── Second-edit bypass (firstEditsCompleted) ─────────────────────────────────

describe('gateguard: second-edit bypass', () => {
  it('allows second edit to the same path without re-checking facts (firstEditsCompleted)', async () => {
    // First: allow with all facts satisfied
    await setupFullState(TARGET_FILE)
    await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )

    // Now clear facts — second edit should still pass via firstEditsCompleted
    resetStateCache()
    const { loadState, persistState: persist } = await import(
      '../../../../src/hooks/handlers/gateguard/state.js'
    )
    const state = await loadState(SESSION)
    state.reads = []
    state.greps = []
    state.globs = []
    state.userPromptSubmitted = false
    await persist(state)
    resetStateCache()

    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(0)
  })

  it('second edit to a DIFFERENT path still requires facts', async () => {
    await setupFullState(TARGET_FILE)
    // Allow the first file
    await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )

    // Try to edit a completely different file — the greps were for 'workflow-guard',
    // which doesn't match 'other-service.ts', so fact 1 fails
    const otherFile = '/home/user/project/src/other-service.ts'
    resetStateCache()
    const state = emptyState(SESSION)
    state.firstEditsCompleted.push(TARGET_FILE) // only TARGET_FILE, not otherFile
    // No greps or reads for otherFile
    await persistState(state)

    const result = await gateguardHandler(
      makeCtx(editPayload(otherFile), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(2)
  })
})

// ─── Session isolation ────────────────────────────────────────────────────────

describe('gateguard: per-session isolation', () => {
  it('two sessions do not cross-contaminate state', async () => {
    const SESSION_X = 'session-x-isolation'
    const SESSION_Y = 'session-y-isolation'

    try {
      // Setup full facts for session X only
      const stateX = emptyState(SESSION_X)
      stateX.userPromptSubmitted = true
      // Fact 2: read the target file (not a schema file)
      stateX.reads.push({ path: TARGET_FILE, at: new Date().toISOString() })
      // Fact 3: read a schema file
      stateX.reads.push({
        path: '/src/core/types.ts',
        at: new Date().toISOString(),
      })
      // Fact 1: grep for target basename
      stateX.greps.push({
        pattern: 'workflow-guard',
        at: new Date().toISOString(),
      })
      await persistState(stateX)

      // Session Y has no facts
      const stateY = emptyState(SESSION_Y)
      await persistState(stateY)

      // Session X should be allowed
      const resultX = await gateguardHandler(
        makeCtx(
          { ...editPayload(TARGET_FILE), session_id: SESSION_X },
          { gateguardEnv: '1' },
        ),
      )
      expect(resultX.exitCode).toBe(0)

      // Session Y should be blocked
      resetStateCache()
      const resultY = await gateguardHandler(
        makeCtx(
          { ...editPayload(TARGET_FILE), session_id: SESSION_Y },
          { gateguardEnv: '1' },
        ),
      )
      expect(resultY.exitCode).toBe(2)
    } finally {
      resetStateCache()
      try {
        rmSync(stateFilePath(SESSION_X), { force: true })
      } catch {
        /* ignore */
      }
      try {
        rmSync(stateFilePath(SESSION_Y), { force: true })
      } catch {
        /* ignore */
      }
    }
  })
})

// ─── No session ID ────────────────────────────────────────────────────────────

describe('gateguard: missing session ID', () => {
  it('allows when session_id is absent (cannot gate without session)', async () => {
    const result = await gateguardHandler(
      makeCtx(
        {
          tool_name: 'Edit',
          tool_input: { file_path: TARGET_FILE },
          // no session_id
        },
        { gateguardEnv: '1' },
      ),
    )
    // Allows — can't gate without a session ID
    expect(result.exitCode).toBe(0)
  })
})

// ─── Fact 3: schema detection ──────────────────────────────────────────────────

describe('gateguard: fact 3 schema detection patterns', () => {
  // TARGET_FILE = workflow-guard.ts (non-schema), so we need to also read a schema file
  // to satisfy fact 3. These tests verify that the schema detection patterns work.

  it('detects types.ts as schema file', async () => {
    const state = emptyState(SESSION)
    state.userPromptSubmitted = true
    // Fact 1: grep for target basename
    state.greps.push({
      pattern: 'workflow-guard',
      at: new Date().toISOString(),
    })
    // Fact 2: read target file
    state.reads.push({ path: TARGET_FILE, at: new Date().toISOString() })
    // Fact 3: read a types.ts file
    state.reads.push({
      path: '/project/src/core/types.ts',
      at: new Date().toISOString(),
    })
    await persistState(state)

    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(0)
  })

  it('detects *.types.ts as schema file', async () => {
    const state = emptyState(SESSION)
    state.userPromptSubmitted = true
    state.greps.push({
      pattern: 'workflow-guard',
      at: new Date().toISOString(),
    })
    state.reads.push({ path: TARGET_FILE, at: new Date().toISOString() })
    // Fact 3: read an api.types.ts file
    state.reads.push({
      path: '/project/src/api.types.ts',
      at: new Date().toISOString(),
    })
    await persistState(state)

    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(0)
  })

  it('detects schema*.ts as schema file', async () => {
    const state = emptyState(SESSION)
    state.userPromptSubmitted = true
    state.greps.push({
      pattern: 'workflow-guard',
      at: new Date().toISOString(),
    })
    state.reads.push({ path: TARGET_FILE, at: new Date().toISOString() })
    // Fact 3: read a schema-users.ts file
    state.reads.push({
      path: '/project/src/schema-users.ts',
      at: new Date().toISOString(),
    })
    await persistState(state)

    const result = await gateguardHandler(
      makeCtx(editPayload(TARGET_FILE), { gateguardEnv: '1' }),
    )
    expect(result.exitCode).toBe(0)
  })
})
