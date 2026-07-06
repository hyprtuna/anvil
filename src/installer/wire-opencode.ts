import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getUserHome } from '../core/io/home.js'
import { OpenCodeConfig } from '../core/manifest-schema/opencode-config.js'

export interface WireOpenCodeOptions {
  anvilHome: string
  projectRoot?: string
}

export interface WireOpenCodeResult {
  mode: 'filesystem'
  actions: string[]
}

/**
 * Absolute file:// URL for the compiled OpenCode plugin.
 * D-09: must point at index.js, not the parent directory.
 * OpenCode's URL resolver does not expand tildes; absolute paths required.
 */
function pluginUrl(anvilHome: string): string {
  return `file://${join(anvilHome, 'plugins', 'opencode', 'index.js')}`
}

async function mergeConfig(
  configPath: string,
  anvilHome: string,
): Promise<string[]> {
  const actions: string[] = []
  await mkdir(dirname(configPath), { recursive: true })

  let raw: unknown = {}
  if (existsSync(configPath)) {
    try {
      raw = JSON.parse(await readFile(configPath, 'utf8'))
    } catch {
      // malformed JSON — starting fresh discards user config; surface the event to caller
      actions.push(
        `WARNING: ${configPath} contained malformed JSON — existing content replaced`,
      )
    }
  }

  const config = OpenCodeConfig.parse(raw)
  const url = pluginUrl(anvilHome)
  const plugins = config.plugin ?? []

  if (!plugins.includes(url)) {
    const updated = { ...config, plugin: [...plugins, url] }
    await writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`)
    actions.push(`added plugin ${url} to ${configPath}`)
  }

  return actions
}

async function unmergeConfig(
  configPath: string,
  anvilHome: string,
): Promise<string[]> {
  const actions: string[] = []
  if (!existsSync(configPath)) return actions

  let raw: unknown = {}
  try {
    raw = JSON.parse(await readFile(configPath, 'utf8'))
  } catch {
    return actions
  }

  const parsed = OpenCodeConfig.safeParse(raw)
  if (!parsed.success) return actions // unrecognized format (e.g. v1) — nothing to unmerge
  const config = parsed.data
  const url = pluginUrl(anvilHome)

  // Early return if Anvil URL isn't present — nothing to do, no write needed
  const anvilPresent = (config.plugin ?? []).includes(url)
  if (!anvilPresent) return actions

  const plugins = (config.plugin ?? []).filter((p) => p !== url)

  const updated: Record<string, unknown> = { ...config }
  if (plugins.length > 0) {
    updated.plugin = plugins
  } else {
    updated.plugin = undefined
  }

  await writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`)
  actions.push(`removed plugin ${url} from ${configPath}`)
  return actions
}

export async function wireOpenCodeUser({
  anvilHome,
}: WireOpenCodeOptions): Promise<WireOpenCodeResult> {
  const configPath = join(getUserHome(), '.config', 'opencode', 'opencode.json')
  const actions = await mergeConfig(configPath, anvilHome)
  return { mode: 'filesystem', actions }
}

export async function wireOpenCodeProject({
  anvilHome,
  projectRoot,
}: WireOpenCodeOptions): Promise<WireOpenCodeResult> {
  if (!projectRoot)
    throw new Error('wireOpenCodeProject: projectRoot is required')
  const configPath = join(projectRoot, '.opencode', 'opencode.json')
  const actions = await mergeConfig(configPath, anvilHome)
  return { mode: 'filesystem', actions }
}

export async function unwireOpenCodeUser({
  anvilHome,
}: WireOpenCodeOptions): Promise<WireOpenCodeResult> {
  const configPath = join(getUserHome(), '.config', 'opencode', 'opencode.json')
  const actions = await unmergeConfig(configPath, anvilHome)
  return { mode: 'filesystem', actions }
}

export async function unwireOpenCodeProject({
  anvilHome,
  projectRoot,
}: WireOpenCodeOptions): Promise<WireOpenCodeResult> {
  if (!projectRoot)
    throw new Error('unwireOpenCodeProject: projectRoot is required')
  const configPath = join(projectRoot, '.opencode', 'opencode.json')
  const actions = await unmergeConfig(configPath, anvilHome)
  return { mode: 'filesystem', actions }
}
