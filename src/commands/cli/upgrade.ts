import { join } from 'node:path'
import chalk from 'chalk'
import { loadConfig } from '../../core/config/load.js'
import { getUserHome } from '../../core/io/home.js'
import { buildInstallPlan } from '../../installer/plan.js'
import { runUpgrade } from '../../installer/upgrade.js'
import { printInstallSummary } from './common/report.js'

export interface UpgradeOptions {
  dryRun?: boolean
  json?: boolean
}

export async function upgradeCommand(opts: UpgradeOptions = {}): Promise<void> {
  const anvilHome = join(getUserHome(), '.anvil')

  if (opts.dryRun) {
    const cwd = process.cwd()
    const config = await loadConfig({ scope: 'project', cwd })
    const skillsRoot = join(cwd, 'skills')
    const agentsRoot = join(cwd, 'agents')
    const plan = await buildInstallPlan({
      cwd,
      scope: 'project',
      target: 'both',
      config,
      skillsRoot,
      agentsRoot,
    })
    const fileCount = plan.adapters.reduce((sum, a) => sum + a.files.length, 0)
    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            target: plan.target,
            adapters: plan.adapters.map((a) => ({
              name: a.adapterName,
              files: a.files.length,
            })),
            totalFiles: fileCount,
          },
          null,
          2,
        )}\n`,
      )
      return
    }
    process.stdout.write(
      `${chalk.bold('anvil upgrade --dry-run:')} would re-materialize ${fileCount} file(s) across ${plan.adapters.length} adapter(s)\n`,
    )
    for (const a of plan.adapters) {
      process.stdout.write(
        `  ${chalk.cyan(a.adapterName)}: ${a.files.length} file(s)\n`,
      )
    }
    process.stdout.write(
      `\n${chalk.gray('No changes made. Run without --dry-run to execute.')}\n`,
    )
    return
  }

  const summary = await runUpgrade()

  printInstallSummary({
    anvilHome,
    version: '(see `anvil doctor` for installed version)',
    filesWritten: summary.filesWritten,
    targets: summary.adapters.map((a) => ({
      id: a.name,
      status: 'wrote' as const,
      detail: `${a.count} file${a.count === 1 ? '' : 's'}`,
    })),
  })
}
