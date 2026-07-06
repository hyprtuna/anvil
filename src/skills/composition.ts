/**
 * ANV-0092 — Content-overlay composition pass.
 *
 * Applies when a skill declares both `strategy:` and `extends_skill:`.
 * The composition pass runs *after* all skills have been loaded and deduped
 * (provider precedence ANV-0050 is already settled at that point), so the
 * registry passed in is the authoritative, already-won set.
 *
 * Strategies:
 *   replace  — override body replaces the core body entirely.
 *   prepend  — override body + "\n\n" + core body.
 *   append   — core body + "\n\n" + override body.
 *   wrap     — override body with `{CORE_TEMPLATE}` substituted by core body.
 *
 * Hook point: called in `load-all.ts` after `resolveSubSkillGraph()`, both in
 * the eager and provider-stats paths.  `applyCompositionOverlays` mutates
 * the `body` field of each overlay skill in-place.  Lazy-load mode also
 * resets the `bodyLoader` so subsequent fetches return the composed body.
 */

import type { Skill } from '../core/types.js'

/** Summary of a single applied overlay — returned for doctor / test use. */
export interface AppliedOverlay {
  /** The overlay skill's name. */
  overlayName: string
  /** The core (base) skill's name. */
  coreName: string
  /** The strategy applied. */
  strategy: 'replace' | 'prepend' | 'append' | 'wrap'
}

/** Warning emitted when an overlay cannot be resolved. */
export interface CompositionWarning {
  overlayName: string
  message: string
}

export interface CompositionResult {
  applied: AppliedOverlay[]
  warnings: CompositionWarning[]
}

/**
 * Pure function: compose an override body with a core body using the
 * specified strategy.  Exported for unit testing.
 *
 * @param strategy  - Composition strategy.
 * @param coreBody  - The resolved body of the core (base) skill.
 * @param overrideBody - The body of the overlay skill.
 * @returns The composed body string.
 */
export function composeBody(
  strategy: 'replace' | 'prepend' | 'append' | 'wrap',
  coreBody: string,
  overrideBody: string,
): string {
  switch (strategy) {
    case 'replace':
      return overrideBody
    case 'prepend':
      return `${overrideBody}\n\n${coreBody}`
    case 'append':
      return `${coreBody}\n\n${overrideBody}`
    case 'wrap': {
      if (!overrideBody.includes('{CORE_TEMPLATE}')) {
        // Placeholder absent: fall back to append to avoid silent data loss.
        console.warn(
          '[anvil] composition wrap: {CORE_TEMPLATE} placeholder not found in override body — falling back to append',
        )
        return `${coreBody}\n\n${overrideBody}`
      }
      return overrideBody.replace(/\{CORE_TEMPLATE\}/g, coreBody)
    }
  }
}

/**
 * Apply content-overlay composition to all overlay skills in the provided
 * skill array.  Mutates each matching skill's `body` field in-place and
 * resets `bodyLoader` so lazy fetches return the composed text.
 *
 * Called by `load-all.ts` after `resolveSubSkillGraph()`.
 */
export function applyCompositionOverlays(skills: Skill[]): CompositionResult {
  // Build a fast name → skill lookup from the *already-won* set (ANV-0050
  // precedence is settled before this function is called).
  const byName = new Map<string, Skill>()
  for (const skill of skills) {
    byName.set(skill.frontmatter.name, skill)
  }

  const applied: AppliedOverlay[] = []
  const warnings: CompositionWarning[] = []

  for (const skill of skills) {
    const { strategy, extends_skill: coreName } = skill.frontmatter
    if (!strategy || !coreName) continue

    const core = byName.get(coreName)
    if (!core) {
      const msg = `extends_skill '${coreName}' not found in registry`
      warnings.push({ overlayName: skill.frontmatter.name, message: msg })
      console.warn(
        `[anvil] composition overlay "${skill.frontmatter.name}" — ${msg}`,
      )
      continue
    }

    // Resolve body strings — in eager mode both are populated; in lazy mode
    // we use the already-loaded body if present, else the empty string.
    // Full lazy-body resolution here would require async; we handle lazy by
    // resetting bodyLoader below instead.
    const coreBody = core.body ?? ''
    const overrideBody = skill.body ?? ''

    const composed = composeBody(strategy, coreBody, overrideBody)

    // Mutate the overlay skill: set the composed body eagerly…
    ;(skill as { body: string }).body = composed

    // …and reset bodyLoader so a later lazy fetch returns the composed text.
    if (skill.bodyLoader !== undefined) {
      const frozen = composed
      ;(skill as { bodyLoader: () => Promise<string> }).bodyLoader = async () =>
        frozen
    }

    applied.push({
      overlayName: skill.frontmatter.name,
      coreName,
      strategy,
    })
  }

  return { applied, warnings }
}
