import type { ModelsConfig, ResolutionSource } from '../types.js'
import { resolveAlias } from './aliases.js'
import { lookupCapability } from './capability-snapshot.js'
import { BUILTIN_SUPPORTED_EFFORTS, clampEffortWithTrace } from './effort.js'
import type { ResolveOptions } from './resolve.js'

export interface TraceEntry {
  layer: ResolutionSource
  match: boolean
  resolvedModel?: string
  note?: string
  /** The fallback_chain that would be used if this layer wins the primary resolution. */
  fallback_chain?: string[]
  /**
   * The layer that sourced the fallback_chain (may differ from the winning
   * primary model layer — chain uses "highest non-empty layer wins" separately).
   */
  fallback_chain_source?: ResolutionSource
  /**
   * Plan 38 Phase A — effort clamping trace.
   * Populated only on the winning layer when the resolved effort was clamped.
   * Format: `effort_clamped: '<requested>' → '<final>' (model '<id>' supports: [<list>])`
   */
  effort_clamped?: string
}

/**
 * Computes the winning fallback_chain and its source layer using the
 * "highest non-empty layer wins" rule.
 *
 * Precedence: cli → override → group → default.
 * Session / ENV layers do not carry a fallback_chain.
 */
function computeFallbackChainSource(
  config: ModelsConfig,
  skillName: string,
  cliChain: string[] | undefined,
): { chain: string[]; source: ResolutionSource | undefined } {
  if (cliChain && cliChain.length > 0) {
    return {
      chain: cliChain.map((m) => resolveAlias(m, config.model_aliases)),
      source: 'cli',
    }
  }
  const override = config.overrides?.[skillName]
  if (override?.fallback_chain && override.fallback_chain.length > 0) {
    return {
      chain: override.fallback_chain.map((m) =>
        resolveAlias(m, config.model_aliases),
      ),
      source: 'override',
    }
  }
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
 * Walks every layer of the resolution chain and reports which layer
 * would resolve the skill. Useful for `anvil models show <skill>`.
 *
 * Each entry includes `fallback_chain` and `fallback_chain_source` so callers
 * can see both what the primary model source is and where the fallback cascade
 * was sourced from (these may differ).
 */
export function traceResolution(
  skillName: string,
  config: ModelsConfig,
  opts: ResolveOptions = {},
): TraceEntry[] {
  const trace: TraceEntry[] = []
  let resolved = false

  const { chain: fallbackChain, source: fallbackChainSource } =
    computeFallbackChainSource(config, skillName, opts.cli?.fallback_chain)

  // Layer 1: CLI
  if (opts.cli?.model) {
    trace.push({
      layer: 'cli',
      match: true,
      resolvedModel: resolveAlias(opts.cli.model, config.model_aliases),
      note: 'CLI --model flag',
      fallback_chain: fallbackChain,
      fallback_chain_source: fallbackChainSource,
    })
    resolved = true
  } else {
    trace.push({ layer: 'cli', match: false, note: 'no --model flag' })
  }

  // Layer 1b: CLI-tier (--tier flag; only fires when --model is absent)
  if (opts.cli?.tier) {
    const tierConfig = config.tiers?.[opts.cli.tier]
    if (tierConfig) {
      trace.push({
        layer: 'cli-tier',
        match: !resolved,
        resolvedModel: resolveAlias(tierConfig.model, config.model_aliases),
        note: `CLI --tier="${opts.cli.tier}" resolved via tiers.${opts.cli.tier}.model`,
        fallback_chain: fallbackChain,
        fallback_chain_source: fallbackChainSource,
      })
      if (!resolved) resolved = true
    } else {
      trace.push({
        layer: 'cli-tier',
        match: false,
        note: `CLI --tier="${opts.cli.tier}" not found in tiers map`,
      })
    }
  } else {
    trace.push({ layer: 'cli-tier', match: false, note: 'no --tier flag' })
  }

  // Layer 2: Session (.anvil/active-model.json)
  if (opts.session?.model) {
    trace.push({
      layer: 'session',
      match: !resolved,
      resolvedModel: resolveAlias(opts.session.model, config.model_aliases),
      note: 'active-model.json session override',
      fallback_chain: fallbackChain,
      fallback_chain_source: fallbackChainSource,
    })
    if (!resolved) resolved = true
  } else {
    trace.push({ layer: 'session', match: false, note: 'no session override' })
  }

  // Layer 3: ENV
  if (opts.env?.ANVIL_MODEL) {
    trace.push({
      layer: 'env',
      match: !resolved,
      resolvedModel: resolveAlias(opts.env.ANVIL_MODEL, config.model_aliases),
      note: 'ANVIL_MODEL env var',
      fallback_chain: fallbackChain,
      fallback_chain_source: fallbackChainSource,
    })
    if (!resolved) resolved = true
  } else {
    trace.push({ layer: 'env', match: false, note: 'ANVIL_MODEL not set' })
  }

  // Layer 4 (new): Agent-override (ModelsConfig.agents.<name>.model)
  const agentConfig = config.agents?.[skillName]
  if (agentConfig?.model) {
    trace.push({
      layer: 'agent-override',
      match: !resolved,
      resolvedModel: resolveAlias(agentConfig.model, config.model_aliases),
      note: `agents.${skillName}.model pin`,
      fallback_chain: fallbackChain,
      fallback_chain_source: fallbackChainSource,
    })
    if (!resolved) resolved = true
  } else {
    trace.push({
      layer: 'agent-override',
      match: false,
      note: `no agents.${skillName}.model pin`,
    })
  }

  // Layer 5 (new): Tier (ModelsConfig.agents.<name>.tier → ModelsConfig.tiers.<tier>.model)
  if (agentConfig?.tier) {
    const tierConfig = config.tiers?.[agentConfig.tier]
    if (tierConfig) {
      trace.push({
        layer: 'tier',
        match: !resolved,
        resolvedModel: resolveAlias(tierConfig.model, config.model_aliases),
        note: `agents.${skillName}.tier="${agentConfig.tier}" → tiers.${agentConfig.tier}.model`,
        fallback_chain: fallbackChain,
        fallback_chain_source: fallbackChainSource,
      })
      if (!resolved) resolved = true
    } else {
      trace.push({
        layer: 'tier',
        match: false,
        note: `agents.${skillName}.tier="${agentConfig.tier}" not found in tiers map — falling through`,
      })
    }
  } else {
    trace.push({
      layer: 'tier',
      match: false,
      note: `no agents.${skillName}.tier reference`,
    })
  }

  // Layer 6: Override (per-skill override)
  const override = config.overrides?.[skillName]
  if (override) {
    trace.push({
      layer: 'override',
      match: !resolved,
      resolvedModel: resolveAlias(override.model, config.model_aliases),
      note: override.note ?? 'per-skill override',
      fallback_chain: fallbackChain,
      fallback_chain_source: fallbackChainSource,
    })
    if (!resolved) resolved = true
  } else {
    trace.push({
      layer: 'override',
      match: false,
      note: `no override for "${skillName}"`,
    })
  }

  // Layer 7: Group
  let groupMatch: { name: string; model: string } | undefined
  for (const [name, group] of Object.entries(config.groups)) {
    if (group.members.includes(skillName)) {
      groupMatch = { name, model: group.model }
      break
    }
  }
  if (groupMatch) {
    trace.push({
      layer: 'group',
      match: !resolved,
      resolvedModel: resolveAlias(groupMatch.model, config.model_aliases),
      note: `member of "${groupMatch.name}" group`,
      fallback_chain: fallbackChain,
      fallback_chain_source: fallbackChainSource,
    })
    if (!resolved) resolved = true
  } else {
    trace.push({
      layer: 'group',
      match: false,
      note: 'not a member of any group',
    })
  }

  // Layer 8: Default — always has a value, matches only if nothing else resolved
  trace.push({
    layer: 'default',
    match: !resolved,
    resolvedModel: resolveAlias(config.defaults.model, config.model_aliases),
    note: 'global default',
    fallback_chain: fallbackChain,
    fallback_chain_source: fallbackChainSource,
  })

  // Plan 38 Phase A — annotate the winning entry with effort clamp info.
  // Walk through and find the matching entry, then check if clamping would apply.
  const registry = opts.registry ?? BUILTIN_SUPPORTED_EFFORTS
  for (const entry of trace) {
    if (entry.match && entry.resolvedModel) {
      // Determine the effort that would be resolved at this layer.
      // We replicate the effort resolution logic here for trace annotation only.
      let resolvedEffort = config.defaults.effort
      if (entry.layer === 'cli') {
        resolvedEffort = opts.cli?.effort ?? config.defaults.effort
      } else if (entry.layer === 'cli-tier') {
        const tierCfg = opts.cli?.tier
          ? config.tiers?.[opts.cli.tier]
          : undefined
        resolvedEffort = tierCfg?.effort ?? config.defaults.effort
      } else if (entry.layer === 'session') {
        resolvedEffort = opts.session?.effort ?? config.defaults.effort
      } else if (entry.layer === 'env') {
        const rawEffort = opts.env?.ANVIL_EFFORT
        if (rawEffort) {
          const known = ['low', 'medium', 'high', 'xhigh', 'max'] as const
          type K = (typeof known)[number]
          if ((known as ReadonlyArray<string>).includes(rawEffort)) {
            resolvedEffort = rawEffort as K
          }
        }
      } else if (entry.layer === 'tier') {
        const agentCfg = config.agents?.[skillName]
        if (agentCfg?.tier) {
          const tierCfg = config.tiers?.[agentCfg.tier]
          resolvedEffort = tierCfg?.effort ?? config.defaults.effort
        }
      } else if (entry.layer === 'override') {
        const ov = config.overrides?.[skillName]
        if (ov) resolvedEffort = ov.effort
      } else if (entry.layer === 'group') {
        for (const group of Object.values(config.groups)) {
          if (group.members.includes(skillName)) {
            resolvedEffort = group.effort
            break
          }
        }
      }
      const { clamped, reason } = clampEffortWithTrace(
        entry.resolvedModel,
        resolvedEffort,
        registry,
      )
      if (clamped && reason) {
        entry.effort_clamped = reason
      }
      // ANV-0033 — Stamp provenance on the winning entry's note when a
      // capabilityRegistry is provided (D-03).
      if (opts.capabilityRegistry) {
        const { source } = lookupCapability(
          entry.resolvedModel,
          opts.capabilityRegistry,
        )
        const provenanceNote = `capability_source: ${source}`
        entry.note = entry.note
          ? `${entry.note} | ${provenanceNote}`
          : provenanceNote
      }
      break
    }
  }

  return trace
}
