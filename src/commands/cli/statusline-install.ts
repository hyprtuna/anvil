/**
 * Plan 33 Phase E1/E2 — `anvil statusline install`
 *
 * Writes the `statusLine` block into the Claude Code settings.json
 * at the chosen scope (project or global). Scope-agnostic refactor of
 * the old `applyStatusline` function in `src/installer/wire-claude-code.ts`.
 *
 * CLI surface:
 *   anvil statusline install [--scope global|project] [--mode anvil|shell-script] [--force]
 *
 * Modes:
 *   anvil       (default) — merges { statusLine: { type:'command', command:'<anvilBin> statusline' } }
 *   shell-script          — copies templates/statusline.sh into the scope dir and merges
 *                           { statusLine: { type:'command', command:'bash <path>/statusline-command.sh' } }
 *
 * Scopes:
 *   project  (default) — writes to <cwd>/.claude/settings.json
 *   global              — writes to ~/.claude/settings.json
 *
 * Idempotent: same args → no diff. Different args → last write wins (with stderr warning).
 * Without --force: refuses to clobber a custom (non-anvil) statusLine command.
 */
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { getUserHome } from '../../core/io/home.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { CliOptions } from './common/json-mode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface StatuslineInstallOptions extends CliOptions {
  scope?: 'project' | 'global'
  mode?: 'anvil' | 'shell-script'
  force?: boolean
  /** cwd for resolving project scope (defaults to process.cwd()) */
  cwd?: string
  /** anvil home dir (defaults to ~/.anvil) */
  anvilHome?: string
}

/**
 * Resolve the target settings.json path given a scope.
 */
function resolveSettingsPath(scope: 'project' | 'global', cwd: string): string {
  if (scope === 'global') {
    return join(getUserHome(), '.claude', 'settings.json')
  }
  return join(cwd, '.claude', 'settings.json')
}

/**
 * Resolve the target directory for shell-script mode.
 */
function resolveClaudeDir(scope: 'project' | 'global', cwd: string): string {
  if (scope === 'global') {
    return join(getUserHome(), '.claude')
  }
  return join(cwd, '.claude')
}

/**
 * Find the templates/statusline.sh file relative to this compiled file.
 * Tries multiple candidate paths to handle both dev (src/) and prod (dist/) layouts.
 */
function resolveTemplatePath(): string | undefined {
  const candidates = [
    // dist/commands/cli/ → up 3 levels to repo root
    join(__dirname, '..', '..', '..', 'templates', 'statusline.sh'),
    // src/commands/cli/ → up 3 levels to repo root (tsx / ts-node)
    join(__dirname, '..', '..', '..', 'templates', 'statusline.sh'),
    // dist/ → up 2
    join(__dirname, '..', '..', 'templates', 'statusline.sh'),
  ]
  return candidates.find((p) => existsSync(p))
}

/**
 * Read the settings.json at path, returning an empty object if missing/corrupt.
 */
async function readSettingsJson(
  path: string,
): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {}
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Corrupt file — start fresh.
  }
  return {}
}

/**
 * Classify an existing statusLine command as anvil/anvil-shell/custom/none.
 */
function classifyCommand(
  settings: Record<string, unknown>,
): 'anvil' | 'anvil-shell' | 'custom' | 'none' {
  return classifyKey(settings, 'statusLine')
}

/**
 * Generalized classifier — used for both `statusLine` and `subagentStatusLine`.
 */
function classifyKey(
  settings: Record<string, unknown>,
  key: 'statusLine' | 'subagentStatusLine',
): 'anvil' | 'anvil-shell' | 'custom' | 'none' {
  const sl = settings[key]
  if (sl === undefined || sl === null) return 'none'
  if (typeof sl !== 'object' || Array.isArray(sl)) return 'none'
  const cmd = (sl as Record<string, unknown>).command
  if (typeof cmd !== 'string' || cmd.length === 0) return 'none'
  if (cmd.includes('anvil') && cmd.includes('statusline')) return 'anvil'
  if (
    cmd.includes('statusline-command.sh') ||
    (cmd.endsWith('.sh') && cmd.includes('.claude/statusline'))
  )
    return 'anvil-shell'
  return 'custom'
}

/**
 * v0.10.9 S-001 — symmetric uninstall helper for `writeStatusLineToSettings`.
 *
 * Removes the `statusLine` and `subagentStatusLine` blocks from the settings.json
 * at the chosen scope, but only when they were written by Anvil (classification
 * `anvil` or `anvil-shell`). Custom commands are left untouched.
 *
 * Returns descriptive action strings for inclusion in uninstall summaries.
 */
export async function unmergeStatusLine(opts: {
  scope: 'global' | 'project'
  cwd: string
}): Promise<{ actions: string[] }> {
  const { scope, cwd } = opts
  const actions: string[] = []
  const settingsPath = resolveSettingsPath(scope, cwd)

  if (!existsSync(settingsPath)) {
    actions.push(`skipped (no settings.json at ${settingsPath})`)
    return { actions }
  }

  // readSettingsJson returns {} for missing/corrupt files. Differentiate
  // "missing" (handled above) from "corrupt" by re-reading directly.
  let raw: string
  try {
    raw = await readFile(settingsPath, 'utf-8')
  } catch {
    actions.push(`skipped (could not read ${settingsPath})`)
    return { actions }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    actions.push(`skipped (malformed JSON at ${settingsPath})`)
    return { actions }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    actions.push(`skipped (not a JSON object at ${settingsPath})`)
    return { actions }
  }
  const settings = parsed as Record<string, unknown>

  let mutated = false
  for (const key of ['statusLine', 'subagentStatusLine'] as const) {
    const cls = classifyKey(settings, key)
    if (cls === 'anvil' || cls === 'anvil-shell') {
      delete settings[key]
      actions.push(`removed ${key} (${cls}) from ${settingsPath}`)
      mutated = true
    } else if (cls === 'custom') {
      actions.push(`kept ${key} (custom) at ${settingsPath}`)
    }
    // 'none' — no action recorded
  }

  if (mutated) {
    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(
      settingsPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      'utf-8',
    )
  }

  return { actions }
}

/**
 * Plan 33 E1/E2 — Scope-agnostic statusline wiring helper.
 *
 * Exported for programmatic use (e.g. from the CLI `install` subcommand).
 * The installer's `init` flow continues to call `applyStatusline` from
 * `wire-claude-code.ts` directly (project scope only).
 */
export async function writeStatusLineToSettings(opts: {
  scope: 'global' | 'project'
  mode: 'anvil' | 'shell-script'
  cwd: string
  anvilHome: string
  force?: boolean
}): Promise<{ actions: string[] }> {
  const { scope, mode, cwd, anvilHome, force = false } = opts
  const actions: string[] = []

  const settingsPath = resolveSettingsPath(scope, cwd)
  const claudeDir = resolveClaudeDir(scope, cwd)
  const settings = await readSettingsJson(settingsPath)

  // Detect existing command classification
  const existing = classifyCommand(settings)

  // Without --force, refuse to clobber a custom (non-anvil) command
  if (existing === 'custom' && !force) {
    const sl = settings.statusLine as Record<string, unknown>
    process.stderr.write(
      chalk.yellow(
        `⚠ Existing custom statusLine command detected: ${sl.command}\n  Re-run with --force to overwrite.\n`,
      ),
    )
    actions.push('skipped (custom command present; use --force to overwrite)')
    return { actions }
  }

  let desiredCommand: string
  let scriptDest: string | undefined

  if (mode === 'shell-script') {
    const templatePath = resolveTemplatePath()
    if (!templatePath) {
      process.stderr.write(
        chalk.red(
          'templates/statusline.sh not found. Cannot install in shell-script mode.\n',
        ),
      )
      process.exit(1)
    }
    scriptDest = join(claudeDir, 'statusline-command.sh')
    await mkdir(claudeDir, { recursive: true })

    // Only copy if content differs (idempotency)
    const templateContent = readFileSync(templatePath, 'utf-8')
    let alreadyCopied = false
    if (existsSync(scriptDest)) {
      try {
        const existing2 = readFileSync(scriptDest, 'utf-8')
        if (existing2 === templateContent) alreadyCopied = true
      } catch {
        // ignore
      }
    }
    if (!alreadyCopied) {
      await copyFile(templatePath, scriptDest)
      chmodSync(scriptDest, 0o755)
      actions.push(`copied statusline.sh template to ${scriptDest}`)
    } else {
      actions.push(`statusline-command.sh already current at ${scriptDest}`)
    }

    desiredCommand = `bash ${scriptDest}`
  } else {
    // anvil mode: use the anvilBin path
    const anvilBin = join(anvilHome, 'bin', 'anvil.cjs')
    desiredCommand = `${anvilBin} statusline`
  }

  // Build the desired statusLine block
  const desired = {
    type: 'command' as const,
    command: desiredCommand,
    padding: 0,
    refreshInterval: 5,
  }

  // Check idempotency
  const currentSl = settings.statusLine as typeof desired | undefined
  const matches =
    currentSl &&
    currentSl.type === desired.type &&
    currentSl.command === desired.command &&
    currentSl.padding === desired.padding &&
    currentSl.refreshInterval === desired.refreshInterval

  if (!matches) {
    if (existing === 'anvil' || existing === 'anvil-shell') {
      // Same kind but different args — warn before overwriting
      const prevCmd = (settings.statusLine as Record<string, unknown>).command
      if (prevCmd !== desiredCommand) {
        process.stderr.write(
          chalk.yellow(
            `⚠ Overwriting previous statusLine command: ${prevCmd as string}\n`,
          ),
        )
      }
    }
    settings.statusLine = desired
    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(
      settingsPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      'utf-8',
    )
    actions.push(`merged statusLine into ${settingsPath}`)
  } else {
    actions.push(`statusLine already current in ${settingsPath}`)
  }

  return { actions }
}

/**
 * `anvil statusline install` CLI entry point.
 *
 * Plan 33 Phase E1.
 */
export async function statuslineInstallCommand(
  opts: StatuslineInstallOptions = {},
): Promise<void> {
  const scope = opts.scope ?? 'global'
  const mode = opts.mode ?? 'anvil'
  const force = opts.force ?? false
  const cwd = opts.cwd ?? process.cwd()
  const anvilHome = opts.anvilHome ?? join(getUserHome(), '.anvil')

  const { actions } = await writeStatusLineToSettings({
    scope,
    mode,
    cwd,
    anvilHome,
    force,
  })

  const payload = { scope, mode, actions }
  if (maybeEmitJson(payload, opts)) return

  for (const action of actions) {
    process.stdout.write(`${chalk.green('✓')} ${action}\n`)
  }
}
