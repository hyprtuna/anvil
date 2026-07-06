import type { AdapterContext, GeneratedFiles } from '../adapters/interface.js'
import { selectAdapters } from '../adapters/load-all.js'
import { loadAllAgents } from '../agents/load-all.js'
import {
  type ExpectedTokensAggregate,
  aggregateExpectedTokens,
} from '../core/expected-tokens.js'
import type {
  Agent,
  ModelsConfig,
  Scope,
  Skill,
  Target,
} from '../core/types.js'
import { loadAllHooks } from '../hooks/load-all.js'
import { loadAllSkills } from '../skills/load-all.js'

export interface InstallPlan {
  adapters: GeneratedFiles[]
  totalFiles: number
  scope: Scope
  target: Target
  /** All loaded skills at plan time — used by writeAnvilManifest (ANV-0014). */
  skills: Skill[]
  /** All loaded agents at plan time — used by the ANV-0114 aggregator. */
  agents: Agent[]
  /**
   * ANV-0114 — cumulative expected-token summary for the selection.
   * Available on every plan (including --dry-run) so callers can render
   * the install-budget line and the optional warning consistently.
   */
  expectedTokens: ExpectedTokensAggregate
}

export interface BuildPlanOptions {
  cwd: string
  scope: Scope
  target: Target
  config: ModelsConfig
  skillsRoot: string
  agentsRoot: string
  home?: string
}

export async function buildInstallPlan(
  opts: BuildPlanOptions,
): Promise<InstallPlan> {
  const skillRegistry = await loadAllSkills({ skillsRoot: opts.skillsRoot })
  const hookRegistry = loadAllHooks({ config: opts.config })
  const agentRegistry = await loadAllAgents({ agentsRoot: opts.agentsRoot })

  const ctx: AdapterContext = {
    cwd: opts.cwd,
    home: opts.home,
    scope: opts.scope,
    config: opts.config,
    skills: skillRegistry.getAll(),
    hooks: hookRegistry.getAll(),
    agents: agentRegistry.getAll(),
  }

  const adapters = selectAdapters(opts.target)
  const results: GeneratedFiles[] = []
  for (const adapter of adapters) results.push(await adapter.generate(ctx))

  const skills = skillRegistry.getAll()
  const agents = agentRegistry.getAll()
  return {
    adapters: results,
    totalFiles: results.reduce((sum, r) => sum + r.files.length, 0),
    scope: opts.scope,
    target: opts.target,
    skills,
    agents,
    expectedTokens: aggregateExpectedTokens(skills, agents),
  }
}
