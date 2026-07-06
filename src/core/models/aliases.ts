import type { ModelsConfig } from '../types.js'

/**
 * Built-in alias map from short model names to the concrete model ID currently
 * shipped by the provider. **Single point of update** when the provider ships
 * a new model version.
 *
 * Two naming conventions ship out of the box, both pointing at the same
 * concrete IDs:
 *
 *   1. **Provider-neutral (recommended):** `cheap`, `balanced`, `best`.
 *      Use these in skill/agent frontmatter and config when you want the
 *      file to read clearly on non-Anthropic deployments. Users on Kimi /
 *      GLM / GPT override these three names in their `model_aliases` and
 *      everything downstream resolves to the right provider model.
 *
 *   2. **Anthropic-shorthand (legacy):** `haiku`, `sonnet`, `opus`. Kept for
 *      compat — Anvil's bundled agent files (v0.9.x and the first cut of
 *      v0.10.0) declare `model: opus` etc. and continue to work unchanged.
 *
 * Pinning concrete IDs (`claude-sonnet-4-6`) in defaults and tier tables
 * means every model bump touches multiple files and risks drift. With
 * aliases, defaults reference the short name and one constant in this
 * map controls what it resolves to.
 */
export const BUILTIN_MODEL_ALIASES: Record<string, string> = {
  // Canonical, provider-neutral names (recommended for new code/docs)
  cheap: 'claude-haiku-4-5',
  balanced: 'claude-sonnet-4-6',
  best: 'claude-opus-4-7',
  // Anthropic-shorthand legacy (kept for backward-compat with shipped agents)
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
}

/**
 * Tier aliases map a tier-name to a short alias (`cheap`/`balanced`/`best`).
 * The short alias is then resolved by `resolveAlias()` to a concrete provider model id.
 * Provider portability is achieved by overriding the three short aliases in
 * `model_aliases` — not by per-tier per-provider maps. See `.anvil/specs/tiers.md`.
 *
 * Six tiers replace the v0.10.0 trio (quick/standard/deep) — Plan 38 Phase B.
 * `coding` and `review` both map to `balanced` (Sonnet); `planning`, `ultra`,
 * and `super` all map to `best` (Opus). Legacy `standard`/`deep` are removed;
 * no migration shim (pre-release).
 */
export const TIER_ALIASES: Record<string, string> = {
  quick: 'cheap',
  coding: 'balanced',
  review: 'balanced',
  planning: 'best',
  ultra: 'best',
  super: 'best',
}

/**
 * Resolves an alias to a concrete model ID by walking the chain:
 *   user `model_aliases` → built-in model aliases → built-in tier aliases.
 *
 * The walk is recursive (e.g., `coding` → `balanced` → `claude-sonnet-4-6`)
 * with a visited set to handle pathological user configs that introduce
 * cycles. If a cycle is detected, returns the current node as-is rather
 * than throwing — callers downstream will fail more informatively when the
 * model ID isn't known to the provider.
 *
 * If the input is already a concrete model ID (not in any alias map),
 * it's returned unchanged.
 */
export function resolveAlias(
  nameOrAlias: string,
  aliases: ModelsConfig['model_aliases'],
): string {
  const visited = new Set<string>()
  let current = nameOrAlias

  while (true) {
    if (visited.has(current)) {
      // Cycle: return the current node; downstream model-ID validation
      // will surface the mis-config more clearly than a thrown error here.
      return current
    }
    visited.add(current)

    let next: string | undefined
    if (current in aliases) {
      next = aliases[current as keyof typeof aliases]
    } else if (current in BUILTIN_MODEL_ALIASES) {
      next = BUILTIN_MODEL_ALIASES[current]
    } else if (current in TIER_ALIASES) {
      next = TIER_ALIASES[current]
    }

    if (next === undefined || next === current) {
      return current
    }
    current = next
  }
}
