import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from '../core/config/load.js'
import { runInstaller } from './install.js'
import type { InstallSummary } from './install.js'

/**
 * Obsolete handler scripts removed in v0.10.2 (Plan 39 Phase E).
 * On upgrade these files are deleted from the installed CC plugin directory
 * if present. The paths are relative to the CC plugin root
 * (~/.anvil/plugins/claude-code/ for global or <cwd>/.claude-plugin/ for
 * project scope).
 */
const OBSOLETE_HOOK_SCRIPTS = [
  'hooks/comment-checker.cjs',
  'hooks/ui-rules.cjs',
]

async function removeObsoleteHandlers(pluginRoot: string): Promise<string[]> {
  const removed: string[] = []
  for (const rel of OBSOLETE_HOOK_SCRIPTS) {
    const abs = join(pluginRoot, rel)
    if (existsSync(abs)) {
      await rm(abs, { force: true })
      removed.push(abs)
    }
  }
  return removed
}

/**
 * Re-materializes adapter files from the current project config without
 * overwriting it. The preset field is a placeholder — `config` takes priority
 * inside `runInstaller`.
 */
export async function runUpgrade(opts?: {
  cwd?: string
  home?: string
}): Promise<InstallSummary> {
  const cwd = opts?.cwd ?? process.cwd()
  const home = opts?.home ?? process.env.HOME ?? ''
  const config = await loadConfig({ scope: 'project', cwd, home })

  // Plan 39 Phase E: remove obsolete handler scripts before re-materializing.
  // We attempt cleanup from both global and project plugin dirs. Errors are
  // silently ignored — the scripts simply won't exist on fresh installs.
  const globalPluginRoot = join(home, '.anvil', 'plugins', 'claude-code')
  const projectPluginRoot = join(cwd, '.claude-plugin')
  await Promise.all([
    removeObsoleteHandlers(globalPluginRoot).catch(() => []),
    removeObsoleteHandlers(projectPluginRoot).catch(() => []),
  ])

  return runInstaller({
    target: 'both',
    scope: 'project',
    preset: 'balanced',
    cwd,
    home,
    config,
  })
}
