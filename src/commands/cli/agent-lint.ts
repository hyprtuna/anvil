import { join } from 'node:path'
import chalk from 'chalk'
import { getUserHome } from '../../core/io/home.js'
import { resolveLintRoots } from '../../core/lint-roots.js'
import { runAgentLintChecks } from './agent-lint-checks.js'
import type { CliOptions } from './common/json-mode.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { LintCheckResult } from './common/lint-check.js'

export interface AgentLintOptions extends CliOptions {
  target?: string
  strict?: boolean
  /** Internal: override cwd (for testing). Defaults to process.cwd(). */
  cwd?: string
  /** Internal: override anvilHome (for testing). Defaults to ~/.anvil. */
  anvilHome?: string
}

/**
 * `anvil agent lint [--target <path>] [--json] [--strict]`
 *
 * Resolves agent roots (project `.claude/agents`, user `~/.anvil/agents`, or
 * an explicit `--target`) and runs the 4 agent-author checks against them.
 *
 * ANV-0184: migrated from `anvil doctor` — checks now run against any
 * user-authored agent pack, not just the Anvil source tree.
 */
export async function agentLintCommand(
  opts: AgentLintOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const anvilHome = opts.anvilHome ?? join(getUserHome(), '.anvil')

  const roots = resolveLintRoots({
    kind: 'agent',
    cwd,
    anvilHome,
    target: opts.target,
  })

  if (roots.length === 0) {
    if (maybeEmitJson({ kind: 'agent', roots: [], results: [] }, opts)) return
    process.stdout.write(chalk.yellow('No agents found to lint.\n'))
    return
  }

  const rootPaths = roots.map((r) => r.root)
  const allResults: LintCheckResult[] = []

  for (const { root } of roots) {
    const results = await runAgentLintChecks(root, cwd)
    allResults.push(...results)
  }

  if (
    maybeEmitJson(
      { kind: 'agent', roots: rootPaths, results: allResults },
      opts,
    )
  )
    return

  process.stdout.write(
    chalk.bold(
      `Linting ${roots.length} target${roots.length === 1 ? '' : 's'}:\n`,
    ),
  )
  for (const r of roots) {
    process.stdout.write(`  ${chalk.cyan(r.root)}\n`)
  }

  for (const result of allResults) {
    const icon =
      result.status === 'pass'
        ? chalk.green('✓')
        : result.status === 'fail'
          ? chalk.red('✗')
          : result.status === 'warn'
            ? chalk.yellow('⚠')
            : chalk.dim('–')
    process.stdout.write(`  ${icon} ${result.name}: ${result.detail}\n`)
  }
}
