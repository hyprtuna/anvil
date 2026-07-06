import chalk from 'chalk'
import { table } from 'table'
import { loadConfig } from '../../core/config/load.js'
import { HookKind } from '../../core/types.js'
import { loadAllHooks } from '../../hooks/load-all.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { CliOptions } from './common/json-mode.js'

export interface HooksListOptions extends CliOptions {
  kind?: string
}

export async function hooksListCommand(opts: HooksListOptions): Promise<void> {
  let kindFilter: HookKind | undefined
  if (opts.kind !== undefined) {
    const parsed = HookKind.safeParse(opts.kind)
    if (!parsed.success) {
      const valid = HookKind.options.join(', ')
      process.stderr.write(
        `${chalk.red(`error: unknown hook kind "${opts.kind}"`)}\n`,
      )
      process.stderr.write(`valid kinds: ${valid}\n`)
      process.exit(1)
    }
    kindFilter = parsed.data
  }

  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  const registry = loadAllHooks({ config, env: process.env })
  const all = registry.getAll()
  const filtered = kindFilter ? all.filter((h) => h.kind === kindFilter) : all

  const rows = filtered.map((h) => ({
    name: h.name,
    kind: h.kind,
    enabled: h.enabled,
    priority: h.priority,
  }))

  if (maybeEmitJson(rows, opts)) return

  if (rows.length === 0) {
    const msg = kindFilter
      ? `No hooks registered for kind ${kindFilter}.`
      : 'No hooks registered.'
    process.stdout.write(`${msg}\n`)
    return
  }

  const sorted = [...rows].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
    if (a.priority !== b.priority) return b.priority - a.priority
    return a.name.localeCompare(b.name)
  })

  const header = [
    chalk.bold('NAME'),
    chalk.bold('KIND'),
    chalk.bold('ENABLED'),
    chalk.bold('PRIORITY'),
  ]
  const tableData = [
    header,
    ...sorted.map((r) => [
      r.name,
      r.kind,
      r.enabled ? chalk.green('yes') : chalk.dim('no'),
      String(r.priority),
    ]),
  ]
  process.stdout.write(table(tableData))
}
