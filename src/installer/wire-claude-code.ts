import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync } from 'node:fs'
import {
  mkdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { unmergeStatusLine } from '../commands/cli/statusline-install.js'
import { getUserHome } from '../core/io/home.js'
import {
  CC_SETTINGS_SCHEMA_URL,
  type PermissionMode,
  presetToDefaultMode,
} from '../core/manifest-schema/settings.js'
import type { EffortLevel, ManifestReadResult } from '../core/types.js'

/** Like existsSync but returns true for dangling symlinks (lstat doesn't follow the link). */
function symlinkExists(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

export interface WireOptions {
  anvilHome: string
  projectRoot?: string
  /**
   * When true, copy the staged statusline script into `.claude/statusline.sh`
   * and merge the `statusLine` block into `.claude/settings.json`.
   * Only meaningful for `wireClaudeCodeProject`.
   */
  statusline?: boolean
  /**
   * Plan 28 Phase G1. Anvil preset (`balanced` | `cost-optimised` |
   * `max-quality` | `speed-first`) used to derive
   * `permissions.defaultMode` when emitting a fresh
   * `.claude/settings.json`. When omitted, `defaultMode` falls back
   * to `default` (the Claude Code default).
   */
  preset?: string
  /**
   * Plan 28 Phase G1. Effort level pulled from `models.json →
   * defaults.effort`. Seeds `effortLevel` in `.claude/settings.json`
   * so CC respects the user's configured thinking budget out of the
   * box.
   */
  effort?: EffortLevel
}

export interface WireResult {
  mode: 'cli' | 'filesystem'
  actions: string[]
}

// Exported for testing — tests may vi.mock this module
export function claudeAvailable(): boolean {
  const res = spawnSync('claude', ['--version'], { stdio: 'ignore' })
  return res.status === 0
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluginsRoot(): string {
  return join(getUserHome(), '.claude', 'plugins')
}

function marketplaceDir(): string {
  return join(pluginsRoot(), 'marketplaces', 'anvil', '.claude-plugin')
}

function cacheRoot(): string {
  return join(pluginsRoot(), 'cache', 'anvil', 'anvil')
}

function installedPluginsPath(): string {
  return join(pluginsRoot(), 'installed_plugins.json')
}

async function readVersion(anvilHome: string): Promise<string> {
  const raw = await readFile(join(anvilHome, 'version'), 'utf8')
  // Format: "<semver>+<sha>" — take semver part
  return raw.trim().split('+')[0] ?? raw.trim()
}

async function readInstalledPlugins(): Promise<Record<string, unknown>> {
  const path = installedPluginsPath()
  if (!existsSync(path)) return {}
  const raw = await readFile(path, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return {}
}

async function writeInstalledPlugins(
  data: Record<string, unknown>,
): Promise<void> {
  const path = installedPluginsPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2))
}

/**
 * True when Anvil is already registered as a user-scope Claude Code plugin.
 * When it is, Claude Code auto-fires the plugin's hooks via ${CLAUDE_PLUGIN_ROOT},
 * so project-scope wiring must not also merge those hooks into
 * `.claude/settings.json` — doing both makes every hook fire twice.
 *
 * Handles both formats found in the wild:
 *   v1 (flat, written by anvil's FS fallback):
 *     { "anvil@anvil": { "scope": "user", ... } }
 *   v2 (nested, written by the claude CLI):
 *     { "version": 2, "plugins": { "anvil@anvil": [{ "scope": "user", ... }] } }
 */
async function isAnvilUserScopeInstalled(): Promise<boolean> {
  const installed = await readInstalledPlugins()
  // v2 nested format
  const plugins = installed.plugins
  if (
    typeof plugins === 'object' &&
    plugins !== null &&
    !Array.isArray(plugins) &&
    'anvil@anvil' in plugins &&
    (plugins as Record<string, unknown>)['anvil@anvil'] != null
  ) {
    return true
  }
  // v1 flat format
  const entry = installed['anvil@anvil']
  return entry !== undefined && entry !== null
}

// ---------------------------------------------------------------------------
// User scope
// ---------------------------------------------------------------------------

export async function wireClaudeCodeUser({
  anvilHome,
}: WireOptions): Promise<WireResult> {
  const actions: string[] = []

  // 1. Try CLI path
  if (claudeAvailable()) {
    const add = spawnSync(
      'claude',
      ['plugin', 'marketplace', 'add', anvilHome, '--scope', 'user'],
      { stdio: 'ignore' },
    )
    const install = spawnSync(
      'claude',
      ['plugin', 'install', 'anvil@anvil', '--scope', 'user'],
      { stdio: 'ignore' },
    )
    if (add.status === 0 && install.status === 0) {
      actions.push('claude plugin marketplace add (cli)')
      actions.push('claude plugin install anvil@anvil --scope user (cli)')
      // v0.9.1: also wire the anvil statusline into ~/.claude/settings.json
      // so a fresh user install renders Anvil's bar without a second command.
      actions.push(...(await wireStatuslineGlobalNonFatal(anvilHome)))
      return { mode: 'cli', actions }
    }
  }

  // 2. Filesystem fallback
  // Write marketplace.json
  const marketplaceDestDir = marketplaceDir()
  await mkdir(marketplaceDestDir, { recursive: true })
  const marketplaceSrc = join(anvilHome, '.claude-plugin', 'marketplace.json')
  const marketplaceDest = join(marketplaceDestDir, 'marketplace.json')
  const marketplaceContent = await readFile(marketplaceSrc, 'utf8')
  await writeFile(marketplaceDest, marketplaceContent)
  actions.push(`wrote marketplace.json → ${marketplaceDest}`)

  // Read version
  const version = await readVersion(anvilHome)

  // Create cache symlink
  const cacheVersionDir = join(cacheRoot(), version)
  const pluginSourceDir = join(anvilHome, 'plugins', 'claude-code')
  await mkdir(dirname(cacheVersionDir), { recursive: true })

  // Remove existing symlink/dir if present
  if (symlinkExists(cacheVersionDir)) {
    await unlink(cacheVersionDir).catch(async () => {
      await rm(cacheVersionDir, { recursive: true, force: true })
    })
  }
  await symlink(pluginSourceDir, cacheVersionDir)
  actions.push(`symlinked ${cacheVersionDir} → ${pluginSourceDir}`)

  // Merge into installed_plugins.json (idempotent)
  const installed = await readInstalledPlugins()
  const now = new Date().toISOString()
  installed['anvil@anvil'] = {
    scope: 'user',
    installPath: cacheVersionDir,
    version,
    installedAt:
      (installed['anvil@anvil'] as Record<string, unknown> | undefined)
        ?.installedAt ?? now,
    lastUpdated: now,
    gitCommitSha: 'local',
  }
  await writeInstalledPlugins(installed)
  actions.push('updated installed_plugins.json with anvil@anvil')

  // v0.9.1: also wire the anvil statusline into ~/.claude/settings.json
  // so a fresh user install renders Anvil's bar without a second command.
  actions.push(...(await wireStatuslineGlobalNonFatal(anvilHome)))

  return { mode: 'filesystem', actions }
}

/**
 * Best-effort merge of `{statusLine: {type:'command', command:'<anvilBin> statusline'}}`
 * into `~/.claude/settings.json`. Imported dynamically to avoid layer coupling
 * at module-load time. Failures are non-fatal — the install never aborts on a
 * statusline merge error; the CLI `anvil statusline install` is the explicit
 * recovery path.
 */
async function wireStatuslineGlobalNonFatal(
  anvilHome: string,
): Promise<string[]> {
  try {
    const { writeStatusLineToSettings } = await import(
      '../commands/cli/statusline-install.js'
    )
    const result = await writeStatusLineToSettings({
      scope: 'global',
      mode: 'anvil',
      cwd: process.cwd(),
      anvilHome,
      force: false,
    })
    return result.actions
  } catch (err) {
    return [`statusline wire skipped: ${(err as Error).message}`]
  }
}

export async function unwireClaudeCodeUser({
  anvilHome,
}: WireOptions): Promise<WireResult> {
  const actions: string[] = []

  // v0.10.9 S-001 — remove anvil-written statusLine / subagentStatusLine
  // from the global settings.json before any other cleanup.
  try {
    const slResult = await unmergeStatusLine({
      scope: 'global',
      cwd: process.cwd(),
    })
    actions.push(...slResult.actions)
  } catch (err) {
    actions.push(`statusLine unmerge skipped: ${(err as Error).message}`)
  }

  // 1. Try CLI path
  if (claudeAvailable()) {
    const uninstall = spawnSync(
      'claude',
      ['plugin', 'uninstall', 'anvil@anvil'],
      { stdio: 'ignore' },
    )
    const removeMarket = spawnSync(
      'claude',
      ['plugin', 'marketplace', 'remove', 'anvil'],
      { stdio: 'ignore' },
    )
    if (uninstall.status === 0 && removeMarket.status === 0) {
      actions.push('claude plugin uninstall anvil@anvil (cli)')
      actions.push('claude plugin marketplace remove anvil (cli)')
      return { mode: 'cli', actions }
    }
  }

  // 2. Filesystem fallback
  // Remove marketplace dir
  const marketRootDir = join(pluginsRoot(), 'marketplaces', 'anvil')
  if (existsSync(marketRootDir)) {
    await rm(marketRootDir, { recursive: true, force: true })
    actions.push(`removed ${marketRootDir}`)
  }

  // Remove cache symlink
  const version = await readVersion(anvilHome).catch(() => null)
  if (version) {
    const cacheVersionDir = join(cacheRoot(), version)
    if (symlinkExists(cacheVersionDir)) {
      await unlink(cacheVersionDir).catch(async () => {
        await rm(cacheVersionDir, { recursive: true, force: true })
      })
      actions.push(`removed cache symlink ${cacheVersionDir}`)
    }
  }

  // Splice out anvil@anvil from installed_plugins.json
  const installed = await readInstalledPlugins()
  if ('anvil@anvil' in installed) {
    installed['anvil@anvil'] = undefined
    await writeInstalledPlugins(installed)
    actions.push('removed anvil@anvil from installed_plugins.json')
  }

  return { mode: 'filesystem', actions }
}

// ---------------------------------------------------------------------------
// Project scope
// ---------------------------------------------------------------------------

const PROJECT_DIRS = ['skills', 'agents', 'commands', 'hooks'] as const

interface PluginJson {
  name?: string
  hooks?: Record<
    string,
    Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>
  >
}

// Claude Code settings.json hook format: each event is an array of matcher objects
interface SettingsHookEntry {
  matcher?: string
  hooks?: Array<{ type: string; command: string }>
  _anvilOwned?: boolean
  [key: string]: unknown
}

interface SettingsJson {
  hooks?: Record<string, SettingsHookEntry[]>
  [key: string]: unknown
}

async function readSettingsJson(path: string): Promise<SettingsJson> {
  if (!existsSync(path)) return {}
  const raw = await readFile(path, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as SettingsJson
  }
  return {}
}

export async function wireClaudeCodeProject({
  anvilHome,
  projectRoot,
  statusline,
  preset,
  effort,
}: WireOptions): Promise<WireResult> {
  if (!projectRoot)
    throw new Error('wireClaudeCodeProject: projectRoot is required')

  const actions: string[] = []
  const claudeDir = join(projectRoot, '.claude')
  await mkdir(claudeDir, { recursive: true })

  // Create symlinks for each dir
  for (const dir of PROJECT_DIRS) {
    const linkPath = join(claudeDir, dir)
    const target = join(anvilHome, dir)

    if (symlinkExists(linkPath)) {
      await unlink(linkPath).catch(async () => {
        await rm(linkPath, { recursive: true, force: true })
      })
    }
    await symlink(target, linkPath)
    actions.push(`symlinked ${linkPath} → ${target}`)
  }

  const pluginJsonPath = join(
    anvilHome,
    'plugins',
    'claude-code',
    '.claude-plugin',
    'plugin.json',
  )
  const settingsPath = join(claudeDir, 'settings.json')

  // Skip the settings.json hook merge when the user-scope plugin is active —
  // Claude Code already fires those hooks via ${CLAUDE_PLUGIN_ROOT}. Writing
  // them here too causes every hook to fire twice per event. Statusline still
  // needs to apply on this branch, so we purge stale hooks and fall through.
  const userScopePresent = await isAnvilUserScopeInstalled()
  if (userScopePresent) {
    actions.push(
      'skipped settings.json hook merge (user-scope plugin already provides hooks)',
    )
    // Purge any previously-merged _anvilOwned entries so stale installs
    // (v0.2.3 and earlier) stop double-firing after this upgrade.
    if (existsSync(settingsPath)) {
      const settings = await readSettingsJson(settingsPath)
      let changed = false
      if (settings.hooks) {
        for (const event of Object.keys(settings.hooks)) {
          const before = settings.hooks[event].length
          settings.hooks[event] = settings.hooks[event].filter(
            (e) => e._anvilOwned !== true,
          )
          if (settings.hooks[event].length !== before) changed = true
          if (settings.hooks[event].length === 0) {
            delete settings.hooks[event]
            changed = true
          }
        }
        if (Object.keys(settings.hooks).length === 0) {
          settings.hooks = undefined
          changed = true
        }
      }
      if (changed) {
        await writeFile(settingsPath, JSON.stringify(settings, null, 2))
        actions.push(`purged stale anvil hooks from ${settingsPath}`)
      }
    }
  } else if (existsSync(pluginJsonPath)) {
    const pluginRaw = await readFile(pluginJsonPath, 'utf8')
    let pluginJson: PluginJson
    try {
      pluginJson = JSON.parse(pluginRaw) as PluginJson
    } catch (cause) {
      throw new Error(
        `wireClaudeCodeProject: plugin.json is malformed at ${pluginJsonPath}`,
        { cause },
      )
    }
    const pluginHooks = pluginJson.hooks ?? {}
    const pluginRoot = join(anvilHome, 'plugins', 'claude-code')

    const settings = await readSettingsJson(settingsPath)
    if (!settings.hooks) settings.hooks = {}

    for (const [event, entries] of Object.entries(pluginHooks)) {
      if (!settings.hooks[event]) settings.hooks[event] = []
      for (const entry of entries) {
        for (const hookCmd of entry.hooks ?? []) {
          const command = hookCmd.command.replace(
            /\$\{CLAUDE_PLUGIN_ROOT\}/g,
            pluginRoot,
          )
          const alreadyPresent = settings.hooks[event].some(
            (e) =>
              e._anvilOwned === true &&
              (e.hooks ?? []).some((h) => h.command === command),
          )
          if (!alreadyPresent) {
            settings.hooks[event].push({
              matcher: entry.matcher ?? '',
              hooks: [{ type: hookCmd.type, command }],
              _anvilOwned: true,
            })
            actions.push(`merged hook ${event} → ${command}`)
          }
        }
      }
    }

    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(settingsPath, JSON.stringify(settings, null, 2))
    actions.push(`wrote settings.json at ${settingsPath}`)
  }

  if (statusline) {
    actions.push(...(await applyStatusline({ anvilHome, claudeDir })))
  }

  // Plan 28 Phase G1 — emit/refresh the settings.json template
  // (permissions block, effortLevel, disableAllHooks, _anvilNotes).
  // Runs after hook + statusline merge so it composes with whatever
  // those branches wrote. Idempotent: only fills in keys that are
  // missing.
  actions.push(...(await applySettingsTemplate({ claudeDir, preset, effort })))

  return { mode: 'filesystem', actions }
}

/**
 * Plan 28 Phase G1. Emit (or refresh) the Anvil-owned subset of
 * `.claude/settings.json`:
 *
 *   - `$schema` — points at the published CC settings JSON Schema so
 *     editors give autocomplete out of the box.
 *   - `permissions` — empty `allow`/`ask`/`deny`/`additionalDirectories`
 *     arrays plus a preset-derived `defaultMode`. Phase H will populate
 *     `allow`/`ask`/`deny` from agent permissions; for v0.4 we leave
 *     them empty so the user can hand-edit without conflicting with
 *     Anvil's writer.
 *   - `effortLevel` — derived from `models.json → defaults.effort`.
 *   - `disableAllHooks: false` — explicit so users can flip it.
 *   - `_anvilNotes` — Anvil-private hint block documenting how to opt
 *     into `sandbox` and `outputStyle`. Not interpreted by CC.
 *
 * Idempotency rules:
 *   - `permissions.defaultMode` is *always* refreshed from the preset
 *     (init authority — the user picked the preset on this run).
 *   - All other keys are only populated when missing, so re-running
 *     `anvil init` does not stomp user edits.
 */
export async function applySettingsTemplate({
  claudeDir,
  preset,
  effort,
}: {
  claudeDir: string
  preset?: string
  effort?: EffortLevel
}): Promise<string[]> {
  const actions: string[] = []
  const settingsPath = join(claudeDir, 'settings.json')
  await mkdir(claudeDir, { recursive: true })
  const settings = await readSettingsJson(settingsPath)

  let changed = false

  if (settings.$schema !== CC_SETTINGS_SCHEMA_URL) {
    settings.$schema = CC_SETTINGS_SCHEMA_URL
    changed = true
  }

  // permissions block — create when missing, then refresh defaultMode.
  const desiredMode: PermissionMode = presetToDefaultMode(preset ?? 'balanced')
  const existingPerms =
    settings.permissions !== null &&
    typeof settings.permissions === 'object' &&
    !Array.isArray(settings.permissions)
      ? (settings.permissions as Record<string, unknown>)
      : null
  const nextPerms: Record<string, unknown> = existingPerms
    ? { ...existingPerms }
    : {
        allow: [],
        ask: [],
        deny: [],
        additionalDirectories: [],
      }
  if (!('allow' in nextPerms)) nextPerms.allow = []
  if (!('ask' in nextPerms)) nextPerms.ask = []
  if (!('deny' in nextPerms)) nextPerms.deny = []
  if (!('additionalDirectories' in nextPerms)) {
    nextPerms.additionalDirectories = []
  }
  if (nextPerms.defaultMode !== desiredMode) {
    nextPerms.defaultMode = desiredMode
    changed = true
  }
  if (!existingPerms) changed = true
  settings.permissions = nextPerms

  if (settings.disableAllHooks === undefined) {
    settings.disableAllHooks = false
    changed = true
  }

  if (effort !== undefined && settings.effortLevel === undefined) {
    // CC's effortLevel field doesn't accept "max" — clamp to "xhigh".
    const ccEffort = effort === 'max' ? 'xhigh' : effort
    settings.effortLevel = ccEffort
    changed = true
  }

  if (settings._anvilNotes === undefined) {
    settings._anvilNotes = {
      _: 'Anvil-private — not interpreted by Claude Code. Safe to delete.',
      sandbox:
        'Opt into bash sandboxing by adding `"sandbox": { "enabled": true }` at the top level. See https://docs.anthropic.com/claude-code/sandboxing.',
      outputStyle:
        'Set `"outputStyle": "Explanatory"` (or any installed style) to override the default system prompt. See https://docs.anthropic.com/claude-code/output-styles.',
      managedDir:
        '.claude/settings.local.json (gitignored, personal overrides)',
    }
    changed = true
  }

  if (changed) {
    await writeFile(settingsPath, JSON.stringify(settings, null, 2))
    actions.push(`merged settings template into ${settingsPath}`)
  } else {
    actions.push(`settings template already current at ${settingsPath}`)
  }

  return actions
}

/**
 * Wire the `statusLine` block in `.claude/settings.json` to invoke the
 * Anvil-shipped TypeScript renderer (`anvil statusline`). Idempotent.
 *
 * Plan 28 Phase C5. The TS renderer reads the full Claude Code stdin JSON
 * shape (model, output_style, context_window, rate_limits, etc.) and emits
 * one rendered line per the user-configured tier (`models.json →
 * statusline.tier`). Replaces the bash-script approach as the default;
 * `anvil statusline install --shell-script` opts back into a copied bash
 * script for users who prefer an external file.
 */
async function applyStatusline({
  anvilHome,
  claudeDir,
}: {
  anvilHome: string
  claudeDir: string
}): Promise<string[]> {
  const actions: string[] = []
  // The bin entry exists at `<anvilHome>/bin/anvil.cjs` after install.
  const anvilBin = join(anvilHome, 'bin', 'anvil.cjs')
  const settingsPath = join(claudeDir, 'settings.json')
  const settings = await readSettingsJson(settingsPath)
  const desired = {
    type: 'command' as const,
    command: `${anvilBin} statusline`,
    padding: 0,
    refreshInterval: 5,
  }
  const current = settings.statusLine as typeof desired | undefined
  const matches =
    current &&
    current.type === desired.type &&
    current.command === desired.command &&
    current.padding === desired.padding &&
    current.refreshInterval === desired.refreshInterval
  if (!matches) {
    settings.statusLine = desired
    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(settingsPath, JSON.stringify(settings, null, 2))
    actions.push(`merged statusLine (anvil statusline) into ${settingsPath}`)
  }

  // Plan 29 Phase F1 — subagentStatusLine: opt-in via
  // `models.json → statusline.show_subagent_panel: true`.
  // v0.10.9 E-003: surface malformed models.json instead of treating it as
  // "panel disabled". Absent file is the legitimate default-off case.
  const panelResult = await readShowSubagentPanel(anvilHome)
  if (panelResult.present && 'error' in panelResult) {
    process.stderr.write(
      `anvil wire: ~/.anvil/models.json malformed (${panelResult.error}); subagent panel left disabled\n`,
    )
  }
  const showSubagentPanel =
    panelResult.present && 'value' in panelResult ? panelResult.value : false
  if (showSubagentPanel) {
    const desiredSubagent = {
      type: 'command' as const,
      command: `${anvilBin} statusline subagent`,
    }
    const currentSubagent = settings.subagentStatusLine as
      | typeof desiredSubagent
      | undefined
    const subagentMatches =
      currentSubagent &&
      currentSubagent.type === desiredSubagent.type &&
      currentSubagent.command === desiredSubagent.command
    if (!subagentMatches) {
      settings.subagentStatusLine = desiredSubagent
      await mkdir(dirname(settingsPath), { recursive: true })
      await writeFile(settingsPath, JSON.stringify(settings, null, 2))
      actions.push(
        `merged subagentStatusLine (anvil statusline subagent) into ${settingsPath}`,
      )
    }
  }

  return actions
}

/**
 * Reads `models.json → statusline.show_subagent_panel` from the
 * user-scope `~/.anvil/models.json`.
 *
 * v0.10.9 E-003: returns a discriminated `ManifestReadResult` so callers can
 * tell apart "file absent" (legitimate default-off) from "file malformed"
 * (real configuration error worth surfacing). Within a present-and-valid
 * file, an absent or non-`true` field still maps to `value: false` — the
 * field itself defaults to off.
 *
 * Exported so unit tests and the doctor can exercise it directly.
 */
export async function readShowSubagentPanel(
  anvilHome: string,
): Promise<ManifestReadResult<boolean>> {
  const modelsPath = join(anvilHome, 'models.json')
  if (!existsSync(modelsPath)) return { present: false }
  let raw: string
  try {
    raw = await readFile(modelsPath, 'utf-8')
  } catch (err) {
    return {
      present: true,
      error: `read failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return {
      present: true,
      error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { present: true, error: 'expected JSON object at top level' }
  }
  const sl = (parsed as Record<string, unknown>).statusline
  if (typeof sl === 'object' && sl !== null && !Array.isArray(sl)) {
    const val = (sl as Record<string, unknown>).show_subagent_panel
    return { present: true, value: val === true }
  }
  return { present: true, value: false }
}

export async function unwireClaudeCodeProject({
  anvilHome: _anvilHome,
  projectRoot,
}: WireOptions): Promise<WireResult> {
  if (!projectRoot)
    throw new Error('unwireClaudeCodeProject: projectRoot is required')

  const actions: string[] = []
  const claudeDir = join(projectRoot, '.claude')

  // Remove symlinks
  for (const dir of PROJECT_DIRS) {
    const linkPath = join(claudeDir, dir)
    if (symlinkExists(linkPath)) {
      await unlink(linkPath).catch(async () => {
        await rm(linkPath, { recursive: true, force: true })
      })
      actions.push(`removed ${linkPath}`)
    }
  }

  // v0.10.9 S-001 — remove anvil-written statusLine / subagentStatusLine
  // from the project settings.json.
  try {
    const slResult = await unmergeStatusLine({
      scope: 'project',
      cwd: projectRoot,
    })
    actions.push(...slResult.actions)
  } catch (err) {
    actions.push(`statusLine unmerge skipped: ${(err as Error).message}`)
  }

  // Splice out _anvilOwned hooks from settings.json
  const settingsPath = join(claudeDir, 'settings.json')
  if (existsSync(settingsPath)) {
    const settings = await readSettingsJson(settingsPath)
    if (settings.hooks) {
      for (const event of Object.keys(settings.hooks)) {
        settings.hooks[event] = settings.hooks[event].filter(
          (e) => e._anvilOwned !== true,
        )
        if (settings.hooks[event].length === 0) {
          delete settings.hooks[event]
        }
      }
      if (Object.keys(settings.hooks).length === 0) {
        settings.hooks = undefined
      }
      await writeFile(settingsPath, JSON.stringify(settings, null, 2))
      actions.push(`updated settings.json at ${settingsPath}`)
    }
  }

  return { mode: 'filesystem', actions }
}
