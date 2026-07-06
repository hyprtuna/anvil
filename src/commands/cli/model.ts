import { join } from 'node:path'
import chalk from 'chalk'
import { loadConfig } from '../../core/config/load.js'
import { resolveAlias } from '../../core/models/aliases.js'
import { resolveModel } from '../../core/models/resolve.js'
import {
  loadSessionOverride,
  saveSessionOverride,
} from '../../core/models/session.js'
import { EffortLevel } from '../../core/types.js'

export interface ModelCommandOptions {
  effort?: string
}

/**
 * `anvil model [<model>] [--effort <level>]`
 *
 * With no argument — prints the current session-scoped override (if any)
 * and then the resolved model for the "default" skill context.
 *
 * With a model argument — writes `.anvil/active-model.json` in the cwd,
 * setting that model for the remainder of the session.
 */
export async function modelCommand(
  model: string | undefined,
  opts: ModelCommandOptions,
): Promise<void> {
  const cwd = process.cwd()
  const config = await loadConfig({ scope: 'project', cwd })

  if (!model) {
    // Show-only mode: print current resolution + session override if set.
    const session = await loadSessionOverride(cwd)
    if (session) {
      const effortPart = session.effort ? ` effort=${session.effort}` : ''
      process.stdout.write(
        chalk.cyan(
          `Session override active: model=${session.model}${effortPart} (set at ${session.set_at})\n`,
        ),
      )
    } else {
      process.stdout.write(chalk.dim('No session override active.\n'))
    }

    // Show resolved model for the default context.
    const resolved = resolveModel('default', config, {
      session,
      env: process.env,
    })
    process.stdout.write(
      `Resolved model: ${chalk.bold(resolved.model)}  effort: ${resolved.effort}  source: ${chalk.dim(resolved.source)}\n`,
    )
    return
  }

  // Validate effort if provided.
  let effort: EffortLevel | undefined
  if (opts.effort) {
    const parsed = EffortLevel.safeParse(opts.effort)
    if (!parsed.success) {
      process.stderr.write(
        `Invalid --effort: ${JSON.stringify(opts.effort)}. Expected one of: ${EffortLevel.options.join(', ')}\n`,
      )
      process.exit(1)
    }
    effort = parsed.data
  }

  // Resolve any alias so we store the canonical model id.
  const resolvedModel = resolveAlias(model, config.model_aliases)

  await saveSessionOverride(cwd, { model: resolvedModel, effort })

  const effortSuffix = effort ? ` effort=${effort}` : ''
  process.stdout.write(
    chalk.green(
      `✓ Session override set: model=${resolvedModel}${effortSuffix}\n  Stored at ${join(cwd, '.anvil', 'active-model.json')}\n`,
    ),
  )
}
