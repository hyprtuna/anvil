/**
 * on-large-output handler — Plan 32 (refactored Plan 43 Phase E).
 *
 * Compresses large tool outputs into a summary + notepad-stashed pointer.
 * Three strategies driven by `config.compression.strategy`:
 *   skip      — under threshold or strategy=skip → return { skip: true }
 *   diffstat  — unified diff input → render diffstat-style summary
 *   summary   — invoke `anvil skill run summarization --input-stdin` via
 *               subprocess; fall back to a mechanical summary on failure
 *
 * Helpers live under `./on-large-output/`:
 *   threshold.ts — countWords, estimateTokens, looksLikeDiff, diffstatSummary
 *   summarize.ts — detectSubprocessRuntime, invokeSubprocessSummarizer,
 *                  buildMechanicalSummary
 *
 * ANV-0247: stashLargeOutput moved to src/experimental/notepads/core/stash.ts.
 * In the default build the dynamic import resolves to undefined and the spill
 * becomes a no-op (stashedAt = undefined). The experimental build provides the
 * real stash implementation at runtime.
 *
 * Stub HookHandler is registered in load-all.ts so the kind appears in
 * `anvil doctor --hooks`; the real work runs from `src/hooks/dispatcher.ts`
 * via `handleLargeOutput()` (Plan 32 C2).
 */

import type {
  HookHandler,
  LargeOutputPayload,
  LargeOutputResult,
  ModelsConfig,
} from '../../core/types.js'
import {
  buildMechanicalSummary,
  detectSubprocessRuntime,
  invokeSubprocessSummarizer,
} from './on-large-output/summarize.js'
import {
  countWords,
  diffstatSummary,
  estimateTokens,
  looksLikeDiff,
} from './on-large-output/threshold.js'

// Re-export the public surface so callers (dispatcher, tests) keep importing
// from this shell file regardless of internal helper layout.
export {
  countWords,
  detectSubprocessRuntime,
  diffstatSummary,
  estimateTokens,
  invokeSubprocessSummarizer,
  looksLikeDiff,
}

/** Default word threshold — fire at 5000 words (≈6500 tokens). */
const DEFAULT_THRESHOLD_WORDS = 5000

/**
 * Default per-tool token budgets (ANV-0046).
 * webfetch is intentionally tight (10k) to match OmO tool-output-truncator.
 */
const DEFAULT_TOOL_BUDGETS: Record<string, number> = {
  webfetch: 10_000,
  bash: 50_000,
  read: 50_000,
}

/** Fallback budget for tools not listed in DEFAULT_TOOL_BUDGETS. */
const DEFAULT_BUDGET_FALLBACK = 50_000

/**
 * Resolve the token budget for a given tool name (ANV-0046).
 *
 * Resolution order (highest wins):
 *   1. Env ANVIL_TOOL_BUDGET_<TOOL>=N  (TOOL = toolName.toUpperCase(), hyphens→underscores)
 *   2. config.compression.tool_budgets[toolName] (case-insensitive)
 *   3. DEFAULT_TOOL_BUDGETS[toolName.toLowerCase()]
 *   4. DEFAULT_BUDGET_FALLBACK (50,000)
 */
export function resolveToolBudget(
  toolName: string,
  configBudgets: Record<string, number> | undefined,
  env: Record<string, string | undefined> = process.env,
): number {
  const envKey = toolName.toUpperCase().replace(/-/g, '_')
  const envVal = env[`ANVIL_TOOL_BUDGET_${envKey}`]
  if (envVal !== undefined) {
    const parsed = Number.parseInt(envVal, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }

  const lower = toolName.toLowerCase()

  if (configBudgets !== undefined) {
    // Case-insensitive lookup — try original casing, lowercase, uppercase
    const configMatch =
      configBudgets[toolName] ??
      configBudgets[lower] ??
      configBudgets[toolName.toUpperCase()]
    if (configMatch !== undefined && configMatch > 0) return configMatch
  }

  return DEFAULT_TOOL_BUDGETS[lower] ?? DEFAULT_BUDGET_FALLBACK
}

/**
 * Core handler logic — exported for testing without the HookHandler wrapper.
 *
 * Returns a LargeOutputResult:
 *   - `skip: true`             — under threshold or strategy=skip
 *   - `{ summary, stashedAt }` — compressed result ready for context mutation
 */
export async function handleLargeOutput(
  payload: LargeOutputPayload,
  config: ModelsConfig,
  /** Injectable summarization for testing. Defaults to subprocess invocation. */
  summarizationFn: (text: string) => string | null = invokeSubprocessSummarizer,
): Promise<LargeOutputResult> {
  const threshold =
    config.compression?.threshold_words ?? DEFAULT_THRESHOLD_WORDS
  const strategy = config.compression?.strategy ?? 'summary'

  // Per-tool token budget check (ANV-0046): fire if tokens exceed the budget
  // even when word count is below threshold_words.
  const toolBudget = resolveToolBudget(
    payload.toolName,
    config.compression?.tool_budgets,
  )
  const exceedsWordThreshold = payload.words >= threshold
  const exceedsTokenBudget = payload.tokens > toolBudget

  if (!exceedsWordThreshold && !exceedsTokenBudget) return { skip: true }
  if (strategy === 'skip') return { skip: true }

  // ANV-0247: stash target is in the experimental build only.
  // Dynamic import with literal specifier — whitelisted in experimental-isolation
  // architecture test (src/hooks/handlers/on-large-output.ts entry).
  let stashedAt: string | undefined
  try {
    const stashMod = (await import(
      '../../experimental/notepads/core/stash.js'
    )) as { stashLargeOutput?: (...args: unknown[]) => Promise<string> }
    if (typeof stashMod.stashLargeOutput === 'function') {
      stashedAt = await stashMod.stashLargeOutput(
        payload.cwd,
        payload.branch,
        payload.toolName,
        payload.toolResult,
      )
    }
    // Default build: stashMod.stashLargeOutput is undefined → stashedAt stays undefined (no-op).
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
      process.stderr.write(
        `[anvil:on-large-output] warn: stash failed: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
    // Expected default-build path: stash module absent → silent no-op.
    // stashedAt remains undefined; summary is still emitted to context.
  }

  if (strategy === 'diffstat' && looksLikeDiff(payload.toolResult)) {
    const summary = diffstatSummary(payload.toolResult)
    return { summary, stashedAt }
  }

  const subprocessSummary = summarizationFn(payload.toolResult)
  if (subprocessSummary !== null) {
    return { summary: subprocessSummary, stashedAt }
  }

  const summary = buildMechanicalSummary(
    payload.toolName,
    payload.toolResult,
    payload.words,
  )
  return { summary, stashedAt }
}

/**
 * HookHandler for the `on-large-output` kind. Registered in load-all.ts so
 * the hook kind is visible in `anvil doctor --hooks`; always returns SUCCESS
 * without side effects. The dispatcher's inline invocation of
 * `handleLargeOutput` is the authoritative path. Disabled by default in
 * config/defaults.ts.
 *
 * Note: build-hooks.mjs derives the expected export name from the filename
 * (`on-large-output.ts` → camelCase + `Handler`), so this export name must
 * not be changed.
 */
export const onLargeOutputHandler: HookHandler = async (_ctx) => {
  return { exitCode: 0 }
}
