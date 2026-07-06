import { existsSync, mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { warnConfigInvalidOnce } from '../../core/config/warn-once.js'
import { safeAppend } from '../../core/io/safe-write.js'
import { findProjectRoot } from '../../core/project/root.js'
import type { HookHandler } from '../../core/types.js'
import { WorkflowConfig as WorkflowConfigSchema } from '../../core/types.js'
import { RUNTIME_FALLBACK_MAX_RETRIES } from '../../skills/runtime.js'

/**
 * Plan 44 Phase G — reactive `runtime-fallback` hook handler (Item 14).
 *
 * Catches `model_not_available` / `rate_limit_exceeded` envelopes from the
 * `on-error` lifecycle event and emits a structured chain-advance decision.
 * Reuses the proactive consumer's retry budget (RUNTIME_FALLBACK_MAX_RETRIES
 * from src/skills/runtime.ts) so the two paths share a single source of truth.
 *
 * Every decision is logged to ~/.anvil/logs/<RUNTIME_FALLBACK_LOG_FILE> as
 * a JSONL entry; the safety net is observable.
 *
 * Self-gates: the handler runs only when load-all.ts registered it (gated
 * by `workflow.runtime_fallback === true` or `ANVIL_RUNTIME_FALLBACK=1`).
 * No further self-gating is required here.
 */

export const RUNTIME_FALLBACK_LOG_FILE = 'runtime-fallback.jsonl'

/** Module-scoped dedup flag — only warn once per process lifetime. */
let logWriteWarned = false

const RETRYABLE_CODES = new Set<string>([
  'model_not_available',
  'rate_limit_exceeded',
])

type Decision =
  | 'advance'
  | 'budget-exhausted'
  | 'no-chain'
  | 'not-retryable'
  | 'malformed-payload'
  | 'disabled'

/**
 * Self-gating helper. Mirrors the gateguard pattern (Plan 43): the handler
 * registers unconditionally and short-circuits when neither flag is set.
 */
export async function isRuntimeFallbackEnabled(
  cwd: string,
  env: Record<string, string>,
): Promise<boolean> {
  if (
    env.ANVIL_RUNTIME_FALLBACK === '1' ||
    process.env.ANVIL_RUNTIME_FALLBACK === '1'
  ) {
    return true
  }
  // ANV-0139: resolve the canonical project root so the config lookup works
  // from inside a linked git worktree (.anvil/ lives only at the canonical
  // checkout, never inside a linked worktree).
  const root = (await findProjectRoot(cwd)) ?? cwd
  const configPath = join(root, '.anvil', 'anvil.config.json')
  if (!existsSync(configPath)) return false
  try {
    const raw = await readFile(configPath, 'utf-8')
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      warnConfigInvalidOnce(configPath, String(e), 'on-error')
      return false
    }
    const result = WorkflowConfigSchema.safeParse(parsed)
    if (result.success) return result.data.runtime_fallback
    warnConfigInvalidOnce(configPath, result.error.message, 'on-error')
  } catch {
    // fall through (e.g. readFile EACCES — not a config-validation error)
  }
  return false
}

interface FallbackPayload {
  code?: string
  error?: string
  model?: string
  fallback_chain?: string[]
  attempt?: number
}

export const runtimeFallbackHandler: HookHandler = async (ctx) => {
  const enabled = await isRuntimeFallbackEnabled(ctx.cwd, ctx.env)
  const payload = (ctx.payload as FallbackPayload | null) ?? {}
  const code = payload.code
  const chain = payload.fallback_chain
  const attempt =
    typeof payload.attempt === 'number' && payload.attempt >= 0
      ? payload.attempt
      : 0

  let decision: Decision
  let nextModel: string | undefined

  if (!enabled) {
    decision = 'disabled'
  } else if (typeof code !== 'string') {
    decision = 'malformed-payload'
  } else if (!RETRYABLE_CODES.has(code)) {
    decision = 'not-retryable'
  } else if (!Array.isArray(chain) || chain.length === 0) {
    decision = 'no-chain'
  } else if (
    attempt >= RUNTIME_FALLBACK_MAX_RETRIES ||
    attempt >= chain.length
  ) {
    decision = 'budget-exhausted'
  } else {
    decision = 'advance'
    nextModel = chain[attempt]
  }

  const home = ctx.env.HOME ?? homedir()
  const logPath = join(home, '.anvil', 'logs', RUNTIME_FALLBACK_LOG_FILE)
  const entry = {
    timestamp: new Date().toISOString(),
    decision,
    code: code ?? null,
    model: payload.model ?? null,
    next_model: nextModel ?? null,
    attempt,
    chain_length: Array.isArray(chain) ? chain.length : 0,
  }
  try {
    mkdirSync(dirname(logPath), { recursive: true })
    // safeAppend opens with O_NOFOLLOW so a planted symlink at logPath fails fast.
    safeAppend(logPath, `${JSON.stringify(entry)}\n`, { maxBytes: 16 * 1024 })
  } catch (e) {
    // Logging failures must not break the hook. Decision is still returned
    // via context for the dispatcher to surface.
    if (!logWriteWarned) {
      logWriteWarned = true
      const code = (e as NodeJS.ErrnoException).code ?? (e as Error).message
      process.stderr.write(
        `anvil hook on-error: runtime-fallback log write failed (${code}); telemetry disabled until restart\n`,
      )
    }
  }

  return {
    exitCode: 0,
    context: {
      decision,
      ...(nextModel !== undefined ? { next_model: nextModel } : {}),
      attempt,
    },
  }
}
