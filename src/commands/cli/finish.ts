import chalk from 'chalk'
import { execAsync } from './common/invoke.js'

export type FinishMode = 'merge' | 'pr' | 'keep' | 'discard'

const VALID_MODES: ReadonlySet<string> = new Set([
  'merge',
  'pr',
  'keep',
  'discard',
])

export function resolveFinishMode(raw: string | undefined): FinishMode | null {
  if (raw === undefined || !VALID_MODES.has(raw)) return null
  return raw as FinishMode
}

type ExecFn = (cmd: string) => Promise<{ stdout: string; stderr: string }>

export async function determineBaseBranch(
  exec?: ExecFn,
): Promise<string | null> {
  const run = exec ?? execAsync
  for (const branch of ['main', 'master']) {
    try {
      await run(`git merge-base HEAD ${branch}`)
      return branch
    } catch {
      // try next
    }
  }
  return null
}

export interface FinishOptions {
  mode?: string
  yes?: boolean
  dryRun?: boolean
}

export async function finishCommand(opts: FinishOptions): Promise<void> {
  // Step 1: run tests
  process.stdout.write(chalk.dim('Running tests...\n'))
  try {
    await execAsync('npm test')
  } catch {
    process.stderr.write(
      chalk.red('Tests failed. Fix them before finishing.\n'),
    )
    process.exit(1)
  }

  // Step 2: get current branch
  let currentBranch: string
  try {
    const { stdout } = await execAsync('git branch --show-current')
    currentBranch = stdout.trim()
  } catch {
    process.stderr.write(chalk.red('Not in a git repository.\n'))
    process.exit(1)
    return
  }

  if (!currentBranch) {
    process.stderr.write(
      chalk.red('Could not determine current branch (detached HEAD?).\n'),
    )
    process.exit(1)
    return
  }

  // Step 3: determine base branch
  const baseBranch = await determineBaseBranch()

  // Step 4: resolve mode
  let mode = resolveFinishMode(opts.mode)
  if (mode === null) {
    if (opts.yes) {
      mode = 'pr'
    } else {
      const { select, isCancel } = await import('@clack/prompts')
      const chosen = await select({
        message: `Finish branch "${currentBranch}" — what would you like to do?`,
        options: [
          {
            value: 'pr',
            label: 'Open a pull request',
            hint: 'push + gh pr create --fill',
          },
          {
            value: 'merge',
            label: `Merge into ${baseBranch ?? 'base branch'}`,
            hint: 'checkout base, pull, merge, delete branch',
          },
          {
            value: 'keep',
            label: 'Keep branch as-is',
            hint: 'no changes made',
          },
          {
            value: 'discard',
            label: 'Discard branch',
            hint: `checkout base, delete "${currentBranch}"`,
          },
        ],
      })
      if (isCancel(chosen)) {
        process.stdout.write(chalk.yellow('Cancelled.\n'))
        process.exit(0)
        return
      }
      mode = chosen as FinishMode
    }
  }

  // Step 5: dry-run
  if (opts.dryRun) {
    process.stdout.write(chalk.cyan(`[dry-run] Would execute mode: ${mode}\n`))
    process.stdout.write(chalk.cyan(`  current branch : ${currentBranch}\n`))
    process.stdout.write(
      chalk.cyan(`  base branch    : ${baseBranch ?? '(unknown)'}\n`),
    )
    return
  }

  // Step 6: execute
  switch (mode) {
    case 'merge': {
      if (!baseBranch) {
        process.stderr.write(
          chalk.red('Cannot determine base branch for merge.\n'),
        )
        process.exit(1)
        return
      }
      await execAsync(`git checkout ${baseBranch}`)
      await execAsync('git pull')
      await execAsync(`git merge ${currentBranch}`)
      await execAsync(`git branch -d ${currentBranch}`)
      process.stdout.write(
        chalk.green(
          `Merged "${currentBranch}" into "${baseBranch}" and deleted feature branch.\n`,
        ),
      )
      break
    }

    case 'pr': {
      await execAsync(`git push -u origin ${currentBranch}`)
      await execAsync('gh pr create --fill')
      process.stdout.write(chalk.green('Pull request created.\n'))
      break
    }

    case 'keep': {
      process.stdout.write(
        chalk.dim(`Branch "${currentBranch}" kept. No changes made.\n`),
      )
      break
    }

    case 'discard': {
      if (!opts.yes) {
        const { confirm, isCancel } = await import('@clack/prompts')
        const ok = await confirm({
          message: `Delete branch "${currentBranch}"? This cannot be undone.`,
        })
        if (isCancel(ok) || !ok) {
          process.stdout.write(chalk.yellow('Discard cancelled.\n'))
          process.exit(0)
          return
        }
      }
      if (baseBranch) await execAsync(`git checkout ${baseBranch}`)
      await execAsync(`git branch -D ${currentBranch}`)
      process.stdout.write(
        chalk.green(`Branch "${currentBranch}" discarded.\n`),
      )
      break
    }
  }
}
