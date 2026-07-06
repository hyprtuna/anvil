import chalk from 'chalk'

// ---------------------------------------------------------------------------
// CheckStatus
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

/**
 * Returns a colored glyph representing the check status.
 * ✓ green / ⚠ yellow / ✗ red / – gray (skip)
 * Honors NO_COLOR / FORCE_COLOR via chalk's built-in detection.
 */
export function badge(kind: CheckStatus): string {
  switch (kind) {
    case 'pass':
      return chalk.green('✓')
    case 'warn':
      return chalk.yellow('⚠')
    case 'fail':
      return chalk.red('✗')
    case 'skip':
      return chalk.dim('–')
  }
}

// ---------------------------------------------------------------------------
// printKv
// ---------------------------------------------------------------------------

/**
 * Prints "  label: value" with the label dimmed for visual hierarchy.
 */
export function printKv(label: string, value: string): void {
  console.log(`  ${chalk.dim(`${label}:`)} ${value}`)
}

// ---------------------------------------------------------------------------
// printCheckList
// ---------------------------------------------------------------------------

export interface CheckRow {
  status: CheckStatus
  label: string
  detail?: string
}

/**
 * Prints a list of check rows then a tally line and a one-line exit-code hint.
 * Example output:
 *   ✓  Node.js                     v22.0.0 (require ≥ 20)
 *   ⚠  ~/.anvil/version            missing — run `anvil init`
 *   ✗  CC user wiring              …
 *
 *   3 passed, 1 warning, 0 failed
 *   Exit codes: 0 = all pass/warn  ·  1 = at least one fail
 *
 * @param rows - The rows to display (may be a filtered subset in quiet mode).
 * @param allRows - The full unfiltered row set used for accurate tally counts.
 *                  When omitted, `rows` is used for both display and counts.
 */
export function printCheckList(rows: CheckRow[], allRows?: CheckRow[]): void {
  const countSource = allRows ?? rows

  // Compute label column width for alignment
  const maxLabelLen = rows.reduce((m, r) => Math.max(m, r.label.length), 0)

  for (const row of rows) {
    const b = badge(row.status)
    const paddedLabel = row.label.padEnd(maxLabelLen)
    const detail = row.detail ? `  ${chalk.dim(row.detail)}` : ''
    console.log(`  ${b}  ${paddedLabel}${detail}`)
  }

  // Tally — always computed from the full unfiltered set so counts stay
  // accurate in quiet mode (ANV-0140).
  const passed = countSource.filter((r) => r.status === 'pass').length
  const warnings = countSource.filter((r) => r.status === 'warn').length
  const failed = countSource.filter((r) => r.status === 'fail').length
  const skipped = countSource.filter((r) => r.status === 'skip').length

  console.log('')
  const tallyParts: string[] = [
    chalk.green(`${passed} ok`),
    warnings > 0
      ? chalk.yellow(`${warnings} ${warnings === 1 ? 'warn' : 'warns'}`)
      : chalk.dim('0 warns'),
    failed > 0 ? chalk.red(`${failed} fail`) : chalk.dim('0 fail'),
  ]
  if (skipped > 0) {
    tallyParts.push(chalk.dim(`${skipped} skipped`))
  }
  console.log(`  ${tallyParts.join(' · ')}`)
  console.log(
    chalk.dim('  Exit codes: 0 = all pass/warn  ·  1 = at least one fail'),
  )
}

// ---------------------------------------------------------------------------
// printInstallSummary
// ---------------------------------------------------------------------------

export interface InstallSummary {
  anvilHome: string
  version: string
  filesWritten: string[]
  targets?: Array<{
    id: string
    status: 'wrote' | 'up-to-date' | 'skipped' | 'error'
    detail?: string
  }>
}

/** Known top-level categories; anything else falls into 'other'. */
const CATEGORY_ORDER = [
  'skills',
  'agents',
  'hooks',
  'commands',
  'bin',
  'plugins',
  '.claude-plugin',
] as const

type Category = (typeof CATEGORY_ORDER)[number] | 'other'

function categorize(filePath: string): Category {
  // Handle both relative paths ("skills/a.md") and absolute paths ("/home/user/.anvil/skills/a.md").
  // Scan all segments for the first recognised category name.
  const segments = filePath.split('/')
  for (const seg of segments) {
    for (const cat of CATEGORY_ORDER) {
      if (seg === cat) return cat
    }
  }
  return 'other'
}

/**
 * Prints a rich installation summary:
 *   - counts per category
 *   - per-target status table (if targets provided)
 *   - trailing next-step line
 */
export function printInstallSummary(s: InstallSummary): void {
  console.log('')
  console.log(
    `${chalk.green('✓')} ${chalk.bold('Anvil installed')}  ${chalk.dim(s.version)}`,
  )
  printKv('location', s.anvilHome)

  // Group files by category
  const counts = new Map<Category, number>()
  for (const f of s.filesWritten) {
    const cat = categorize(f)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  if (counts.size > 0) {
    console.log('')
    console.log(chalk.dim('  Files written by category:'))
    const displayOrder: Category[] = [...CATEGORY_ORDER, 'other']
    for (const cat of displayOrder) {
      const n = counts.get(cat)
      if (n !== undefined) {
        console.log(
          `    ${chalk.cyan(cat.padEnd(14))} ${n} file${n === 1 ? '' : 's'}`,
        )
      }
    }
    console.log(chalk.dim(`  Total: ${s.filesWritten.length} file(s)`))
  }

  // Per-target status table
  if (s.targets && s.targets.length > 0) {
    console.log('')
    console.log(chalk.dim('  Targets:'))
    for (const t of s.targets) {
      const sym =
        t.status === 'wrote'
          ? chalk.green('wrote')
          : t.status === 'up-to-date'
            ? chalk.dim('up-to-date')
            : t.status === 'skipped'
              ? chalk.dim('skipped')
              : chalk.red('error')
      const det = t.detail ? `  ${chalk.dim(t.detail)}` : ''
      console.log(`    ${t.id.padEnd(16)} ${sym}${det}`)
    }
  }

  console.log('')
  console.log(chalk.dim('  Next: run `anvil doctor` to verify'))
}

// ---------------------------------------------------------------------------
// printRemovalSummary
// ---------------------------------------------------------------------------

export interface RemovalSummary {
  removed: string[]
}

/**
 * Groups removed paths by their parent directory and prints counts per dir.
 */
export function printRemovalSummary(r: RemovalSummary): void {
  if (r.removed.length === 0) {
    console.log(chalk.dim('  Nothing removed.'))
    return
  }

  // Group by parent dir
  const byDir = new Map<string, string[]>()
  for (const p of r.removed) {
    const parts = p.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    const existing = byDir.get(dir) ?? []
    existing.push(p)
    byDir.set(dir, existing)
  }

  console.log('')
  console.log(`${chalk.red('✗')} ${chalk.bold('Files removed:')}`)
  for (const [dir, files] of byDir) {
    console.log(
      `  ${chalk.dim(`${dir}/`)}  ${files.length} file${files.length === 1 ? '' : 's'}`,
    )
  }
  console.log(chalk.dim(`  Total: ${r.removed.length} removed`))
}
