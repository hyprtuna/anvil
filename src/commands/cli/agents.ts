import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { loadAllAgents } from '../../agents/load-all.js'
import { prepareInvocation } from '../../agents/runner.js'
import { loadConfig } from '../../core/config/load.js'
import { type CliOptions, maybeEmitJson } from './common/json-mode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_ROOT = join(__dirname, '..', '..', '..', 'agents')

export async function agentsCommand(
  task: string,
  opts: CliOptions = {},
): Promise<void> {
  const registry = await loadAllAgents({ agentsRoot: AGENTS_ROOT })
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  const invocation = prepareInvocation(
    registry,
    config,
    'orchestrator',
    `Task: ${task}`,
  )
  const payload = {
    agent: 'orchestrator',
    resolvedModel: invocation.resolvedModel,
    prompt: invocation.prompt,
  }
  if (maybeEmitJson(payload, opts)) return
  process.stdout.write(chalk.bold('# anvil agents\n\n'))
  process.stdout.write(
    chalk.dim(`Model: ${invocation.resolvedModel.model}\n\n`),
  )
  process.stdout.write(chalk.dim(`${'─'.repeat(72)}\n\n`))
  process.stdout.write(invocation.prompt)
  process.stdout.write('\n')
}
