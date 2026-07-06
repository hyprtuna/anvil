/**
 * ANV-0199 — Preferences persistence (`~/.anvil/preferences.json`).
 *
 * Layer-0 module: pure primitives for loading, resolving, and persisting
 * per-project artifact preferences. No imports from higher layers.
 *
 * Atomic writes: always write to `<file>.tmp` then `rename`.
 * Zod-validated at the loader boundary.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const PREFERENCES_SCHEMA_VERSION = 1

const FormatEnum = z.enum(['json', 'markdown', 'both'])

const PerKindEntrySchema = z.object({
  location: z.string(),
  format: FormatEnum,
})

const ProjectPreferencesSchema = z.object({
  cwd: z.string(),
  first_seen: z.string(),
  default_location: z.string().optional(),
  default_format: FormatEnum.optional(),
  per_kind: z.record(z.string(), PerKindEntrySchema).optional(),
})

export const PreferencesSchema = z.object({
  version: z.literal(1),
  projects: z.record(z.string(), ProjectPreferencesSchema),
})

export type Preferences = z.infer<typeof PreferencesSchema>

export type ResolvedPrefs = {
  projectName: string
  location: string
  format: 'json' | 'markdown' | 'both'
  source: 'per-kind' | 'default'
}

// ---------------------------------------------------------------------------
// Auto-name derivation
// ---------------------------------------------------------------------------

/**
 * Normalize a git remote URL into a slug suitable for use as a project key.
 * Strips protocol prefixes, trailing `.git`, replaces `/` and `:` with `_`,
 * and lowercases the result.
 */
function normalizeRemoteUrl(url: string): string {
  let s = url.trim()
  // Strip protocol prefixes
  s = s
    .replace(/^git@/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^ssh:\/\//, '')
  // Strip trailing .git
  s = s.replace(/\.git$/, '')
  // Replace / and : with _
  s = s.replace(/[/:]/g, '_')
  // Lowercase
  return s.toLowerCase()
}

/**
 * Derive a stable project name from `cwd`.
 *
 * Strategy:
 * 1. Try `git -C <cwd> remote get-url origin` (1s timeout).
 *    On success, normalize the URL into a slug.
 * 2. Fallback: use the basename of `cwd`.
 * 3. Collision check: if `anvilHome` is provided and the derived name is
 *    already mapped to a *different* cwd, append a 6-char SHA-256 hash of
 *    the full cwd path.
 *
 * @param cwd       Absolute path to the project directory.
 * @param anvilHome Optional path to `~/.anvil/` for collision detection.
 */
export async function deriveProjectName(
  cwd: string,
  anvilHome?: string,
): Promise<string> {
  let name: string

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', cwd, 'remote', 'get-url', 'origin'],
      { timeout: 1000 },
    )
    name = normalizeRemoteUrl(stdout)
  } catch {
    name = basename(cwd)
  }

  // Collision detection
  if (anvilHome) {
    let prefs: Preferences
    try {
      prefs = await loadPreferences(anvilHome)
    } catch {
      prefs = { version: 1, projects: {} }
    }
    const existing = prefs.projects[name]
    if (existing && existing.cwd !== cwd) {
      const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 6)
      name = `${name}-${hash}`
    }
  }

  return name
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and Zod-validate `<anvilHome>/preferences.json`.
 * Returns `{ version: 1, projects: {} }` when the file is absent.
 * Throws with the file path in the message on parse or schema error.
 */
export async function loadPreferences(anvilHome: string): Promise<Preferences> {
  const prefsPath = join(anvilHome, 'preferences.json')
  let raw: string
  try {
    raw = await readFile(prefsPath, 'utf-8')
  } catch {
    // File absent — return empty struct
    return { version: 1, projects: {} }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(
      `[ANV-0199] preferences.json at ${prefsPath} is not valid JSON`,
    )
  }

  const result = PreferencesSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `[ANV-0199] preferences.json at ${prefsPath} failed schema validation: ${result.error.message}`,
    )
  }
  return result.data
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the saved preference for `kind` in the current `cwd`.
 *
 * Resolution order:
 *  1. `per_kind[kind]` — explicit per-kind preference → `source: 'per-kind'`
 *  2. `default_location` + `default_format` — project defaults → `source: 'default'`
 *  3. `null` — no preference saved for this project/kind
 */
export async function resolvePreferenceFor(
  kind: string,
  opts: { cwd: string; anvilHome: string },
): Promise<ResolvedPrefs | null> {
  const { cwd, anvilHome } = opts
  const prefs = await loadPreferences(anvilHome)
  const projectName = await deriveProjectName(cwd, anvilHome)
  const project = prefs.projects[projectName]
  if (!project) return null

  const perKind = project.per_kind?.[kind]
  if (perKind) {
    return {
      projectName,
      location: perKind.location,
      format: perKind.format,
      source: 'per-kind',
    }
  }

  if (project.default_location && project.default_format) {
    return {
      projectName,
      location: project.default_location,
      format: project.default_format,
      source: 'default',
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

/**
 * Atomically persist a per-kind preference for `cwd`.
 *
 * - Loads existing preferences (or starts from empty).
 * - Derives the project name from `cwd`.
 * - Sets `per_kind[kind] = { location, format }`.
 * - Sets `cwd` and `first_seen` if this is the first write for the project.
 * - Writes to `<file>.tmp` then renames to `preferences.json`.
 */
export async function persistPreference(
  kind: string,
  choice: { location: string; format: 'json' | 'markdown' | 'both' },
  opts: { cwd: string; anvilHome: string },
): Promise<void> {
  const { cwd, anvilHome } = opts
  const prefsPath = join(anvilHome, 'preferences.json')
  const tmpPath = `${prefsPath}.tmp`

  // Ensure anvilHome exists
  await mkdir(anvilHome, { recursive: true })

  const prefs = await loadPreferences(anvilHome)
  const projectName = await deriveProjectName(cwd, anvilHome)

  const existing = prefs.projects[projectName]
  if (existing) {
    // Update per-kind, preserve cwd and first_seen
    prefs.projects[projectName] = {
      ...existing,
      per_kind: {
        ...existing.per_kind,
        [kind]: { location: choice.location, format: choice.format },
      },
    }
  } else {
    // New project entry
    prefs.projects[projectName] = {
      cwd,
      first_seen: new Date().toISOString(),
      per_kind: {
        [kind]: { location: choice.location, format: choice.format },
      },
    }
  }

  // Atomic write: tmp then rename
  await writeFile(tmpPath, JSON.stringify(prefs, null, 2), 'utf-8')
  await rename(tmpPath, prefsPath)
}
