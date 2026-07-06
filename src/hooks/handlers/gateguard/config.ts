/**
 * GateGuard config loading helper (Plan 43 Phase C).
 *
 * Resolves whether GateGuard is enabled in the current session via
 * (a) ANVIL_GATEGUARD env-var override (set by --strict on CLI commands), or
 * (b) WorkflowConfig.gateguard in .anvil/anvil.config.json.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { warnConfigInvalidOnce } from '../../../core/config/warn-once.js'
import { WorkflowConfig as WorkflowConfigSchema } from '../../../core/types.js'

const CONFIG_FILENAMES = ['anvil.config.json']
const ANVIL_DIR = '.anvil'

export async function isGateguardEnabled(
  cwd: string,
  env: Record<string, string>,
): Promise<boolean> {
  // Transient env-var override (set by --strict on CLI commands)
  if (env.ANVIL_GATEGUARD === '1' || process.env.ANVIL_GATEGUARD === '1') {
    return true
  }

  // Persistent config
  for (const filename of CONFIG_FILENAMES) {
    const configPath = join(cwd, ANVIL_DIR, filename)
    if (!existsSync(configPath)) continue
    try {
      const raw = await readFile(configPath, 'utf-8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        warnConfigInvalidOnce(configPath, String(e), 'user-prompt-submit')
        continue
      }
      const result = WorkflowConfigSchema.safeParse(parsed)
      if (result.success) return result.data.gateguard
      warnConfigInvalidOnce(
        configPath,
        result.error.message,
        'user-prompt-submit',
      )
    } catch {
      // fall through (e.g. readFile EACCES — not a config-validation error)
    }
  }

  return false
}
