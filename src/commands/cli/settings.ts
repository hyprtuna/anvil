import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import { getUserHome } from '../../core/io/home.js'
import {
  ClaudeCodeSettings,
  type ClaudeCodeSettingsT,
} from '../../core/manifest-schema/settings.js'
import { type CliOptions, maybeEmitJson } from './common/json-mode.js'

/**
 * Plan 28 Phase G2 / G3 — `anvil settings show` and
 * `anvil settings validate`.
 *
 * `show` — merge the project-shared (`<cwd>/.claude/settings.json`) and
 * user (`~/.claude/settings.json`) layers and emit JSON. We deliberately
 * defer the local (`settings.local.json`) and managed (`/etc/...`,
 * registry, plist) layers; the doc lists them but they need separate
 * platform plumbing.
 *
 * `validate` — Zod-validate `<cwd>/.claude/settings.json`. Lint-only.
 *
 * Reference: references/claude-docs/settings/settings.md.
 */

export interface SettingsShowOptions extends CliOptions {
  cwd?: string
  home?: string
}

export interface SettingsValidateOptions extends CliOptions {
  cwd?: string
  /**
   * When set, validate the user-scope file at `<home>/.claude/settings.json`
   * instead of the project file. Used by power users to lint
   * `~/.claude/settings.json` without changing directory.
   */
  user?: boolean
  home?: string
}

interface ShowPayload {
  source: {
    project: string | null
    user: string | null
  }
  merged: Record<string, unknown>
}

async function tryReadJson(path: string): Promise<unknown | null> {
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

/**
 * Project beats user, per CC's documented precedence
 * (managed > local > project > user). We only handle project + user
 * for v0.4 — local + managed need scope-specific path discovery and
 * platform branches.
 */
function mergeSettings(
  project: Record<string, unknown> | null,
  user: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!project) return user ?? {}
  if (!user) return project
  const out: Record<string, unknown> = { ...user }
  for (const k of Object.keys(project)) {
    out[k] = project[k]
  }
  return out
}

export async function settingsShowCommand(
  opts: SettingsShowOptions,
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const home = opts.home ?? getUserHome()
  const projectPath = join(cwd, '.claude', 'settings.json')
  const userPath = join(home, '.claude', 'settings.json')

  const projectRaw = await tryReadJson(projectPath)
  const userRaw = await tryReadJson(userPath)
  const projectObj = asObject(projectRaw)
  const userObj = asObject(userRaw)
  const merged = mergeSettings(projectObj, userObj)

  const payload: ShowPayload = {
    source: {
      project: existsSync(projectPath) ? projectPath : null,
      user: existsSync(userPath) ? userPath : null,
    },
    merged,
  }

  // `--json` (or global `--output json`) emits the structured payload.
  // The default print also emits JSON because settings *is* JSON; we
  // just include a one-line header for human readers.
  if (maybeEmitJson(payload, opts)) return

  process.stdout.write(
    `${chalk.dim('# merged settings (project > user)')}\n` +
      `${chalk.dim(`# project: ${payload.source.project ?? '<none>'}`)}\n` +
      `${chalk.dim(`# user:    ${payload.source.user ?? '<none>'}`)}\n` +
      `${JSON.stringify(merged, null, 2)}\n`,
  )
}

interface ValidateIssue {
  path: string
  message: string
}

interface ValidatePayload {
  path: string
  ok: boolean
  issues: ValidateIssue[]
  parsed: ClaudeCodeSettingsT | null
}

export async function settingsValidateCommand(
  opts: SettingsValidateOptions,
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const home = opts.home ?? getUserHome()
  const settingsPath = opts.user
    ? join(home, '.claude', 'settings.json')
    : join(cwd, '.claude', 'settings.json')

  if (!existsSync(settingsPath)) {
    const payload: ValidatePayload = {
      path: settingsPath,
      ok: false,
      issues: [
        {
          path: '$',
          message: `settings.json not found at ${settingsPath}`,
        },
      ],
      parsed: null,
    }
    if (!maybeEmitJson(payload, opts)) {
      process.stderr.write(
        chalk.red(`✗ settings.json not found at ${settingsPath}\n`),
      )
    }
    process.exit(1)
  }

  let raw: string
  try {
    raw = await readFile(settingsPath, 'utf-8')
  } catch (err) {
    const payload: ValidatePayload = {
      path: settingsPath,
      ok: false,
      issues: [{ path: '$', message: (err as Error).message }],
      parsed: null,
    }
    if (!maybeEmitJson(payload, opts)) {
      process.stderr.write(chalk.red(`✗ ${(err as Error).message}\n`))
    }
    process.exit(1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const payload: ValidatePayload = {
      path: settingsPath,
      ok: false,
      issues: [
        {
          path: '$',
          message: `invalid JSON: ${(err as Error).message}`,
        },
      ],
      parsed: null,
    }
    if (!maybeEmitJson(payload, opts)) {
      process.stderr.write(
        chalk.red(`✗ invalid JSON: ${(err as Error).message}\n`),
      )
    }
    process.exit(1)
  }

  const result = ClaudeCodeSettings.safeParse(parsed)
  if (!result.success) {
    const issues: ValidateIssue[] = result.error.issues.map((i) => ({
      path: i.path.length > 0 ? i.path.join('.') : '$',
      message: i.message,
    }))
    const payload: ValidatePayload = {
      path: settingsPath,
      ok: false,
      issues,
      parsed: null,
    }
    if (!maybeEmitJson(payload, opts)) {
      process.stderr.write(
        chalk.red(
          `✗ settings.json failed validation (${issues.length} issue${issues.length === 1 ? '' : 's'})\n`,
        ),
      )
      for (const issue of issues) {
        process.stderr.write(chalk.red(`  ${issue.path}: ${issue.message}\n`))
      }
    }
    process.exit(1)
  }

  const payload: ValidatePayload = {
    path: settingsPath,
    ok: true,
    issues: [],
    parsed: result.data,
  }
  if (!maybeEmitJson(payload, opts)) {
    process.stdout.write(
      chalk.green(`✓ settings.json is valid (${settingsPath})\n`),
    )
  }
}
