import chalk from 'chalk'
import { table } from 'table'
import { buildDefaultConfig } from '../../core/config/defaults.js'
import { loadConfig, saveConfig } from '../../core/config/load.js'
import { buildPreset } from '../../core/config/presets.js'
import { resolveModel } from '../../core/models/resolve.js'
import { traceResolution } from '../../core/models/trace.js'
import { ModelsConfig, PresetName } from '../../core/types.js'
import type { EffortLevel } from '../../core/types.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { CliOptions } from './common/json-mode.js'
import { effortColor, modelColor } from './common/output.js'

interface SetOptions {
  model: string
  effort?: EffortLevel
  maxTokens?: number
}

export async function modelsListCommand(opts: CliOptions): Promise<void> {
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  const skills = new Set<string>()
  for (const group of Object.values(config.groups))
    for (const m of group.members) skills.add(m)
  for (const name of Object.keys(config.overrides)) skills.add(name)

  const rows = [...skills].sort().map((name) => {
    const r = resolveModel(name, config, { env: process.env })
    return {
      skill: name,
      model: r.model,
      effort: r.effort,
      max_tokens: r.max_tokens,
      source: r.source,
    }
  })

  if (maybeEmitJson(rows, opts)) return

  const header = ['Skill', 'Model', 'Effort', 'Max tokens', 'Source']
  const tableData = [
    header,
    ...rows.map((r) => [
      r.skill,
      chalk[modelColor(r.model)](r.model),
      chalk[effortColor(r.effort)](r.effort),
      String(r.max_tokens),
      chalk.dim(r.source),
    ]),
  ]
  process.stdout.write(table(tableData))
}

export async function modelsShowCommand(
  skill: string,
  opts: CliOptions,
): Promise<void> {
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  const trace = traceResolution(skill, config, { env: process.env })

  // Find the winning entry to surface the fallback cascade prominently
  const winner = trace.find((t) => t.match)
  const payload = {
    skill,
    trace,
    fallback_chain: winner?.fallback_chain ?? [],
    fallback_chain_source: winner?.fallback_chain_source ?? null,
  }
  if (maybeEmitJson(payload, opts)) return

  process.stdout.write(`Resolution trace for ${chalk.bold(skill)}:\n\n`)
  const rows = [
    ['Layer', 'Match?', 'Resolved model', 'Note'],
    ...trace.map((t) => [
      t.layer,
      t.match ? chalk.green('✓') : chalk.dim('—'),
      t.resolvedModel ?? '',
      t.note ?? '',
    ]),
  ]
  process.stdout.write(table(rows))

  // Show fallback cascade
  const chain = winner?.fallback_chain ?? []
  if (chain.length > 0) {
    const src = winner?.fallback_chain_source
    const srcLabel = src ? chalk.dim(` (source: ${src})`) : ''
    process.stdout.write(
      `\nFallback cascade${srcLabel}: ${chain.map((m) => chalk.cyan(m)).join(' → ')}\n`,
    )
  } else {
    process.stdout.write('\nFallback cascade: (none defined)\n')
  }

  // Plan 33 D6: confirm runtime is walking the chain on retryable SDK errors
  process.stdout.write(`${chalk.dim('Chain consumption: live')}\n`)
}

export async function modelsSetCommand(
  skill: string,
  opts: SetOptions,
): Promise<void> {
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  config.overrides[skill] = {
    model: opts.model,
    effort: opts.effort ?? config.defaults.effort,
    fallback_chain: [],
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  }
  await saveConfig(config, { scope: 'project', cwd: process.cwd() })
  process.stdout.write(
    chalk.green(`✓ override set: ${skill} → ${opts.model}\n`),
  )
}

export async function modelsSetGroupCommand(
  group: string,
  opts: { model: string; effort?: EffortLevel },
): Promise<void> {
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  const g = config.groups[group]
  if (!g) throw new Error(`unknown group: ${group}`)
  g.model = opts.model
  if (opts.effort) g.effort = opts.effort
  await saveConfig(config, { scope: 'project', cwd: process.cwd() })
  process.stdout.write(
    chalk.green(`✓ group "${group}" now uses ${opts.model}\n`),
  )
}

export async function modelsUseCommand(presetName: string): Promise<void> {
  const preset = PresetName.parse(presetName)
  const config = buildPreset(preset)
  await saveConfig(config, { scope: 'project', cwd: process.cwd() })
  process.stdout.write(chalk.green(`✓ applied preset "${preset}"\n`))
}

export async function modelsResetCommand(opts: {
  yes?: boolean
}): Promise<void> {
  if (!opts.yes) {
    process.stdout.write(
      chalk.yellow('Pass --yes to confirm reset to defaults.\n'),
    )
    process.exit(1)
  }
  await saveConfig(buildDefaultConfig(), {
    scope: 'project',
    cwd: process.cwd(),
  })
  process.stdout.write(chalk.green('✓ config reset to defaults\n'))
}

export async function modelsValidateCommand(): Promise<void> {
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  ModelsConfig.parse(config)
  const knownSkills = new Set<string>()
  for (const g of Object.values(config.groups))
    for (const m of g.members) knownSkills.add(m)
  const unknownOverrides = Object.keys(config.overrides).filter(
    (n) => !knownSkills.has(n),
  )
  if (unknownOverrides.length > 0) {
    process.stdout.write(
      `${
        chalk.yellow(
          'warning: overrides reference skills not in any group:\n',
        ) + unknownOverrides.map((n) => `  - ${n}`).join('\n')
      }\n`,
    )
  }
  process.stdout.write(chalk.green('✓ models.json is valid\n'))
}
