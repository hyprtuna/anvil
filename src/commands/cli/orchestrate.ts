import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { z } from 'zod'
import { loadAllAgents } from '../../agents/load-all.js'
import { prepareInvocation } from '../../agents/runner.js'
import { loadConfig } from '../../core/config/load.js'
import { type CliOptions, maybeEmitJson } from './common/json-mode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_ROOT = join(__dirname, '..', '..', '..', 'agents')

/**
 * Zod schema for the --parallel option.
 *
 * Values outside [1..5] are clamped:
 *   - values < 1 → clamped to 1
 *   - values > 5 → clamped to 5
 *
 * Non-integer strings that cannot be coerced to a number will throw a
 * ZodError (the CLI layer catches this and exits with a usage message).
 */
const parallelSchema = z.coerce
  .number()
  .int()
  .transform((n) => Math.min(5, Math.max(1, n)))

export interface OrchestrateOptions extends CliOptions {
  parallel?: string | number
}

/**
 * Clamp the raw --parallel value to [1..5].
 * Returns { n, clamped: true } when the original value was out of range.
 */
function resolveParallelN(raw: string | number | undefined): {
  n: number
  clamped: boolean
  originalN: number
} {
  const rawN = raw !== undefined ? z.coerce.number().int().parse(raw) : 1
  const n = parallelSchema.parse(rawN)
  return { n, clamped: rawN !== n, originalN: rawN }
}

export async function orchestrateCommand(
  goal: string,
  opts: OrchestrateOptions = {},
): Promise<void> {
  const { n, clamped, originalN } = resolveParallelN(opts.parallel)

  // Only warn when the user requested MORE than the ceiling (not when floored).
  if (clamped && originalN > 5) {
    process.stderr.write(
      chalk.yellow(
        `⚠ --parallel=${originalN} exceeds the dispatch limit of 5. Clamping to ${n}.\n`,
      ),
    )
  }

  const registry = await loadAllAgents({ agentsRoot: AGENTS_ROOT })
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })

  // Inject the @parallel directive directly into the orchestrator's input prompt
  // so the agent prompt-level logic can detect and execute fan-out mode.
  const directivePrompt = n > 1 ? `@parallel=${n} ${goal}` : `Task: ${goal}`

  const invocation = prepareInvocation(
    registry,
    config,
    'orchestrator',
    directivePrompt,
  )

  const payload = {
    agent: 'orchestrator',
    goal,
    parallel: n,
    resolvedModel: invocation.resolvedModel,
    prompt: invocation.prompt,
  }

  if (maybeEmitJson(payload, opts)) return

  process.stdout.write(chalk.bold('# anvil orchestrate\n\n'))
  process.stdout.write(chalk.dim(`Goal:     ${goal}\n`))
  process.stdout.write(
    chalk.dim(`Parallel: ${n} background agent${n === 1 ? '' : 's'}\n`),
  )
  process.stdout.write(
    chalk.dim(`Model:    ${invocation.resolvedModel.model}\n\n`),
  )
  process.stdout.write(chalk.dim(`${'─'.repeat(72)}\n\n`))
  process.stdout.write(invocation.prompt)
  process.stdout.write('\n')
}
