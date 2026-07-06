/**
 * anvil ultra — autonomous ultra-worker agent (Plan 36 Phase F: adds --strict).
 *
 * --strict is orthogonal to --require-spec:
 *   --require-spec  checks artifact *existence* (won't run without spec/plan)
 *   --strict        flips workflow *gate strictness* (all WorkflowConfig gates → true)
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { loadAllAgents } from '../../agents/load-all.js'
import { prepareInvocation } from '../../agents/runner.js'
import { loadConfig } from '../../core/config/load.js'
import { WorkflowConfig as WorkflowConfigSchema } from '../../core/types.js'
import { route } from '../../intent/router.js'
import { loadAllSkills } from '../../skills/load-all.js'
import { buildStrictWorkflowConfig } from './plan.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_ROOT = join(__dirname, '..', '..', '..', 'agents')
const SKILLS_ROOT = join(__dirname, '..', '..', '..', 'skills')

export interface UltraOptions {
  /** --require-spec: refuse to run without a spec/plan in state.json */
  requireSpec?: boolean
  /**
   * --strict: flip all WorkflowConfig gates to true in-memory for this
   * invocation; escalate plan-verifier to subagent on failures.
   * Orthogonal to --require-spec: both can be passed simultaneously.
   */
  strict?: boolean
  /**
   * Plan 38 Phase D — per-invocation tier injection.
   * Resolved by `resolveModel` as `cli.tier` (sits between session and ENV layers;
   * `--model` wins on conflict).
   */
  tier?: string
  /**
   * Plan 40 Phase G — headless `--auto` mode. Prepends a HEADLESS-MODE
   * banner to the dispatch prompt; the runner pre-flight enforces
   * pass-cap (5) and per-pass tool budget (20). Banned-tool list is
   * deferred to v0.10.4 (D-04 finalization).
   */
  auto?: boolean
}

export async function ultraCommand(
  task: string,
  opts: UltraOptions = {},
): Promise<void> {
  const { strict = false, auto = false } = opts

  // --strict: flip all gates in-memory (advisory; no disk write)
  if (strict) {
    const base = WorkflowConfigSchema.parse({})
    const strictConfig = buildStrictWorkflowConfig(base)
    process.env.ANVIL_GATEGUARD = '1'
    process.stderr.write(
      `[anvil ultra] --strict: all workflow gates enabled for this invocation.\n  research_gate=${strictConfig.research_gate} plan_check=${strictConfig.plan_check} decision_coverage=${strictConfig.decision_coverage} verification=${strictConfig.verification} gateguard=${strictConfig.gateguard}\n`,
    )
  }

  const [agents, skills] = await Promise.all([
    loadAllAgents({ agentsRoot: AGENTS_ROOT }),
    loadAllSkills({ skillsRoot: SKILLS_ROOT }),
  ])
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  const routing = route(task, {
    availableSkills: new Set(skills.getAll().map((s) => s.frontmatter.name)),
    availableAgents: new Set(agents.getAll().map((a) => a.frontmatter.name)),
  })

  const strictSuffix = strict
    ? '\n\n[strict mode] All workflow gates are enabled. Escalate plan-verifier to subagent if validation fails.'
    : ''

  const invocation = prepareInvocation(
    agents,
    config,
    'ultra-worker',
    `Autonomous task: ${task}${strictSuffix}`,
    {
      routingDecision: routing,
      dispatchTierContext: opts.tier ? { tier: opts.tier } : undefined,
      auto,
    },
  )
  process.stdout.write(chalk.bold('# anvil ultra\n\n'))
  process.stdout.write(
    chalk.dim(
      `Model: ${invocation.resolvedModel.model}  Effort: ${invocation.resolvedModel.effort}\n`,
    ),
  )
  process.stdout.write(
    chalk.dim(`Max tokens: ${invocation.resolvedModel.max_tokens}\n`),
  )
  process.stdout.write(chalk.dim(`Max turns: ${invocation.maxTurns}\n`))
  process.stdout.write(
    chalk.dim(
      `Intent: ${routing.intent} (${routing.confidence.toFixed(2)})  Skills: ${
        routing.skills.join(', ') || '—'
      }\n\n`,
    ),
  )
  if (strict) {
    process.stdout.write(chalk.yellow('[strict mode ON]\n\n'))
  }
  if (auto) {
    process.stdout.write(
      chalk.yellow(
        '[--auto headless mode ON] pass-cap=5, per-pass tool budget=20\n\n',
      ),
    )
  }
  process.stdout.write(chalk.dim(`${'─'.repeat(72)}\n\n`))
  process.stdout.write(invocation.prompt)
  process.stdout.write('\n')
}
