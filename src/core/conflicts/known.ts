/**
 * ANV-0048 — Known-conflict registry.
 *
 * Maps adapter name → array of plugin slugs that conflict with Anvil.
 * Conflicts arise from overlapping hooks (SessionStart), competing skill
 * providers, or conflicting status-line renderers.
 *
 * Adapter names match the keys used in the installed_plugins.json v2 schema
 * (CC: keys are `<slug>@<scope>`; we match on the slug prefix before `@`).
 *
 * To add a conflict: push a new entry to the appropriate adapter list.
 * Doctor will surface a warn row for each matched slug on the next run.
 *
 * Note: claude-mem is NOT a conflict — it is a recommended integration.
 * See src/core/integrations/known.ts (ANV-0151).
 */

export interface ConflictEntry {
  /** Plugin slug as it appears in installed_plugins.json (the part before `@`). */
  slug: string
  /** Human-readable reason for the conflict. */
  reason: string
}

export type ConflictRegistry = Readonly<
  Record<string, ReadonlyArray<ConflictEntry>>
>

/**
 * Seeded from the cross-repo audit (ANV-0048 source_findings).
 *
 * - `block-no-verify`  — installs a PreToolUse hook that fires on every
 *   commit, conflicting with Anvil's own commit-guard hook (agents.audit.md
 *   NEW-D drift).
 * - `superpowers`      — ships a SessionStart hook that races with Anvil's
 *   bootstrap SessionStart, producing double-fires.
 * - `claude-hud`       — installs a `statusLine` command that overwrites the
 *   Anvil statusline wiring in .claude/settings.json.
 * - `autocomplete-pro` — registers a Stop hook that conflicts with Anvil's
 *   on-session-end routing logic.
 */
export const KNOWN_CONFLICTS: ConflictRegistry = {
  'claude-code': [
    {
      slug: 'block-no-verify',
      reason:
        'installs a PreToolUse hook that conflicts with Anvil commit-guard (double-fire risk)',
    },
    {
      slug: 'superpowers',
      reason:
        'ships a SessionStart hook that races with Anvil bootstrap (double-fire risk)',
    },
    {
      slug: 'claude-hud',
      reason:
        'installs a statusLine command that overwrites Anvil statusline wiring',
    },
    {
      slug: 'autocomplete-pro',
      reason:
        'registers a Stop hook that conflicts with Anvil on-session-end routing',
    },
  ],
  opencode: [],
}
