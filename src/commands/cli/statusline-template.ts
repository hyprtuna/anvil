import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import { getUserHome } from '../../core/io/home.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { CliOptions } from './common/json-mode.js'

const VALID_TEMPLATES = ['simple', 'rich'] as const
type Template = (typeof VALID_TEMPLATES)[number]

export interface StatuslineTemplateOptions extends CliOptions {
  /** The template to set. When absent, the command reads and prints the current template. */
  template?: string
}

/**
 * Plan 34 A5 — `anvil statusline template [<template>]`
 *
 * Read mode (no arg):
 *   Prints the current statusline template resolved from ~/.anvil/models.json,
 *   defaulting to 'rich'. With --json: { template, source }.
 *
 * Write mode (arg ∈ {simple, rich}):
 *   Deep-merges statusline.template into ~/.anvil/models.json, preserving all
 *   other fields. Exits 0 with a confirmation line.
 *
 * Invalid arg: exits 2.
 */
export async function statuslineTemplateCommand(
  opts: StatuslineTemplateOptions = {},
): Promise<void> {
  if (opts.template !== undefined) {
    await writeTemplate(opts.template, opts)
  } else {
    await readTemplate(opts)
  }
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

async function readTemplate(opts: CliOptions): Promise<void> {
  const { template, source } = await resolveTemplate()
  const payload = { template, source }
  if (maybeEmitJson(payload, opts)) return
  process.stdout.write(
    `${chalk.bold('Statusline template:')} ${chalk.cyan(template)} ${chalk.dim(`(source: ${source})`)}\n`,
  )
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

async function writeTemplate(raw: string, opts: CliOptions): Promise<void> {
  if (!isValidTemplate(raw)) {
    process.stderr.write(
      `Invalid template: ${JSON.stringify(raw)}. Valid values: ${VALID_TEMPLATES.join(', ')}\n`,
    )
    process.exit(2)
  }

  const template: Template = raw
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

  // Deep-merge only the statusline.template key; leave every other key untouched.
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
      template,
    },
  }

  if (!existsSync(anvilHome)) {
    await mkdir(anvilHome, { recursive: true })
  }
  await writeFile(modelsPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf-8')

  const payload = { template, source: 'user' as const }
  if (maybeEmitJson(payload, opts)) return
  process.stdout.write(
    `${chalk.green('✓')} Statusline template set to ${chalk.cyan(template)} (written to ${modelsPath})\n`,
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidTemplate(v: string): v is Template {
  return (VALID_TEMPLATES as readonly string[]).includes(v)
}

/**
 * Resolves the current template from ~/.anvil/models.json.
 * Returns { template, source } where source ∈ 'user' | 'default'.
 */
export async function resolveTemplate(): Promise<{
  template: Template
  source: 'user' | 'default'
}> {
  const modelsPath = join(getUserHome(), '.anvil', 'models.json')
  if (!existsSync(modelsPath)) return { template: 'rich', source: 'default' }
  try {
    const raw = await readFile(modelsPath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sl = parsed.statusline
    if (typeof sl === 'object' && sl !== null && !Array.isArray(sl)) {
      const t = (sl as Record<string, unknown>).template
      if (typeof t === 'string' && isValidTemplate(t)) {
        return { template: t, source: 'user' }
      }
    }
  } catch {
    // fall through
  }
  return { template: 'rich', source: 'default' }
}
