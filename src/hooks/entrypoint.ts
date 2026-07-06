import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildDefaultConfig } from '../core/config/defaults.js'
import { getUserHome } from '../core/io/home.js'
import { HOOK_KIND_TO_EVENT } from '../core/manifest-schema/claude-code.js'
import { HookContext } from '../core/types.js'
import type { HookHandler } from '../core/types.js'
import { formatClaudeCodeHookOutput } from './cc-output.js'
import { HookExit } from './exit-codes.js'
import { validateAndTimeHandler } from './wrap.js'

// ─── Per-kind additionalContext support (Plan 35 P1) ────────────────────────
//
// Claude Code's HookOutput discriminated union only supports the
// `hookSpecificOutput.additionalContext` field for a subset of hook kinds.
// For kinds NOT in this set, emitting the JSON envelope causes CC to reject
// with "(root): Invalid input". For those kinds, fall back to plain text on
// stdout (same channel as the `message` field).
//
// Sources:
//   - CC hook output schema (references/claude-docs/references/hooks.md)
//   - Stream B Section 4 finding: only UserPromptSubmit, SessionStart, and
//     PreToolUse have an `additionalContext` slot in CC's schema.
const KINDS_WITH_ADDITIONAL_CONTEXT = new Set([
  'user-prompt-submit',
  'session-start',
  'pre-tool-use',
])

/**
 * Load the models config a bundled hook should run with. Prefer the
 * installed `~/.anvil/models.json`; fall back to `buildDefaultConfig()`
 * when it is missing or unparseable so hooks remain runnable in a fresh
 * environment (CI, pre-init smoke tests, first-boot hooks).
 *
 * v0.10.9 E-001: when the file exists but is malformed, emit a one-line
 * stderr warning naming the path and the parse error before falling
 * back to defaults. Previously the parse failure was silently swallowed,
 * which masked corrupted user config (the audited "silent fallback").
 *
 * Exported for unit testing.
 */
export function loadConfig(): unknown {
  const p = join(getUserHome(), '.anvil', 'models.json')
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(
        `anvil hook: ${p} malformed (${msg}); using defaults\n`,
      )
    }
  }
  return buildDefaultConfig()
}

export async function runHook(
  kind: string,
  handler: HookHandler,
): Promise<never> {
  let ctx: HookContext
  try {
    const raw = readFileSync(0, 'utf8') // stdin
    const parsed = raw.trim() ? JSON.parse(raw) : {}
    const result = HookContext.safeParse({
      kind,
      cwd: parsed.cwd ?? process.cwd(),
      env: process.env,
      payload: parsed,
      config: loadConfig(),
    })
    if (!result.success) {
      process.stderr.write(
        `anvil hook ${kind}: invalid payload: ${result.error.message}\n`,
      )
      process.exit(HookExit.BLOCK)
    }
    ctx = result.data
  } catch (err) {
    process.stderr.write(
      `anvil hook ${kind}: failed to parse stdin payload: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(HookExit.BLOCK)
  }

  // Plan 35 P2 — Route through validateAndTimeHandler so validation + timing
  // instrumentation run on real-session hooks (not just dispatcher-path hooks).
  // This closes the structural bypass where handler(ctx) was called directly.
  const result = await validateAndTimeHandler(kind, kind, ctx, handler)

  // Plan 35 P1 — Path E injection with correct PascalCase hookEventName.
  //
  // Fix: `hookEventName` must be PascalCase (e.g. "UserPromptSubmit") to match
  // Claude Code's HookOutput discriminated union. The entrypoint previously
  // emitted the raw kebab-case `kind` string (e.g. "user-prompt-submit"), which
  // caused CC to reject with "(root): Invalid input" and likely hang for ~5
  // minutes until its own subprocess timeout fired.
  //
  // Fix: only emit the additionalContext envelope for hook kinds that have that
  // slot in CC's schema (UserPromptSubmit, SessionStart, PreToolUse). For all
  // other kinds, fall back to plain text — the envelope on those kinds is also
  // what triggers the "(root): Invalid input" rejection.
  if (result.systemInsert !== undefined) {
    if (KINDS_WITH_ADDITIONAL_CONTEXT.has(kind)) {
      // PascalCase mapping via HOOK_KIND_TO_EVENT; warn loudly if unmapped.
      const eventName = HOOK_KIND_TO_EVENT[kind]
      if (eventName === undefined) {
        process.stderr.write(
          `[anvil:entrypoint] warn: no PascalCase mapping for hook kind "${kind}" — falling back to plain text\n`,
        )
        if (result.message ?? result.systemInsert) {
          process.stdout.write(`${result.message ?? result.systemInsert}\n`)
        }
      } else {
        // Use the adapter's formatter to ensure consistent envelope shape.
        const { stdout, stderr } = formatClaudeCodeHookOutput(eventName, result)
        process.stdout.write(`${stdout}\n`)
        if (stderr) process.stderr.write(`${stderr}\n`)
      }
    } else {
      // Kind does not support additionalContext — write plain text to stdout.
      // Use message if set; fall back to systemInsert so context isn't lost.
      const text = result.message ?? result.systemInsert
      if (text) process.stdout.write(`${text}\n`)
    }
  } else if (result.message) {
    process.stdout.write(`${result.message}\n`)
  }
  process.exit(result.exitCode)
}
