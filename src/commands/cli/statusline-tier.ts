import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import { getUserHome } from '../../core/io/home.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { CliOptions } from './common/json-mode.js'

const VALID_TIERS = ['minimal', 'default', 'maximal'] as const
type Tier = (typeof VALID_TIERS)[number]

export interface StatuslineTierOptions extends CliOptions {
  /** The tier to set. When absent, the command reads and prints the current tier. */
  tier?: string
}

/**
 * Plan 32 A4 — `anvil statusline tier [<tier>]`
 *
 * Read mode (no arg):
 *   Prints the current statusline tier resolved from ~/.anvil/models.json,
 *   defaulting to 'default'. With --json: { tier, source }.
 *
 * Write mode (arg ∈ {minimal, default, maximal}):
 *   Deep-merges statusline.tier into ~/.anvil/models.json, preserving all
 *   other fields. Exits 0 with a confirmation line.
 *
 * Invalid arg: exits 2.
 */
export async function statuslineTierCommand(
  opts: StatuslineTierOptions = {},
): Promise<void> {
  if (opts.tier !== undefined) {
    await writeTier(opts.tier, opts)
  } else {
    await readTier(opts)
  }
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

async function readTier(opts: CliOptions): Promise<void> {
  const { tier, source } = await resolveTier()
  const payload = { tier, source }
  if (maybeEmitJson(payload, opts)) return
  process.stdout.write(
    `${chalk.bold('Statusline tier:')} ${chalk.cyan(tier)} ${chalk.dim(`(source: ${source})`)}\n`,
  )
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

async function writeTier(raw: string, opts: CliOptions): Promise<void> {
  if (!isValidTier(raw)) {
    process.stderr.write(
      `Invalid tier: ${JSON.stringify(raw)}. Valid values: ${VALID_TIERS.join(', ')}\n`,
    )
    process.exit(2)
  }

  const tier: Tier = raw
  const anvilHome = join(getUserHome(), '.anvil')
  const modelsPath = join(anvilHome, 'models.json')

  // Load existing JSON verbatim (preserves unknown keys) or start fresh.
  let existing: Record<string, unknown> = {}
  if (existsSync(modelsPath)) {
    try {
      const rawFile = await readFile(modelsPath, 'utf-8')
      const parsed = JSON.parse(rawFile) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        existing = parsed as Record<string, unknown>
      }
    } catch {
      // Corrupt file — start fresh rather than fail.
    }
  }

  // Deep-merge only the statusline.tier key; leave every other key untouched.
  const existingSl =
    typeof existing.statusline === 'object' &&
    existing.statusline !== null &&
    !Array.isArray(existing.statusline)
      ? (existing.statusline as Record<string, unknown>)
      : {}

  const updated: Record<string, unknown> = {
    ...existing,
    statusline: {
      ...existingSl,
      tier,
    },
  }

  if (!existsSync(anvilHome)) {
    await mkdir(anvilHome, { recursive: true })
  }
  await writeFile(modelsPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf-8')

  const payload = { tier, source: 'user' as const }
  if (maybeEmitJson(payload, opts)) return
  process.stdout.write(
    `${chalk.green('✓')} Statusline tier set to ${chalk.cyan(tier)} (written to ${modelsPath})\n`,
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidTier(v: string): v is Tier {
  return (VALID_TIERS as readonly string[]).includes(v)
}

/**
 * Resolves the current tier from ~/.anvil/models.json.
 * Returns { tier, source } where source ∈ 'user' | 'default'.
 */
export async function resolveTier(): Promise<{
  tier: Tier
  source: 'user' | 'default'
}> {
  const modelsPath = join(getUserHome(), '.anvil', 'models.json')
  if (!existsSync(modelsPath)) return { tier: 'default', source: 'default' }
  try {
    const raw = await readFile(modelsPath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sl = parsed.statusline
    if (typeof sl === 'object' && sl !== null && !Array.isArray(sl)) {
      const t = (sl as Record<string, unknown>).tier
      if (typeof t === 'string' && isValidTier(t)) {
        return { tier: t, source: 'user' }
      }
    }
  } catch {
    // fall through
  }
  return { tier: 'default', source: 'default' }
}
