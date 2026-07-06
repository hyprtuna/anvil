/**
 * ANV-0009 — Installer category checks.
 *
 * Checks that verify the Anvil installation is present and healthy:
 *   - Node.js version meets the minimum requirement (≥ 20).
 *   - ~/.anvil/version file exists.
 *   - ~/.anvil/plugins/claude-code/.claude-plugin/plugin.json parses.
 *   - Dev-script leakage: scripts/dev/ must not exist inside ~/.anvil/ (ANV-0181).
 *
 * These three checks were previously inlined in `doctorCommand()`.
 * They are extracted here as the first concrete category migration
 * (incremental migration per ANV-0009).
 *
 * The dispatcher in `doctor.ts` may continue to call `pushInstallerChecks`
 * directly as a convenience wrapper, or call `runner` on each entry.
 */

import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckRow,
} from '../doctor-registry.js'

// ---------------------------------------------------------------------------
// Individual check runners
// ---------------------------------------------------------------------------

async function runNodeVersionCheck(
  _ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): Promise<void> {
  const nodeVersion = process.versions.node
  const major = Number.parseInt(nodeVersion.split('.')[0] ?? '0', 10)
  rows.push({
    name: 'Node.js',
    status: major >= 20 ? 'pass' : 'fail',
    detail: `v${nodeVersion} (require ≥ 20)`,
  })
}

async function runAnvilVersionCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): Promise<void> {
  const versionFile = join(ctx.anvilHome, 'version')
  const hasVersion = existsSync(versionFile)
  let installedVersion = 'unknown'
  if (hasVersion) {
    try {
      installedVersion = (await readFile(versionFile, 'utf-8')).trim()
    } catch {
      // ignore
    }
  }
  rows.push({
    name: '~/.anvil/version',
    status: hasVersion ? 'pass' : 'warn',
    detail: hasVersion ? `v${installedVersion}` : 'missing — run `anvil init`',
  })
}

async function runPluginJsonCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): Promise<void> {
  const pluginJsonPath = join(
    ctx.anvilHome,
    'plugins',
    'claude-code',
    '.claude-plugin',
    'plugin.json',
  )
  let pluginJsonPresent = false
  if (existsSync(pluginJsonPath)) {
    try {
      const raw = await readFile(pluginJsonPath, 'utf-8')
      JSON.parse(raw)
      pluginJsonPresent = true
    } catch {
      // malformed JSON — treat as absent
    }
  }
  rows.push({
    name: '~/.anvil/plugins/claude-code/.claude-plugin/plugin.json',
    status: pluginJsonPresent ? 'pass' : 'warn',
    detail: pluginJsonPresent
      ? 'present and valid JSON'
      : 'missing — run `anvil init`',
  })
}

/**
 * ANV-0181 — Dev-script leakage check.
 *
 * Verifies that no `scripts/dev/` path exists anywhere under `~/.anvil/`.
 * The `scripts/dev/` subtree is contributor-only tooling; it must never
 * appear in a user install.
 *
 * Performs a recursive walk of `ctx.anvilHome` (depth cap: 6) and reports
 * every directory whose name is `dev` with a parent named `scripts`.  This
 * catches all future install vectors (opencode plugins, nested paths, etc.)
 * without requiring hardcoded entries per vector.
 *
 * Walk exclusions: `node_modules`, `.git`, hidden directories (names that
 * start with `.`) — except `.anvil` itself is the root so it is always walked.
 */
async function findDevScriptDirs(
  dir: string,
  depth: number,
): Promise<string[]> {
  if (depth > 6) return []
  if (!existsSync(dir)) return []

  let entries: import('node:fs').Dirent<string>[]
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: 'utf-8' })
  } catch {
    return []
  }

  const found: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const name = entry.name

    // Skip node_modules and .git always; skip other hidden dirs
    if (name === 'node_modules' || name === '.git') continue
    if (name.startsWith('.')) continue

    const childPath = join(dir, name)
    const parentName = basename(dir)

    // A directory named 'dev' whose parent is named 'scripts' is a leakage hit
    if (name === 'dev' && parentName === 'scripts') {
      found.push(childPath)
      // Don't recurse into the leaked dir — it's already flagged
      continue
    }

    const nested = await findDevScriptDirs(childPath, depth + 1)
    found.push(...nested)
  }

  return found
}

async function runDevScriptLeakageCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): Promise<void> {
  const leaked = await findDevScriptDirs(ctx.anvilHome, 0)

  if (leaked.length > 0) {
    rows.push({
      name: 'Dev-script leakage',
      status: 'fail',
      detail: `scripts/dev paths found under ~/.anvil/: ${leaked.join(', ')}. Dev scripts are contributor-only and must not ship in user installs.`,
    })
  } else {
    rows.push({
      name: 'Dev-script leakage',
      status: 'pass',
      detail: 'no dev-script leakage detected under ~/.anvil/',
    })
  }
}

// ---------------------------------------------------------------------------
// Exported registry entries
// ---------------------------------------------------------------------------

export const nodeVersionCheck: DoctorCheck = {
  id: 'installer/node-version',
  label: 'Node.js version',
  category: 'installer',
  runner: runNodeVersionCheck,
}

export const anvilVersionCheck: DoctorCheck = {
  id: 'installer/anvil-version',
  label: '~/.anvil/version',
  category: 'installer',
  fixHint: 'anvil init',
  runner: runAnvilVersionCheck,
}

export const pluginJsonCheck: DoctorCheck = {
  id: 'installer/plugin-json',
  label: '~/.anvil/plugins/claude-code/.claude-plugin/plugin.json',
  category: 'installer',
  fixHint: 'anvil init',
  runner: runPluginJsonCheck,
}

/**
 * ANV-0181 — Dev-script leakage guard.
 * User-facing check that verifies no `scripts/dev/` paths exist under `~/.anvil/`.
 */
export const devScriptLeakageCheck: DoctorCheck = {
  id: 'installer/dev-script-leakage',
  label: 'Dev-script leakage',
  category: 'installer',
  fixHint: 'anvil init',
  runner: runDevScriptLeakageCheck,
}

/**
 * All installer checks in declaration order.
 * Import this array to register the category with the dispatcher.
 */
export const INSTALLER_CHECKS: readonly DoctorCheck[] = [
  nodeVersionCheck,
  anvilVersionCheck,
  pluginJsonCheck,
  devScriptLeakageCheck,
]

/**
 * Convenience wrapper: runs all installer checks and pushes results into
 * `rows`. Used by the legacy dispatcher in `doctor.ts` during the
 * incremental migration period.
 */
export async function pushInstallerChecks(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): Promise<void> {
  for (const check of INSTALLER_CHECKS) {
    await check.runner(ctx, rows)
  }
}
