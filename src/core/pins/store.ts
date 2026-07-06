import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { z } from 'zod'

/**
 * Default per-user cap on the number of pinned skills.
 *
 * ANV-0090 — Per impeccable §6, capping is critical to avoid menu pollution.
 * The slash menu has a hard ≤15 user-invocable budget; the Pinned section
 * sits inside that budget, so a small default (5) keeps the menu legible.
 */
export const DEFAULT_PIN_CAP = 5

/**
 * On-disk shape of `~/.anvil/pins.json`. Object-wrapped (rather than a bare
 * array) so future fields (e.g. per-project pins, ordering hints) can be
 * added without a migration.
 */
export const PinsFile = z.object({
  pins: z.array(z.string().min(1)),
})
export type PinsFile = z.infer<typeof PinsFile>

export interface PinsStoreOptions {
  /** Override `homedir()` — primarily for tests using `tmpdir()`. */
  home?: string
  /** Override the default cap (5). */
  cap?: number
}

/**
 * Resolve the effective home directory. Prefers `$HOME` (re-read each call
 * so tests overriding it via `process.env.HOME = …` take effect) and falls
 * back to `homedir()`. Node caches `os.homedir()` after the first call, so
 * we cannot rely on it alone for test-friendly behaviour.
 */
function effectiveHome(override?: string): string {
  if (override !== undefined) return override
  const envHome = process.env.HOME
  if (envHome !== undefined && envHome.length > 0) return envHome
  return homedir()
}

/** Absolute path to the pins file for the given home directory. */
export function pinsPath(home: string = effectiveHome()): string {
  return join(home, '.anvil', 'pins.json')
}

/**
 * Load pinned slugs. Returns `[]` when `pins.json` is missing.
 * Throws when the file exists but doesn't parse against {@link PinsFile}.
 */
export async function loadPins(opts: PinsStoreOptions = {}): Promise<string[]> {
  const home = effectiveHome(opts.home)
  const path = pinsPath(home)
  if (!existsSync(path)) return []
  const raw = await readFile(path, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${(err as Error).message}`)
  }
  const validated = PinsFile.parse(parsed)
  return validated.pins
}

/**
 * Persist the given slugs as the new pin list (canonical
 * `{ pins: string[] }` shape). Creates the `~/.anvil/` directory if needed.
 */
export async function savePins(
  pins: string[],
  opts: PinsStoreOptions = {},
): Promise<void> {
  const home = effectiveHome(opts.home)
  const path = pinsPath(home)
  await mkdir(dirname(path), { recursive: true })
  const payload: PinsFile = { pins }
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

/**
 * Add a slug to the pin list. Idempotent — pinning an already-pinned slug is
 * a no-op. Throws when adding would exceed the cap (default 5).
 */
export async function addPin(
  slug: string,
  opts: PinsStoreOptions = {},
): Promise<void> {
  const cap = opts.cap ?? DEFAULT_PIN_CAP
  const pins = await loadPins(opts)
  if (pins.includes(slug)) return
  if (pins.length >= cap) {
    throw new Error(
      `Cannot pin "${slug}": pin cap reached (${pins.length}/${cap}). Unpin a skill first with \`anvil skill unpin <slug>\`.`,
    )
  }
  await savePins([...pins, slug], opts)
}

/**
 * Remove a slug from the pin list. No-op when the slug is not pinned.
 */
export async function removePin(
  slug: string,
  opts: PinsStoreOptions = {},
): Promise<void> {
  const pins = await loadPins(opts)
  if (!pins.includes(slug)) return
  await savePins(
    pins.filter((p) => p !== slug),
    opts,
  )
}
