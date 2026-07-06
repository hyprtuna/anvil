/**
 * ANV-0003 — Agent permission taxonomy coverage computation.
 *
 * Pure function consumed by `pushAgentPermissionCheck` (doctor row).
 *
 * For each agent we look at:
 *   1. Slug suffix → permission class (via `classifyAgentSuffix`).
 *   2. Declared `tools:` field on the frontmatter.
 *   3. Optional `disallowedTools:` field (CC denies these even if listed in tools).
 *
 * Effective tools = `tools` minus `disallowedTools`. A read-only class is
 * "drifted" when its effective tools contain anything in `forbiddenTools`
 * (currently `Edit` or `Bash`).
 *
 * Write-capable classes never drift; missing tools are not a fault here —
 * that is a per-agent decision documented in their respective ticket.
 * Unclassified agents (no recognised suffix) are skipped silently — the
 * slug-namespace doctor row catches those separately.
 */

import {
  AGENT_PERMISSION_TAXONOMY,
  type AgentPermissionClass,
  type AgentTool,
  classifyAgentSuffix,
} from '../../../core/types.js'

export interface AgentPermissionInput {
  /** Agent slug / frontmatter name (e.g. "code-explorer"). */
  name: string
  /** Tools declared on the agent's frontmatter. */
  tools: readonly AgentTool[]
  /** Optional deny list — CC subtracts these from `tools` at runtime. */
  disallowedTools?: readonly AgentTool[] | undefined
}

export interface AgentPermissionViolation {
  /** Agent slug. */
  name: string
  /** Resolved permission class. */
  class: AgentPermissionClass
  /** Tools the class forbids that are present on this agent's effective set. */
  unexpectedTools: readonly AgentTool[]
  /** Expected tools for this class (informational, for remediation hints). */
  expectedTools: readonly AgentTool[]
}

export interface AgentPermissionCoverageResult {
  /** Overall status for the doctor row. */
  status: 'pass' | 'warn' | 'skip'
  /** Total number of classified agents that were checked. */
  total: number
  /** Number of classified agents without any violation. */
  clean: number
  /** Agents flagged for carrying tools their class forbids. */
  violations: readonly AgentPermissionViolation[]
  /** Agents whose slug did not match any class (informational, not a fault). */
  unclassified: readonly string[]
}

/**
 * Compute the effective tool set for an agent (`tools` minus `disallowedTools`).
 * Order is preserved from the input `tools` array.
 */
export function computeEffectiveTools(
  tools: readonly AgentTool[],
  disallowed: readonly AgentTool[] | undefined,
): readonly AgentTool[] {
  if (!disallowed || disallowed.length === 0) return tools
  const deny = new Set(disallowed)
  return tools.filter((t) => !deny.has(t))
}

/**
 * Pure coverage function. Given a list of agent inputs, returns a coverage
 * summary identifying which classified read-only agents carry forbidden tools.
 */
export function computeAgentPermissionCoverage(
  agents: readonly AgentPermissionInput[],
): AgentPermissionCoverageResult {
  if (agents.length === 0) {
    return {
      status: 'skip',
      total: 0,
      clean: 0,
      violations: [],
      unclassified: [],
    }
  }

  const violations: AgentPermissionViolation[] = []
  const unclassified: string[] = []
  let classified = 0

  for (const agent of agents) {
    const cls = classifyAgentSuffix(agent.name)
    if (cls === null) {
      unclassified.push(agent.name)
      continue
    }
    classified++

    const entry = AGENT_PERMISSION_TAXONOMY[cls]
    const effective = computeEffectiveTools(agent.tools, agent.disallowedTools)
    const forbidden = new Set(entry.forbiddenTools)
    const unexpected = effective.filter((t) => forbidden.has(t))

    if (unexpected.length > 0) {
      violations.push({
        name: agent.name,
        class: cls,
        unexpectedTools: unexpected,
        expectedTools: entry.allowedTools,
      })
    }
  }

  return {
    status:
      classified === 0 ? 'skip' : violations.length === 0 ? 'pass' : 'warn',
    total: classified,
    clean: classified - violations.length,
    violations,
    unclassified,
  }
}
