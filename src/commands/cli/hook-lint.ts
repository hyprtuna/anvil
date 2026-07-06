import { join } from 'node:path'
import chalk from 'chalk'
import { getUserHome } from '../../core/io/home.js'
import { resolveLintRoots } from '../../core/lint-roots.js'
import type { CliOptions } from './common/json-mode.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { LintCheckResult } from './common/lint-check.js'
import { runHookLintChecks } from './hook-lint-checks.js'

export interface HookLintOptions extends CliOptions {
  target?: string
  strict?: boolean
  /** Internal: override cwd (for testing). Defaults to process.cwd(). */
  cwd?: string
  /** Internal: override anvilHome (for testing). Defaults to ~/.anvil. */
  anvilHome?: string
}

/**
 * `anvil hook lint [--target <path>] [--json] [--strict]`
 *
 * Resolves hook roots (project `.claude/hooks`, user `~/.anvil/hooks`, or
 * an explicit `--target`) and runs the 3 hook-author checks against them.
 *
 * ANV-0184: migrated from `anvil doctor` — checks now run against any
 * user-authored hook handler collection, not just the Anvil source tree.
 */
export async function hookLintCommand(
  opts: HookLintOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const anvilHome = opts.anvilHome ?? join(getUserHome(), '.anvil')

  const roots = resolveLintRoots({
    kind: 'hook',
    cwd,
    anvilHome,
    target: opts.target,
  })

  if (roots.length === 0) {
    if (maybeEmitJson({ kind: 'hook', roots: [], results: [] }, opts)) return
    process.stdout.write(chalk.yellow('No hooks found to lint.\n'))
    return
  }

  const rootPaths = roots.map((r) => r.root)
  const allResults: LintCheckResult[] = []

  for (const { root } of roots) {
    const results = await runHookLintChecks(root, cwd)
    allResults.push(...results)
  }

  if (
    maybeEmitJson({ kind: 'hook', roots: rootPaths, results: allResults }, opts)
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
