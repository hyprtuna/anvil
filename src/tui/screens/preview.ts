import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { confirm, note } from '@clack/prompts'
import chalk from 'chalk'
import { buildPreset } from '../../core/config/presets.js'
import type { PresetName, Scope, Target } from '../../core/types.js'
import { buildInstallPlan } from '../../installer/plan.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

export async function runPreviewScreen(opts: {
  target: Target
  scope: Scope
  preset: PresetName
}): Promise<boolean | symbol> {
  const plan = await buildInstallPlan({
    cwd: process.cwd(),
    scope: opts.scope,
    target: opts.target,
    config: buildPreset(opts.preset),
    skillsRoot: join(REPO_ROOT, 'skills'),
    agentsRoot: join(REPO_ROOT, 'agents'),
  })
  const header = plan.adapters.map(
    (a) =>
      `${chalk.bold(a.adapterName)} → ${a.installRoot} (${a.files.length} files)`,
  )
  const fileList = renderPreview({
    adapters: plan.adapters.map((a) => ({
      name: a.adapterName,
      files: a.files.map((f) => ({ path: f.relativePath })),
    })),
  })
  note(`${header.join('\n')}\n\n${fileList}`, 'Install plan')
  return confirm({ message: 'Proceed?', initialValue: true })
}

export interface PreviewAdapter {
  name: string
  files: Array<{ path: string }>
}

export interface PreviewInput {
  adapters: PreviewAdapter[]
}

export function renderPreview(input: PreviewInput): string {
  const lines: string[] = []
  lines.push(chalk.bold('  The following will be written:'))
  lines.push('')
  let total = 0
  for (const a of input.adapters) {
    lines.push(chalk.cyan(`  ${a.name}`))
    for (const f of a.files) {
      lines.push(`    ${chalk.dim('+')} ${f.path}`)
    }
    lines.push('')
    total += a.files.length
  }
  lines.push(chalk.dim(`  ${total} file${total === 1 ? '' : 's'} total`))
  return lines.join('\n')
}
