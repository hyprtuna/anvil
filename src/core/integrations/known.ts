/**
 * ANV-0151 — Known-integration registry.
 *
 * Maps adapter name → array of plugin slugs that complement Anvil.
 * These are recommended integrations — plugins that work well alongside
 * Anvil and fill capability gaps (memory, context, observability).
 *
 * Adapter names match the keys used in the installed_plugins.json v2 schema
 * (CC: keys are `<slug>@<scope>`; we match on the slug prefix before `@`).
 *
 * To add an integration: push a new entry to the appropriate adapter list.
 * Doctor will surface a skip (informational) row for missing categories.
 *
 * Contrast with src/core/conflicts/known.ts — that registry is for plugins
 * that should NOT be used alongside Anvil. This registry is for plugins
 * that ARE recommended.
 */

export interface IntegrationEntry {
  /** Plugin slug as it appears in installed_plugins.json (the part before `@`). */
  slug: string
  /** Capability category this plugin fills. */
  category: 'memory' | 'context' | 'observability'
  /** Human-readable reason Anvil recommends this plugin. */
  reason: string
  /** Optional URL to the plugin's homepage or install instructions. */
  docUrl?: string
}

export type IntegrationRegistry = Readonly<
  Record<string, ReadonlyArray<IntegrationEntry>>
>

/**
 * Seeded from the cross-repo audit (ANV-0151 source_findings / backlog R-117/118/119).
 *
 * - `claude-mem` — provides cross-session memory persistence; Anvil has no
 *   built-in long-term memory layer and explicitly defers to this plugin for
 *   that capability (backlog R-117).
 */
export const KNOWN_INTEGRATIONS: IntegrationRegistry = {
  'claude-code': [
    {
      slug: 'claude-mem',
      category: 'memory',
      reason:
        'cross-session memory persistence — Anvil has no built-in memory layer',
      docUrl: 'https://github.com/smithery-ai/claude-mem',
    },
  ],
  opencode: [],
}
