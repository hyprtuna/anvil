import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModelsConfig, Scope } from '../types.js'
import { ModelsConfig as ModelsConfigSchema } from '../types.js'
import { buildDefaultConfig } from './defaults.js'
import { resolvePaths } from './paths.js'

export interface LoadConfigOptions {
  scope: Scope
  cwd: string
  home?: string
}

/**
 * Loads `.anvil/models.json` from the resolved scope, merges with defaults,
 * validates with Zod, and returns the final ModelsConfig.
 */
export async function loadConfig(
  opts: LoadConfigOptions,
): Promise<ModelsConfig> {
  const paths = resolvePaths(opts)
  const configPath = join(paths.anvil, 'models.json')
  const defaults = buildDefaultConfig()

  if (!existsSync(configPath)) {
    return defaults
  }

  const raw = await readFile(configPath, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Failed to parse ${configPath}: ${(err as Error).message}`)
  }

  const merged = deepMerge(defaults, parsed)
  return ModelsConfigSchema.parse(merged)
}

/**
 * Writes a ModelsConfig to `.anvil/models.json`.
 * Creates the `.anvil/` directory if needed.
 */
export async function saveConfig(
  config: ModelsConfig,
  opts: LoadConfigOptions,
): Promise<void> {
  const paths = resolvePaths(opts)
  if (!existsSync(paths.anvil)) {
    await mkdir(paths.anvil, { recursive: true })
  }
  const configPath = join(paths.anvil, 'models.json')
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
}

/**
 * Recursive merge where overlay wins on primitives and arrays.
 *
 * Arrays are **replaced**, not concatenated: `{groups: {planning: {members: ['a']}}}`
 * on top of a base with `members: ['a', 'b']` yields `['a']`. This is deliberate —
 * users must spell out full membership when customizing a group — but it is a
 * foot-gun when blindly copying partial overrides. Document this in user-facing
 * docs whenever introducing new array-valued config keys.
 */
function deepMerge<T>(base: T, overlay: unknown): T {
  if (!isPlainObject(overlay)) return base
  if (!isPlainObject(base)) return overlay as T
  const merged: Record<string, unknown> = {
    ...(base as Record<string, unknown>),
  }
  for (const key of Object.keys(overlay)) {
    const b = (base as Record<string, unknown>)[key]
    const o = (overlay as Record<string, unknown>)[key]
    merged[key] = isPlainObject(b) && isPlainObject(o) ? deepMerge(b, o) : o
  }
  return merged as T
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
