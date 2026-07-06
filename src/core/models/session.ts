import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ActiveModelFile } from '../types.js'
import { ActiveModelFile as ActiveModelFileSchema } from '../types.js'

/**
 * Reads `.anvil/active-model.json` from `cwd` and returns the parsed
 * session override, or `null` when the file is absent or malformed.
 *
 * A malformed file logs a warning to stderr and is treated as absent —
 * silent failure would mask user mistakes.
 */
export async function loadSessionOverride(
  cwd: string,
): Promise<ActiveModelFile | null> {
  const path = join(cwd, '.anvil', 'active-model.json')
  if (!existsSync(path)) return null

  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (err) {
    process.stderr.write(
      `anvil: warning: could not read ${path}: ${(err as Error).message}\n`,
    )
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    process.stderr.write(
      `anvil: warning: ${path} is not valid JSON — session override ignored\n`,
    )
    return null
  }

  const result = ActiveModelFileSchema.safeParse(parsed)
  if (!result.success) {
    process.stderr.write(
      `anvil: warning: ${path} has an invalid shape — session override ignored\n` +
        `  ${result.error.errors.map((e) => e.message).join(', ')}\n`,
    )
    return null
  }

  return result.data
}

/**
 * Writes `.anvil/active-model.json` to `cwd`, creating the directory as
 * needed.  Called by `anvil model <id>`.
 */
export async function saveSessionOverride(
  cwd: string,
  override: Omit<ActiveModelFile, 'set_at'>,
): Promise<void> {
  const anvilDir = join(cwd, '.anvil')
  if (!existsSync(anvilDir)) {
    await mkdir(anvilDir, { recursive: true })
  }
  const file: ActiveModelFile = {
    ...override,
    set_at: new Date().toISOString(),
  }
  const path = join(anvilDir, 'active-model.json')
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf-8')
}
