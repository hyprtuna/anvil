/**
 * WorkflowConfig loading for workflow-guard (Plan 43 Phase D).
 *
 * Reads `.anvil/anvil.config.json` in cwd and validates against the Zod schema.
 * Any I/O or schema failure falls back to advisory mode (returns defaults +
 * non-empty parseError that the handler logs to stderr).
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type WorkflowConfig,
  WorkflowConfig as WorkflowConfigSchema,
} from '../../../core/types.js'

const CONFIG_FILENAMES = ['anvil.config.json']
const ANVIL_DIR = '.anvil'

export async function loadWorkflowConfig(
  cwd: string,
): Promise<{ config: WorkflowConfig; parseError?: string }> {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = join(cwd, ANVIL_DIR, filename)
    if (!existsSync(configPath)) continue

    let raw: string
    try {
      raw = await readFile(configPath, 'utf-8')
    } catch (e) {
      return {
        config: WorkflowConfigSchema.parse({}),
        parseError: `Could not read ${configPath}: ${String(e)}`,
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      return {
        config: WorkflowConfigSchema.parse({}),
        parseError: `${configPath} is not valid JSON: ${String(e)}`,
      }
    }

    try {
      const result = WorkflowConfigSchema.safeParse(parsed)
      if (result.success) {
        return { config: result.data }
      }
      return {
        config: WorkflowConfigSchema.parse({}),
        parseError: `WorkflowConfig schema mismatch in ${configPath}: ${result.error.message}`,
      }
    } catch (e) {
      return {
        config: WorkflowConfigSchema.parse({}),
        parseError: `WorkflowConfig parse failure for ${configPath}: ${String(e)}`,
      }
    }
  }

  return { config: WorkflowConfigSchema.parse({}) }
}
