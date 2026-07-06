import type { ModelsConfig, PresetName } from '../types.js'
import { buildDefaultConfig } from './defaults.js'

// Short aliases — see src/core/config/defaults.ts for rationale. The resolver
// expands these via BUILTIN_MODEL_ALIASES at use-time, and users on
// non-Anthropic providers override via models.json model_aliases.
const OPUS = 'opus'
const SONNET = 'sonnet'
const HAIKU = 'haiku'

export function buildPreset(preset: PresetName): ModelsConfig {
  switch (preset) {
    case 'balanced':
      return buildDefaultConfig()
    case 'cost-optimised':
      return buildCostOptimised()
    case 'max-quality':
      return buildMaxQuality()
    case 'speed-first':
      return buildSpeedFirst()
  }
}

function buildCostOptimised(): ModelsConfig {
  const base = buildDefaultConfig()
  return {
    ...base,
    defaults: { ...base.defaults, model: HAIKU, effort: 'low' },
    groups: {
      ...base.groups,
      planning: { ...base.groups.planning, model: SONNET, effort: 'medium' },
      review: { ...base.groups.review, model: SONNET, effort: 'medium' },
      development: {
        ...base.groups.development,
        model: SONNET,
        effort: 'medium',
      },
      testing: { ...base.groups.testing, model: HAIKU, effort: 'low' },
      automation: { ...base.groups.automation, model: HAIKU, effort: 'low' },
      autonomous: { ...base.groups.autonomous, model: OPUS, effort: 'max' },
      meta: { ...base.groups.meta, model: HAIKU, effort: 'low' },
    },
  }
}

function buildMaxQuality(): ModelsConfig {
  const base = buildDefaultConfig()
  return {
    ...base,
    defaults: { ...base.defaults, model: OPUS, effort: 'high' },
    groups: Object.fromEntries(
      Object.entries(base.groups).map(([name, group]) => [
        name,
        { ...group, model: OPUS, effort: 'high' as const },
      ]),
    ) as typeof base.groups,
  }
}

function buildSpeedFirst(): ModelsConfig {
  const base = buildDefaultConfig()
  return {
    ...base,
    defaults: { ...base.defaults, model: HAIKU, effort: 'low' },
    groups: {
      ...base.groups,
      planning: { ...base.groups.planning, model: SONNET, effort: 'medium' },
      review: { ...base.groups.review, model: SONNET, effort: 'medium' },
      development: {
        ...base.groups.development,
        model: SONNET,
        effort: 'medium',
      },
      testing: { ...base.groups.testing, model: HAIKU, effort: 'low' },
      automation: { ...base.groups.automation, model: HAIKU, effort: 'low' },
      autonomous: { ...base.groups.autonomous, model: SONNET, effort: 'high' },
      meta: { ...base.groups.meta, model: HAIKU, effort: 'low' },
    },
  }
}
