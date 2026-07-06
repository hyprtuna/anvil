import type { ProjectContext } from '../types.js'
import {
  RULES,
  type RecommendSurface,
  type RecommendationRule,
} from './rules.js'

export type RecommendSurfaceFilter =
  | 'skills'
  | 'hooks'
  | 'agents'
  | 'mcps'
  | 'all'

export interface Recommendation {
  surface: RecommendSurface
  slug: string
  /** Aggregate score: clamped sum of `baseScore` from every matched rule. */
  score: number
  /** One reason string per matched rule, deduplicated by content. */
  reasons: string[]
  /** Copy-pasteable install command. */
  install_cmd: string
  /** Rule ids that contributed to this recommendation. */
  ruleIds: string[]
}

export interface RecommendOptionsCore {
  surface?: RecommendSurfaceFilter
  /** Limit to top N after sort. */
  top?: number
}

const SURFACE_FILTER_TO_SURFACE: Record<
  Exclude<RecommendSurfaceFilter, 'all'>,
  RecommendSurface
> = {
  skills: 'skill',
  hooks: 'hook',
  agents: 'agent',
  mcps: 'mcp',
}

/**
 * Build a valid `anvil init` command for a recommended surface+slug.
 *
 * The flags `--skill`, `--hook`, `--agent`, `--mcp` do NOT exist on
 * `anvil init` (see src/commands/cli/init-command.ts). Until component-scoped
 * install lands (ANV-0005), we suggest `anvil init --preset balanced` — the
 * real working entry-point — followed by a descriptive note so the user knows
 * what they're installing. Fixes ANV-0015 / ANV-0063.
 */
function buildInstallCmd(surface: RecommendSurface, slug: string): string {
  return `anvil init --preset balanced  # then enable ${surface}:${slug} in your skill list`
}

function ruleMatches(rule: RecommendationRule, ctx: ProjectContext): boolean {
  const { signal } = rule
  if (
    signal.language !== undefined &&
    !ctx.languages.some((l) => l.name === signal.language)
  ) {
    return false
  }
  if (
    signal.framework !== undefined &&
    !ctx.frameworks.includes(signal.framework)
  ) {
    return false
  }
  if (
    signal.testRunner !== undefined &&
    !ctx.testRunners.includes(signal.testRunner)
  ) {
    return false
  }
  if (signal.ci === true && ctx.ci.length === 0) return false
  return true
}

/**
 * Pure function — given a project context and options, return ranked
 * recommendations. No I/O. No side effects.
 */
export function recommendForContext(
  ctx: ProjectContext,
  opts: RecommendOptionsCore = {},
): Recommendation[] {
  const surfaceFilter = opts.surface ?? 'all'
  const grouped = new Map<string, Recommendation>()

  for (const rule of RULES) {
    if (!ruleMatches(rule, ctx)) continue
    if (surfaceFilter !== 'all') {
      const wantSurface = SURFACE_FILTER_TO_SURFACE[surfaceFilter]
      if (rule.suggest.surface !== wantSurface) continue
    }

    const key = `${rule.suggest.surface}:${rule.suggest.slug}`
    const existing = grouped.get(key)
    if (existing) {
      existing.score = Math.min(1, existing.score + rule.baseScore)
      if (!existing.reasons.includes(rule.reason)) {
        existing.reasons.push(rule.reason)
      }
      existing.ruleIds.push(rule.id)
    } else {
      grouped.set(key, {
        surface: rule.suggest.surface,
        slug: rule.suggest.slug,
        score: Math.min(1, rule.baseScore),
        reasons: [rule.reason],
        install_cmd: buildInstallCmd(rule.suggest.surface, rule.suggest.slug),
        ruleIds: [rule.id],
      })
    }
  }

  const sorted = [...grouped.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.surface !== b.surface) return a.surface.localeCompare(b.surface)
    return a.slug.localeCompare(b.slug)
  })

  if (opts.top !== undefined && opts.top > 0) {
    return sorted.slice(0, opts.top)
  }
  return sorted
}
