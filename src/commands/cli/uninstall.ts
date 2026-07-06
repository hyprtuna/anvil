import chalk from 'chalk'
import type { Scope } from '../../core/types.js'
import { runUninstall, runUninstallPlan } from '../../installer/uninstall.js'

export interface UninstallOptions {
  scope: string
  yes?: boolean
  dryRun?: boolean
  json?: boolean
  /**
   * v0.10.9 S-012: when true, archive `~/.anvil/` (excluding `cache/`) to
   * `~/.anvil-backups/<ts>.tgz` before destructive removal. Retains the last
   * 5 archives.
   */
  archive?: boolean
}

export async function uninstallCommand(opts: UninstallOptions): Promise<void> {
  const scope = (opts.scope ?? 'project') as Scope

  if (opts.dryRun) {
    const plan = runUninstallPlan({ scope })
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
      return
    }
    process.stdout.write(
      `${chalk.bold('anvil uninstall --dry-run:')} would remove ${plan.willRemove.length} path(s)\n`,
    )
    for (const t of plan.targets) {
      const tag = t.present ? chalk.red('✗') : chalk.gray('·')
      const note = t.present ? '' : chalk.gray(' (not present)')
      process.stdout.write(`  ${tag} ${t.id}${note}\n`)
      for (const p of t.paths) {
        process.stdout.write(`    ${chalk.gray(p)}\n`)
      }
    }
    if (opts.archive) {
      // S-012: report archive path without writing.
      const summary = await runUninstall({
        scope,
        archive: true,
        dryRun: true,
      })
      if (summary.archivePath) {
        process.stdout.write(
          `\n${chalk.bold('archive:')} ${summary.archivePath}\n`,
        )
      }
    }
    process.stdout.write(
      `\n${chalk.gray('No changes made. Run without --dry-run to execute.')}\n`,
    )
    return
  }

  // If running interactively without --yes and no explicit scope override,
  // launch the TUI flow.
  if (!opts.yes && process.stdin.isTTY) {
    const { runUninstallTui } = await import('../../tui/screens/uninstall.js')
    await runUninstallTui({ scope })
    return
  }

  // Non-interactive / --yes path
  if (!opts.yes) {
    process.stdout.write(
      chalk.yellow(
        'Pass --yes to confirm uninstall, or --dry-run to preview.\n',
      ),
    )
    process.exit(1)
  }

  const summary = await runUninstall({ scope, archive: opts.archive })
  if (
    summary.archivePath &&
    summary.removed.some((r) => r.startsWith('archived '))
  ) {
    process.stdout.write(chalk.cyan(`archive: ${summary.archivePath}\n`))
  }
  if (summary.removed.length === 0) {
    process.stdout.write(chalk.dim('Nothing to uninstall.\n'))
  } else {
    process.stdout.write(
      chalk.green(
        `✓ anvil uninstalled (${summary.removed.length} path(s) removed)\n`,
      ),
    )
  }
}
