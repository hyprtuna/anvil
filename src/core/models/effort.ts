import type { EffortLevel as EffortLevelType } from '../types.js'

/**
 * Maps a model ID to the ordered list of effort levels it accepts (low→high).
 * An empty array means the model does not accept any effort parameter.
 */
export type SupportedEffortsMap = Record<string, ReadonlyArray<EffortLevelType>>

/**
 * Canonical ordering used for "at or below" clamping comparisons.
 * Index 0 = lowest, index 4 = highest.
 */
const EFFORT_ORDER: ReadonlyArray<EffortLevelType> = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

/**
 * Built-in supported-efforts registry for Anthropic models.
 * - Haiku does not accept an effort parameter (empty array).
 * - Sonnet accepts low/medium/high/max (no xhigh).
 * - Opus accepts all five levels.
 *
 * Provider drivers may extend this at boot time via `registerSupportedEfforts`.
 */
export const BUILTIN_SUPPORTED_EFFORTS: SupportedEffortsMap = {
  'claude-haiku-4-5': [],
  'claude-sonnet-4-6': ['low', 'medium', 'high', 'max'],
  'claude-opus-4-7': ['low', 'medium', 'high', 'xhigh', 'max'],
}

/**
 * Registers supported effort levels for a model at boot time.
 * Intended for provider drivers that introduce models not in `BUILTIN_SUPPORTED_EFFORTS`.
 * Mutates the module-level registry — call once per model at application startup.
 */
export function registerSupportedEfforts(
  modelId: string,
  efforts: ReadonlyArray<EffortLevelType>,
): void {
  BUILTIN_SUPPORTED_EFFORTS[modelId] = efforts
}

/**
 * Clamps the requested effort level to the highest level the model supports
 * that is at or below `requested`.
 *
 * Rules:
 * 1. `requested === undefined` → `undefined` (no effort requested).
 * 2. Model not in registry, or its list is empty → `undefined` (model rejects effort).
 * 3. `requested` is in the model's list → pass through unchanged.
 * 4. Otherwise → return the highest supported level at or below `requested`.
 *    Uses the canonical ordering: low < medium < high < xhigh < max.
 */
export function clampEffortForModel(
  modelId: string,
  requested: EffortLevelType | undefined,
  registry?: SupportedEffortsMap,
): EffortLevelType | undefined {
  if (requested === undefined) return undefined
  const supported = (registry ?? BUILTIN_SUPPORTED_EFFORTS)[modelId]
  if (!supported || supported.length === 0) return undefined
  if (supported.includes(requested)) return requested
  const reqIdx = EFFORT_ORDER.indexOf(requested)
  // Walk down from requested looking for the highest supported level below it
  for (let i = reqIdx - 1; i >= 0; i--) {
    const candidate = EFFORT_ORDER[i]
    if (candidate !== undefined && supported.includes(candidate))
      return candidate
  }
  return undefined
}

/**
 * Like `clampEffortForModel` but returns trace metadata alongside the result.
 * `clamped: true` only when the output *differs* from `requested`.
 * `reason` is a human-readable explanation, populated only when `clamped: true`.
 */
export function clampEffortWithTrace(
  modelId: string,
  requested: EffortLevelType | undefined,
  registry?: SupportedEffortsMap,
): { effort: EffortLevelType | undefined; clamped: boolean; reason?: string } {
  const effort = clampEffortForModel(modelId, requested, registry)
  if (requested === undefined || effort === requested) {
    return { effort, clamped: false }
  }
  const supported = (registry ?? BUILTIN_SUPPORTED_EFFORTS)[modelId]
  const supportedList =
    supported && supported.length > 0 ? supported.join(', ') : 'none'
  const reason =
    effort === undefined
      ? `model '${modelId}' does not accept effort (supports: ${supportedList})`
      : `clamped '${requested}' → '${effort}' (model '${modelId}' supports: ${supportedList})`
  return { effort, clamped: true, reason }
}
