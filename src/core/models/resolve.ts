import { findNearest } from '../_levenshtein.js'
import type {
  ActiveModelFile,
  EffortLevel as EffortLevelType,
  ModelCapabilitySnapshot,
  ModelResolution,
  ModelsConfig,
  ResolutionSource,
} from '../types.js'
import { EffortLevel } from '../types.js'
import { resolveAlias } from './aliases.js'
import { lookupCapability } from './capability-snapshot.js'
import {
  BUILTIN_SUPPORTED_EFFORTS,
  type SupportedEffortsMap,
  clampEffortWithTrace,
} from './effort.js'

/**
 * Thrown when `ResolveOptions.cli.tier` names a tier that does not exist in
 * `ModelsConfig.tiers`. Loud failure — a CLI typo must never silently degrade
 * to the default model; the operator needs to know immediately.
 *
 * The error message includes the list of known tiers and the Levenshtein-nearest
 * suggestion so the user can fix the typo quickly.
 */
export class UnknownTierError extends Error {
  constructor(tierName: string, knownTiers: string[]) {
    const suggestion = findNearest(tierName, knownTiers)
    const hint = suggestion ? ` Did you mean "${suggestion}"?` : ''
    super(
      `[cli-tier] Unknown tier "${tierName}".${hint} Known tiers: ${knownTiers.join(', ')}.`,
    )
    this.name = 'UnknownTierError'
  }
}

export interface ResolveOptions {
  cli?: {
    model?: string
    effort?: EffortLevelType
    max_tokens?: number
    fallback_chain?: string[]
    /**
     * Plan 38 Phase D — per-invocation tier injection.
     * When present, the resolver looks up `config.tiers[tier]` and resolves
     * to that tier's `{model, effort}` pair. Sits between `cli.model` (which
     * wins on conflict) and the session layer.
     * Source-tag = `'cli-tier'`.
     */
    tier?: string
  }
  /**
   * Session-scoped override loaded from `.anvil/active-model.json`.
   * Sits between CLI (layer 1) and ENV (layer 3).  Pass the parsed
   * ActiveModelFile object; the caller is responsible for reading the
   * file (keeping `resolveModel` pure).
   */
  session?: ActiveModelFile | null
  env?: Record<string, string | undefined>
  /**
   * Plan 36 Phase B — model gate from agent frontmatter.
   * When present and non-empty, the resolved model must be one of the listed
   * model IDs. If not, the resolver throws an explicit gate error.
   * An empty list means no restriction.
   */
  requires_any_model?: string[]
  /**
   * Plan 38 Phase A — provider-extensible supported-efforts registry.
   * Defaults to `BUILTIN_SUPPORTED_EFFORTS`. Injected in tests to avoid
   * global state mutation.
   */
  registry?: SupportedEffortsMap
  /**
   * ANV-0033 — Optional bundled capability snapshot.
   * When present, `resolveModel()` stamps `capability_source` on the returned
   * `ModelResolution`. When absent, `capability_source` is omitted (D-06).
   * Pass `loadBundledSnapshot()` from callers that want provenance; omit for
   * backward-compat call sites.
   */
  capabilityRegistry?: ModelCapabilitySnapshot
}

/**
 * Picks the `fallback_chain` from the highest-precedence layer that defines
 * a non-empty array. Returns the chain and the layer name that sourced it.
 *
 * Precedence (highest first): cli → override → group → default.
 * Session and ENV layers do not carry a fallback_chain — they inherit from
 * lower layers to keep the session/env override surface minimal.
 */
function pickFallbackChain(
  config: ModelsConfig,
  skillName: string,
  cliChain: string[] | undefined,
): { chain: string[]; source: ResolutionSource | undefined } {
  // CLI wins if a non-empty chain is provided directly
  if (cliChain && cliChain.length > 0) {
    return {
      chain: cliChain.map((m) => resolveAlias(m, config.model_aliases)),
      source: 'cli',
    }
  }

  // Per-skill override
  const override = config.overrides?.[skillName]
  if (override?.fallback_chain && override.fallback_chain.length > 0) {
    return {
      chain: override.fallback_chain.map((m) =>
        resolveAlias(m, config.model_aliases),
      ),
      source: 'override',
    }
  }

  // Group membership
  for (const group of Object.values(config.groups)) {
    if (group.members.includes(skillName) && group.fallback_chain.length > 0) {
      return {
        chain: group.fallback_chain.map((m) =>
          resolveAlias(m, config.model_aliases),
        ),
        source: 'group',
      }
    }
  }

  // Defaults
  if (config.defaults.fallback_chain.length > 0) {
    return {
      chain: config.defaults.fallback_chain.map((m) =>
        resolveAlias(m, config.model_aliases),
      ),
      source: 'default',
    }
  }

  return { chain: [], source: undefined }
}

/**
 * Checks the requires_any_model gate: if opts.requires_any_model is a non-empty
 * list, the resolved model must be one of the listed IDs.
 * Throws an explicit gate error (not a silent fallback) if the check fails.
 */
function checkRequiresAnyModel(
  resolvedModel: string,
  requiresAnyModel: string[] | undefined,
  skillName: string,
): void {
  if (!requiresAnyModel || requiresAnyModel.length === 0) return
  if (!requiresAnyModel.includes(resolvedModel)) {
    throw new Error(
      `[requires_any_model] Agent "${skillName}" resolved to "${resolvedModel}" but requires one of: ${requiresAnyModel.join(', ')}. Use a CLI override (--model), ENV (ANVIL_MODEL), or per-agent config to supply an allowed model.`,
    )
  }
}

/**
 * Applies `clampEffortWithTrace` to a provisional `ModelResolution`.
 * Returns the same object with `.effort` replaced by the clamped value.
 * The clamping trace is emitted to the `_effortClamp` side-channel for
 * `trace.ts` to pick up — stored as a non-enumerable symbol so it doesn't
 * appear in serialised output.
 *
 * Plan 38 Phase A.
 */
const EFFORT_CLAMP_KEY = Symbol('effortClamp')

export function getEffortClamp(
  resolution: ModelResolution,
): { clamped: boolean; reason?: string; original?: string } | undefined {
  return (resolution as Record<symbol, unknown>)[EFFORT_CLAMP_KEY] as
    | { clamped: boolean; reason?: string; original?: string }
    | undefined
}

function applyEffortClamp(
  resolution: ModelResolution,
  registry: SupportedEffortsMap,
): ModelResolution {
  const { effort, clamped, reason } = clampEffortWithTrace(
    resolution.model,
    resolution.effort,
    registry,
  )
  const result = { ...resolution, effort }
  if (clamped) {
    Object.defineProperty(result, EFFORT_CLAMP_KEY, {
      value: { clamped: true, reason, original: resolution.effort },
      enumerable: false,
      writable: false,
    })
  }
  return result
}

/**
 * ANV-0033 — Stamps `capability_source` onto a resolved `ModelResolution`.
 * When `opts.capabilityRegistry` is absent, returns `resolution` unchanged (D-06).
 */
function withCapabilitySource(
  resolution: ModelResolution,
  opts: ResolveOptions,
): ModelResolution {
  if (!opts.capabilityRegistry) return resolution
  const { source } = lookupCapability(resolution.model, opts.capabilityRegistry)
  return { ...resolution, capability_source: source }
}

/**
 * Resolves a skill's model/effort/max_tokens through the 7-layer chain:
 *   CLI → session → ENV → agent-override → tier → per-skill override → group → defaults.
 * Pure function — reads only what's passed in.
 *
 * New in Plan 36 Phase B:
 *   Layer 4 — agent-override: ModelsConfig.agents.<name>.model
 *   Layer 5 — tier:           ModelsConfig.agents.<name>.tier → ModelsConfig.tiers.<tier>.model
 *
 * `fallback_chain` is resolved independently using "highest non-empty layer
 * wins" semantics across: cli → override → group → default.
 *
 * New in Plan 38 Phase A:
 *   After concrete model resolution, effort is clamped via `clampEffortWithTrace`
 *   to the highest level the model accepts. Haiku drops effort entirely.
 */
export function resolveModel(
  skillName: string,
  config: ModelsConfig,
  opts: ResolveOptions = {},
): ModelResolution {
  const registry = opts.registry ?? BUILTIN_SUPPORTED_EFFORTS
  const defaults = config.defaults
  const { chain: fallback_chain, source: fallback_chain_source } =
    pickFallbackChain(config, skillName, opts.cli?.fallback_chain)

  const common = {
    fallback_model:
      defaults.fallback_model !== undefined
        ? resolveAlias(defaults.fallback_model, config.model_aliases)
        : undefined,
    fallback_chain,
    ...(fallback_chain_source !== undefined ? { fallback_chain_source } : {}),
  }

  // Layer 1: CLI (explicit --model flag; highest authority)
  if (opts.cli?.model) {
    const model = resolveAlias(opts.cli.model, config.model_aliases)
    // Conflict: --model wins over --tier; emit a structured warning when both present.
    if (opts.cli?.tier) {
      const warning = {
        type: 'tier_overridden_by_model' as const,
        tier: opts.cli.tier,
        model: opts.cli.model,
        message: `tier_overridden_by_model: tier='${opts.cli.tier}' lost to model='${opts.cli.model}'`,
      }
      // Attach as non-enumerable symbol so callers can inspect it (trace.ts picks it up)
      ;(opts as Record<string, unknown>).__tierOverrideWarning = warning
    }
    checkRequiresAnyModel(model, opts.requires_any_model, skillName)
    return withCapabilitySource(
      applyEffortClamp(
        {
          model,
          effort: opts.cli.effort ?? defaults.effort,
          max_tokens: opts.cli.max_tokens ?? defaults.max_tokens,
          source: 'cli',
          ...common,
        },
        registry,
      ),
      opts,
    )
  }

  // Layer 1b: CLI tier (--tier flag; sits after --model, before session)
  // When present, looks up the named tier in config.tiers and resolves model+effort.
  // Throws UnknownTierError on unknown tier name (typos must not silently degrade).
  if (opts.cli?.tier) {
    const knownTiers = Object.keys(config.tiers ?? {})
    const tierConfig = config.tiers?.[opts.cli.tier]
    if (!tierConfig) {
      throw new UnknownTierError(opts.cli.tier, knownTiers)
    }
    const model = resolveAlias(tierConfig.model, config.model_aliases)
    checkRequiresAnyModel(model, opts.requires_any_model, skillName)
    return withCapabilitySource(
      applyEffortClamp(
        {
          model,
          effort: tierConfig.effort ?? defaults.effort,
          max_tokens: opts.cli.max_tokens ?? defaults.max_tokens,
          source: 'cli-tier',
          ...common,
        },
        registry,
      ),
      opts,
    )
  }

  // Layer 2: Session override (.anvil/active-model.json)
  if (opts.session?.model) {
    const model = resolveAlias(opts.session.model, config.model_aliases)
    checkRequiresAnyModel(model, opts.requires_any_model, skillName)
    return withCapabilitySource(
      applyEffortClamp(
        {
          model,
          effort: opts.session.effort ?? defaults.effort,
          max_tokens: defaults.max_tokens,
          source: 'session',
          ...common,
        },
        registry,
      ),
      opts,
    )
  }

  // Layer 3: ENV
  const envModel = opts.env?.ANVIL_MODEL
  if (envModel) {
    const rawEffort = opts.env?.ANVIL_EFFORT
    const parsedEffort = rawEffort
      ? EffortLevel.safeParse(rawEffort)
      : undefined
    if (rawEffort && !parsedEffort?.success) {
      throw new Error(
        `Invalid ANVIL_EFFORT=${JSON.stringify(rawEffort)}; expected one of: low, normal, high, max`,
      )
    }
    const model = resolveAlias(envModel, config.model_aliases)
    checkRequiresAnyModel(model, opts.requires_any_model, skillName)
    return withCapabilitySource(
      applyEffortClamp(
        {
          model,
          effort: parsedEffort?.success ? parsedEffort.data : defaults.effort,
          max_tokens: defaults.max_tokens,
          source: 'env',
          ...common,
        },
        registry,
      ),
      opts,
    )
  }

  // Layer 4: Agent-override (ModelsConfig.agents.<name>.model)
  // Wins when the agents table has a direct model pin for this skill/agent.
  const agentConfig = config.agents?.[skillName]
  if (agentConfig?.model) {
    const model = resolveAlias(agentConfig.model, config.model_aliases)
    checkRequiresAnyModel(model, opts.requires_any_model, skillName)
    return withCapabilitySource(
      applyEffortClamp(
        {
          model,
          effort: defaults.effort,
          max_tokens: defaults.max_tokens,
          source: 'agent-override',
          ...common,
        },
        registry,
      ),
      opts,
    )
  }

  // Layer 5: Tier (ModelsConfig.agents.<name>.tier → ModelsConfig.tiers.<tier>.model)
  // Wins when the agents table has a tier reference and the tier resolves.
  // Falls through (no error) when the tier name is missing from the tiers table.
  if (agentConfig?.tier) {
    const tierConfig = config.tiers?.[agentConfig.tier]
    if (tierConfig) {
      const model = resolveAlias(tierConfig.model, config.model_aliases)
      checkRequiresAnyModel(model, opts.requires_any_model, skillName)
      return withCapabilitySource(
        applyEffortClamp(
          {
            model,
            effort: tierConfig.effort ?? defaults.effort,
            max_tokens: defaults.max_tokens,
            source: 'tier',
            ...common,
          },
          registry,
        ),
        opts,
      )
    }
    // Tier name not found in tiers map → fall through to group/default
  }

  // Layer 6: Per-skill override (ModelsConfig.overrides)
  const override = config.overrides?.[skillName]
  if (override) {
    const model = resolveAlias(override.model, config.model_aliases)
    checkRequiresAnyModel(model, opts.requires_any_model, skillName)
    return withCapabilitySource(
      applyEffortClamp(
        {
          model,
          effort: override.effort,
          max_tokens: override.max_tokens ?? defaults.max_tokens,
          source: 'override',
          ...common,
        },
        registry,
      ),
      opts,
    )
  }

  // Layer 7: Group membership
  for (const group of Object.values(config.groups)) {
    if (group.members.includes(skillName)) {
      const model = resolveAlias(group.model, config.model_aliases)
      checkRequiresAnyModel(model, opts.requires_any_model, skillName)
      return withCapabilitySource(
        applyEffortClamp(
          {
            model,
            effort: group.effort,
            max_tokens: defaults.max_tokens,
            source: 'group',
            ...common,
          },
          registry,
        ),
        opts,
      )
    }
  }

  // Layer 8 (final): Defaults
  const model = resolveAlias(defaults.model, config.model_aliases)
  checkRequiresAnyModel(model, opts.requires_any_model, skillName)
  return withCapabilitySource(
    applyEffortClamp(
      {
        model,
        effort: defaults.effort,
        max_tokens: defaults.max_tokens,
        source: 'default',
        ...common,
      },
      registry,
    ),
    opts,
  )
}
