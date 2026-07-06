import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import type { CliOptions } from './common/json-mode.js'
import { maybeEmitJson } from './common/json-mode.js'
import { printKv } from './common/report.js'

interface CostData {
  tokensUsed: number
  estimatedCostUsd: number
  durationMs: number
  sessionStart: string
}

interface ProgressSummary {
  branch: string
  uncommittedFiles: number
  recentCommits: string[]
  cost: CostData | null
}

function tryExec(cmd: string): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return ''
  }
}

export function buildProgressSummary(): ProgressSummary {
  const branch = tryExec('git branch --show-current') || '(detached)'
  const uncommitted = tryExec('git status --porcelain')
  const uncommittedFiles = uncommitted
    ? uncommitted.split('\n').filter(Boolean).length
    : 0
  const log = tryExec('git log --oneline -5')
  const recentCommits = log ? log.split('\n').filter(Boolean) : []

  let cost: CostData | null = null
  const sessionPath = join(process.cwd(), '.anvil', 'session.json')
  if (existsSync(sessionPath)) {
    try {
      const raw = readFileSync(sessionPath, 'utf-8')
      cost = JSON.parse(raw) as CostData
    } catch {
      // malformed session file — ignore
    }
  }

  return { branch, uncommittedFiles, recentCommits, cost }
}

export async function progressCommand(opts: CliOptions = {}): Promise<void> {
  const summary = buildProgressSummary()

  if (maybeEmitJson(summary, opts)) return

  process.stdout.write(chalk.bold(`Branch: ${summary.branch}\n`))
  process.stdout.write(`Uncommitted files: ${summary.uncommittedFiles}\n\n`)

  if (summary.recentCommits.length > 0) {
    process.stdout.write(chalk.bold('Recent commits:\n'))
    for (const c of summary.recentCommits) {
      process.stdout.write(`  ${c}\n`)
    }
    process.stdout.write('\n')
  }

  if (summary.cost) {
    console.log(chalk.bold('Session cost:'))
    printKv('Tokens', summary.cost.tokensUsed.toLocaleString())
    printKv('Estimated', `$${summary.cost.estimatedCostUsd.toFixed(4)}`)
    const mins = Math.round(summary.cost.durationMs / 60_000)
    printKv('Duration', `${mins} min`)
  }
}
