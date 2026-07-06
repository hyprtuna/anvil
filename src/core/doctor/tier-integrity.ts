import { resolveAlias } from '../models/aliases.js'
import {
  BUILTIN_SUPPORTED_EFFORTS,
  type SupportedEffortsMap,
} from '../models/effort.js'
import type { EffortLevel, TierConfig } from '../types.js'
import type { ModelsConfig } from '../types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal agent frontmatter fields needed for tier-integrity checks.
 * Keyed by agent name (e.g. 'orchestrator', 'ultra-worker').
 */
export type AgentFrontmatterMap = Map<string, { tier?: string; model?: string }>

/**
 * Minimal per-agent override shape from defaults.ts agents block.
 * Only fields needed for migration-completeness check.
 */
export type AgentOverride = {
  tier?: string
  model?: string
}

// ─── Valid tier names (the 6 canonical tiers) ────────────────────────────────

const VALID_TIER_NAMES = new Set([
  'quick',
  'coding',
  'review',
  'planning',
  'ultra',
  'super',
])

// ─── Check 1: Tier-name validity ─────────────────────────────────────────────

/**
 * Asserts that every agent with a `tier:` field uses one of the 6 valid
 * tier names (`quick|coding|review|planning|ultra|super`).
 *
 * - Legacy `standard` / `deep` → fail (lists offenders).
 * - Missing `tier` → not an offender (resolver falls back to defaults).
 *
 * @param agentFiles - Map of agent name → minimal frontmatter fields.
 * @returns `status: 'pass'` with empty offenders, or `status: 'fail'` listing
 *   every agent name whose `tier` value is not in the valid set.
 */
export function checkTierNameValidity(agentFiles: AgentFrontmatterMap): {
  status: 'pass' | 'fail'
  offenders: string[]
} {
  const offenders: string[] = []
  for (const [name, fm] of agentFiles) {
    if (fm.tier !== undefined && !VALID_TIER_NAMES.has(fm.tier)) {
      offenders.push(name)
    }
  }
  return { status: offenders.length === 0 ? 'pass' : 'fail', offenders }
}

// ─── Check 2: Effort × model compatibility ───────────────────────────────────

/**
 * For each named tier in `tiers`, resolves the model alias (using the
 * provided `model_aliases` config), then checks whether the tier's configured
 * `effort` is in the model's supported effort list.
 *
 * Returns `warn` (never `fail`) for incompatibilities — the runtime will
 * silently clamp, but the doctor surfaces it proactively. Empty tiers config
 * → always `pass`.
 *
 * @param tiers - The `tiers` block from `ModelsConfig` (keyed by tier name).
 * @param modelAliases - The `model_aliases` block for alias resolution.
 * @param registry - Override the built-in effort registry (default:
 *   `BUILTIN_SUPPORTED_EFFORTS`). Useful for testing without concrete model IDs.
 * @returns `status: 'pass'` with empty warnings, or `status: 'warn'` listing
 *   human-readable clamp predictions per affected tier.
 */
export function checkEffortModelCompat(
  tiers: Record<string, TierConfig>,
  modelAliases: ModelsConfig['model_aliases'],
  registry?: SupportedEffortsMap,
): { status: 'pass' | 'warn'; warnings: string[] } {
  const reg = registry ?? BUILTIN_SUPPORTED_EFFORTS
  const warnings: string[] = []

  for (const [tierName, cfg] of Object.entries(tiers)) {
    if (cfg.effort === undefined) continue
    const resolvedModel = resolveAlias(cfg.model, modelAliases)
    const supported = reg[resolvedModel]

    if (supported === undefined) {
      // Unknown model — we can't validate, skip quietly
      continue
    }

    const effortSupported =
      supported.length > 0 &&
      (supported as ReadonlyArray<EffortLevel>).includes(cfg.effort)

    if (!effortSupported) {
      const supportedList = supported.length > 0 ? supported.join(', ') : 'none'
      warnings.push(
        `tier '${tierName}' has effort '${cfg.effort}' but model '${resolvedModel}' does not accept effort (supports: ${supportedList}) — will be silently dropped`,
      )
    }
  }

  return { status: warnings.length === 0 ? 'pass' : 'warn', warnings }
}

// ─── Check 3: Agent migration completeness ───────────────────────────────────

/**
 * For each agent file with a `model:` field in frontmatter, asserts the
 * agent is listed in the `defaultsAgentsBlock` (the `agents:` block from
 * `defaults.ts`). Agents that carry an intentional pinned model must be
 * documented there. Agents without `model:` in frontmatter are always fine.
 *
 * Returns `fail` listing every agent that has `model:` in its frontmatter
 * but is NOT in the defaults agents block.
 *
 * @param agentFiles - Map of agent name → minimal frontmatter fields.
 * @param defaultsAgentsBlock - The `agents:` block from the defaults config,
 *   keyed by agent name.
 * @returns `status: 'pass'` if all model-bearing agents are documented, or
 *   `status: 'fail'` listing the undocumented offenders.
 */
export function checkAgentMigrationCompleteness(
  agentFiles: AgentFrontmatterMap,
  defaultsAgentsBlock: Record<string, AgentOverride>,
): { status: 'pass' | 'fail'; offenders: string[] } {
  const offenders: string[] = []
  for (const [name, fm] of agentFiles) {
    if (fm.model !== undefined && !(name in defaultsAgentsBlock)) {
      offenders.push(name)
    }
  }
  return { status: offenders.length === 0 ? 'pass' : 'fail', offenders }
}

// ─── Check 4: Stale installed tier names ─────────────────────────────────────

const STALE_TIER_NAMES = new Set(['standard', 'deep'])

/**
 * Checks whether the installed config (e.g. `~/.anvil/models.json`) still
 * has the legacy `standard` or `deep` tier keys. These were removed in
 * Plan 38 Phase B (pre-release, no migration shim).
 *
 * Returns `warn` (never `fail`) — stale installed config is tolerable but
 * should be cleaned up with `anvil install --reinstall`. Returns `pass` when
 * there are no stale keys or when `installedConfig` is `null` (no installed
 * config found).
 *
 * @param installedConfig - The parsed installed models config, or `null` if
 *   no installed config exists.
 * @returns `status: 'pass'` if no stale keys, or `status: 'warn'` listing
 *   the stale key names.
 */
export function checkStaleInstalledTiers(
  installedConfig: {
    tiers?: Record<string, unknown>
  } | null,
): { status: 'pass' | 'warn'; staleKeys: string[] } {
  if (installedConfig === null) {
    return { status: 'pass', staleKeys: [] }
  }
  const tiers = installedConfig.tiers ?? {}
  const staleKeys = Object.keys(tiers).filter((k) => STALE_TIER_NAMES.has(k))
  return { status: staleKeys.length === 0 ? 'pass' : 'warn', staleKeys }
}
