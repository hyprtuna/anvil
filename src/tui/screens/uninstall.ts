import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  spinner,
} from '@clack/prompts'
import chalk from 'chalk'
import { printRemovalSummary } from '../../commands/cli/common/report.js'
import { runUninstall, runUninstallPlan } from '../../installer/uninstall.js'
import type { UninstallOptions } from '../../installer/uninstall.js'

/**
 * Interactive TUI flow for Anvil uninstall.
 * Called when the user runs `anvil uninstall` without --yes and on a TTY.
 */
export async function runUninstallTui(
  baseOpts?: Partial<UninstallOptions>,
): Promise<void> {
  const opts: UninstallOptions = {
    scope: 'project',
    ...baseOpts,
  }

  intro(chalk.bold.red('Anvil uninstaller'))

  // Step 1: Compute what is installed (pure, no side effects)
  const plan = runUninstallPlan(opts)

  if (plan.willRemove.length === 0) {
    outro(chalk.dim('Nothing to uninstall.'))
    return
  }

  // Step 2: Let the user pick which targets to remove
  const presentTargets = plan.targets.filter((t) => t.present)

  const selected = await multiselect({
    message: 'Which installed components do you want to remove?',
    options: presentTargets.map((t) => ({
      value: t.id,
      label: t.paths[0] ?? t.id,
      hint: 'present',
    })),
    initialValues: presentTargets.map((t) => t.id),
    required: false,
  })

  if (isCancel(selected)) {
    cancel('Uninstall cancelled.')
    return
  }

  const selectedIds = selected as string[]

  if (selectedIds.length === 0) {
    outro(chalk.dim('No components selected. Nothing removed.'))
    return
  }

  // Compute total paths for the preview message
  const selectedTargets = plan.targets.filter((t) => selectedIds.includes(t.id))
  const allPaths = selectedTargets.flatMap((t) => t.paths)
  const totalPaths = allPaths.length
  const totalDirs = new Set(
    allPaths.map((p) => {
      const parts = p.split('/')
      return parts.slice(0, -1).join('/')
    }),
  ).size

  // Step 3: Confirm
  const confirmed = await confirm({
    message: `This will remove ${chalk.bold(String(totalPaths))} path${totalPaths === 1 ? '' : 's'} across ${chalk.bold(String(totalDirs))} director${totalDirs === 1 ? 'y' : 'ies'}. Continue?`,
    initialValue: false,
  })

  if (isCancel(confirmed) || !confirmed) {
    cancel('Uninstall cancelled.')
    return
  }

  // Step 4: Execute
  const s = spinner()
  s.start('Removing Anvil files…')

  // Build a reduced opts that only removes the selected paths.
  // We pass a custom home/cwd and let runUninstall operate normally —
  // but since the plan already filtered to present paths, we can simply
  // call runUninstall with the same opts (it re-checks existence internally).
  const summary = await runUninstall(opts)

  // Filter summary to only the paths the user chose
  const filteredRemoved = summary.removed.filter((p) => allPaths.includes(p))

  s.stop('Done')

  // Step 5: Print summary
  printRemovalSummary({ removed: filteredRemoved })

  outro(chalk.green('Done'))
}
