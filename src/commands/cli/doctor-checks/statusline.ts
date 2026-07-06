import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getUserHome } from '../../../core/io/home.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * Plan 28 C9 / Plan 33 E4. Classify a settings.json object's statusLine command.
 *   - 'anvil'       → command includes 'anvil' + 'statusline' (TS renderer)
 *   - 'anvil-shell' → command points at a bash …/statusline-command.sh
 *   - 'custom'      → any other non-empty command
 *   - 'missing'     → block absent or command empty/malformed
 */
export function classifyStatuslineCommand(settings: unknown): {
  kind: 'anvil' | 'anvil-shell' | 'custom' | 'missing'
  command: string
} {
  if (
    settings === null ||
    typeof settings !== 'object' ||
    Array.isArray(settings)
  ) {
    return { kind: 'missing', command: '' }
  }
  const sl = (settings as Record<string, unknown>).statusLine
  if (sl === undefined || sl === null) return { kind: 'missing', command: '' }
  if (typeof sl !== 'object' || Array.isArray(sl))
    return { kind: 'missing', command: '' }
  const cmd = (sl as Record<string, unknown>).command
  if (typeof cmd !== 'string' || cmd.length === 0)
    return { kind: 'missing', command: '' }
  if (cmd.includes('anvil') && cmd.includes('statusline'))
    return { kind: 'anvil', command: cmd }
  if (
    cmd.includes('statusline-command.sh') ||
    (cmd.endsWith('.sh') && cmd.includes('.claude/statusline'))
  )
    return { kind: 'anvil-shell', command: cmd }
  return { kind: 'custom', command: cmd }
}

/**
 * Plan 28 C9. Inspect `.claude/settings.json → statusLine` and report:
 *   - pass: command points to `anvil statusline` (TS renderer) OR an
 *     existing shell script in `.claude/`
 *   - warn: block missing OR command does not resolve to anything we
 *     recognise
 */
export function inspectStatuslineWiring(projectSettings: unknown): {
  status: 'pass' | 'warn'
  detail: string
} {
  const { kind, command } = classifyStatuslineCommand(projectSettings)
  switch (kind) {
    case 'anvil':
      return { status: 'pass', detail: `→ ${command}` }
    case 'anvil-shell':
      return { status: 'pass', detail: `→ shell script (${command})` }
    case 'custom':
      return {
        status: 'warn',
        detail: `Custom statusline detected: ${command} — run \`anvil statusline install --scope project --mode anvil\` to switch`,
      }
    case 'missing':
      return {
        status: 'warn',
        detail:
          'not wired — run `anvil statusline install --scope project` to wire the statusline',
      }
  }
}

/**
 * Plan 33 E4. Inspect global `~/.claude/settings.json → statusLine` for
 * drift. Returns null when the global settings.json does not exist.
 */
export function inspectGlobalStatuslineWiring(): {
  status: 'pass' | 'warn'
  detail: string
} | null {
  const globalSettingsPath = join(getUserHome(), '.claude', 'settings.json')
  if (!existsSync(globalSettingsPath)) return null
  let globalSettings: unknown = null
  try {
    const raw = readFileSync(globalSettingsPath, 'utf-8')
    globalSettings = JSON.parse(raw)
  } catch {
    return null
  }
  const { kind, command } = classifyStatuslineCommand(globalSettings)
  switch (kind) {
    case 'anvil':
      return { status: 'pass', detail: `→ ${command}` }
    case 'anvil-shell':
      return { status: 'pass', detail: `→ shell script (${command})` }
    case 'custom':
      return {
        status: 'warn',
        detail: `Custom statusline detected: ${command} — run \`anvil statusline install --scope global --mode anvil\` to switch`,
      }
    case 'missing':
      return {
        status: 'warn',
        detail:
          'not wired — run `anvil statusline install --scope global` to wire globally',
      }
  }
}

/**
 * Plan 29 Phase F1 — subagent panel doctor check.
 *
 * Returns null when `show_subagent_panel` is false (or absent in models.json)
 * — the check is silently omitted in that case. Returns a warn/pass result
 * when the opt-in is active.
 */
export function inspectSubagentStatuslineWiring(
  projectSettings: unknown,
  anvilHome: string,
): { status: 'pass' | 'warn'; detail: string } | null {
  // Only surface this check when the opt-in is enabled.
  const modelsPath = join(anvilHome, 'models.json')
  if (!existsSync(modelsPath)) return null
  let showSubagentPanel = false
  try {
    const raw = readFileSync(modelsPath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sl = parsed.statusline
    if (typeof sl === 'object' && sl !== null) {
      showSubagentPanel =
        (sl as Record<string, unknown>).show_subagent_panel === true
    }
  } catch {
    return null
  }
  if (!showSubagentPanel) return null

  // Opt-in is active — check .claude/settings.json has subagentStatusLine.
  if (
    typeof projectSettings !== 'object' ||
    projectSettings === null ||
    Array.isArray(projectSettings)
  ) {
    return {
      status: 'warn',
      detail:
        'show_subagent_panel is on but .claude/settings.json missing — run `anvil statusline install --scope project`',
    }
  }
  const sal = (projectSettings as Record<string, unknown>).subagentStatusLine
  if (sal === undefined || sal === null) {
    return {
      status: 'warn',
      detail:
        'show_subagent_panel is on but subagentStatusLine missing from .claude/settings.json — run `anvil statusline install --scope project`',
    }
  }
  if (typeof sal !== 'object' || Array.isArray(sal)) {
    return { status: 'warn', detail: 'subagentStatusLine block malformed' }
  }
  const cmd = (sal as Record<string, unknown>).command
  if (typeof cmd === 'string' && cmd.includes('statusline subagent')) {
    return { status: 'pass', detail: `→ ${cmd}` }
  }
  return {
    status: 'warn',
    detail:
      'subagentStatusLine.command does not point to `anvil statusline subagent`',
  }
}

// Re-export Check type for consumers that need it
export type { Check }
