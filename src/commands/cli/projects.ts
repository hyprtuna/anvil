/**
 * ANV-0199 — `anvil projects list|show` CLI commands.
 *
 * Reads preferences from `ANVIL_HOME` env (defaults to `~/.anvil/`).
 * Exposes per-project preference data for inspection.
 */

import { join } from 'node:path'
import chalk from 'chalk'
import { table } from 'table'
import { getUserHome } from '../../core/io/home.js'
import { deriveProjectName, loadPreferences } from '../../core/preferences.js'
import type { CliOptions } from './common/json-mode.js'
import { maybeEmitJson } from './common/json-mode.js'

function getAnvilHome(): string {
  return process.env.ANVIL_HOME ?? join(getUserHome(), '.anvil')
}

// ---------------------------------------------------------------------------
// projects list
// ---------------------------------------------------------------------------

export async function projectsListCommand(opts: CliOptions): Promise<void> {
  const anvilHome = getAnvilHome()
  const prefs = await loadPreferences(anvilHome)
  const projects = prefs.projects

  if (maybeEmitJson(prefs, opts)) return

  const entries = Object.entries(projects)
  if (entries.length === 0) {
    process.stdout.write('No projects tracked yet.\n')
    return
  }

  process.stdout.write(`${entries.length} project(s) tracked\n\n`)

  const header = [
    'NAME',
    'CWD',
    'FIRST_SEEN',
    'DEFAULT_LOCATION',
    'DEFAULT_FORMAT',
  ]
  const rows = entries.map(([name, proj]) => [
    chalk.bold(name),
    chalk.dim(proj.cwd),
    proj.first_seen.slice(0, 10), // date portion
    proj.default_location ?? chalk.dim('(none)'),
    proj.default_format ?? chalk.dim('(none)'),
  ])

  process.stdout.write(table([header, ...rows]))
}

// ---------------------------------------------------------------------------
// projects show
// ---------------------------------------------------------------------------

export async function projectsShowCommand(
  cwd: string | undefined,
  opts: CliOptions,
): Promise<void> {
  const anvilHome = getAnvilHome()
  const targetCwd = cwd ?? process.cwd()
  const prefs = await loadPreferences(anvilHome)
  const projectName = await deriveProjectName(targetCwd, anvilHome)
  const project = prefs.projects[projectName] ?? null

  if (maybeEmitJson({ projectName, preferences: project }, opts)) return

  if (!project) {
    process.stdout.write(
      `No preferences for this project yet.\nProject name: ${chalk.bold(projectName)}\nCwd: ${targetCwd}\n`,
    )
    return
  }

  process.stdout.write(
    `Project: ${chalk.bold(projectName)}\nCwd: ${chalk.dim(project.cwd)}\nFirst seen: ${project.first_seen}\n`,
  )

  if (project.default_location || project.default_format) {
    process.stdout.write(
      `\nDefaults:\n  location: ${project.default_location ?? '(none)'}\n  format: ${project.default_format ?? '(none)'}\n`,
    )
  }

  const perKind = project.per_kind
  if (perKind && Object.keys(perKind).length > 0) {
    process.stdout.write('\nPer-kind preferences:\n')
    const rows = [
      ['KIND', 'LOCATION', 'FORMAT'],
      ...Object.entries(perKind).map(([kind, entry]) => [
        kind,
        entry.location,
        entry.format,
      ]),
    ]
    process.stdout.write(table(rows))
  }
}
