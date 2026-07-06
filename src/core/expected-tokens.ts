/**
 * ANV-0114 — cumulative expected-token aggregator.
 *
 * Pure layer-0 helpers that sum the optional `expected_tokens` frontmatter
 * field across a selection of skills + agents and render a short summary
 * line for the installer / TUI. The installer's `--allow-large-bundle`
 * flag suppresses the warning rendered by `shouldWarnBundle`.
 *
 * Real token counting via tiktoken is deliberately out of scope — the
 * aggregator only consumes the author-declared `expected_tokens` field.
 */

import type { Agent, Skill } from './types.js'

/**
 * Default cumulative expected-token warning threshold (50,000).
 *
 * Above this value, the installer prints a yellow warn line and (in
 * interactive flows) recommends the `--allow-large-bundle` override.
 *
 * Override via `compression.expected_tokens_warn` in `models.json`.
 */
export const DEFAULT_EXPECTED_TOKENS_WARN = 50_000

/** Aggregated counts returned by {@link aggregateExpectedTokens}. */
export interface ExpectedTokensAggregate {
  /** Sum of `expected_tokens` across skills + agents that declare the field. */
  totalKnown: number
  /** Skills that declared `expected_tokens` (any non-negative value, incl. 0). */
  knownSkillCount: number
  /** Agents that declared `expected_tokens`. */
  knownAgentCount: number
  /** Skills missing `expected_tokens`. */
  unknownSkillCount: number
  /** Agents missing `expected_tokens`. */
  unknownAgentCount: number
  /** Total skills in the selection (known + unknown). */
  skillCount: number
  /** Total agents in the selection (known + unknown). */
  agentCount: number
}

/**
 * Sum `expected_tokens` across the selection. Skills/agents missing the
 * field are counted in the `unknown*` buckets but contribute zero to
 * `totalKnown` — they remain installable.
 */
export function aggregateExpectedTokens(
  skills: ReadonlyArray<Skill>,
  agents: ReadonlyArray<Agent>,
): ExpectedTokensAggregate {
  let totalKnown = 0
  let knownSkillCount = 0
  let unknownSkillCount = 0
  let knownAgentCount = 0
  let unknownAgentCount = 0

  for (const s of skills) {
    const v = s.frontmatter.expected_tokens
    if (typeof v === 'number') {
      totalKnown += v
      knownSkillCount += 1
    } else {
      unknownSkillCount += 1
    }
  }
  for (const a of agents) {
    const v = a.frontmatter.expected_tokens
    if (typeof v === 'number') {
      totalKnown += v
      knownAgentCount += 1
    } else {
      unknownAgentCount += 1
    }
  }

  return {
    totalKnown,
    knownSkillCount,
    knownAgentCount,
    unknownSkillCount,
    unknownAgentCount,
    skillCount: skills.length,
    agentCount: agents.length,
  }
}

/**
 * Returns true when the selection-wide known-token total strictly exceeds
 * the configured threshold. Boundary is inclusive — equal-to-threshold
 * never warns (matches the doctor-row convention).
 */
export function shouldWarnBundle(
  agg: Pick<ExpectedTokensAggregate, 'totalKnown'>,
  threshold: number,
): boolean {
  return agg.totalKnown > threshold
}

/**
 * Render the canonical install-summary line:
 *
 *   `selected 12 skills + 5 agents = ~38k expected tokens`
 *
 * When some items lack `expected_tokens`, an additional clause notes how
 * many items are uncounted so the user can read the number as a lower
 * bound rather than a complete total.
 */
export function formatExpectedTokensSummary(
  agg: ExpectedTokensAggregate,
): string {
  const tokens = formatTokenCount(agg.totalKnown)
  const base = `selected ${agg.skillCount} skill${plural(agg.skillCount)} + ${agg.agentCount} agent${plural(agg.agentCount)} = ${tokens} expected tokens`
  const unknown = agg.unknownSkillCount + agg.unknownAgentCount
  if (unknown === 0) return base
  return `${base} (+ ${unknown} with no declared budget)`
}

function plural(n: number): string {
  return n === 1 ? '' : 's'
}

function formatTokenCount(n: number): string {
  if (n < 1_000) return `~${n}`
  // Single-decimal "k" for sub-10k, integer "k" above 10k.
  const k = n / 1_000
  if (n < 10_000) {
    // Trim trailing .0
    return `~${k.toFixed(1).replace(/\.0$/, '')}k`
  }
  return `~${Math.round(k)}k`
}
