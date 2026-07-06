import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import chalk from 'chalk'
import { detectProject } from '../../core/project/detect.js'
import type { ValidationMap } from '../../core/types.js'
import {
  detectValidationCoverage,
  parsePlanMarkdown,
} from '../../core/validation/detect.js'

/**
 * `anvil plan-validate-coverage <plan-file>`
 *
 * 1. Reads the plan markdown and extracts task IDs via parsePlanMarkdown.
 * 2. Detects test runners from the current project context.
 * 3. Calls detectValidationCoverage to produce a ValidationMap.
 * 4. Writes <plan-stem>-validation.json + <plan-stem>-validation.md.
 * 5. Console-warns each uncovered task with chalk yellow.
 */
export async function planValidateCoverageCommand(
  planPath: string,
): Promise<void> {
  const absolutePlanPath = resolve(planPath)

  let markdown: string
  try {
    markdown = await readFile(absolutePlanPath, 'utf-8')
  } catch {
    throw new Error(`plan file not found: ${absolutePlanPath}`)
  }

  const plan = parsePlanMarkdown(markdown)

  if (plan.tasks.length === 0) {
    process.stderr.write(
      chalk.yellow(
        `[warn] No tasks found in ${absolutePlanPath}. Expected headings like "A1.", "B2.", etc.\n`,
      ),
    )
  }

  const project = await detectProject(process.cwd())
  const validationMap = detectValidationCoverage(
    plan,
    project,
    absolutePlanPath,
  )

  // Derive sibling file paths
  const dir = dirname(absolutePlanPath)
  const ext = extname(absolutePlanPath) // e.g. ".md"
  const stem = basename(absolutePlanPath, ext) // e.g. "2026-04-24-30-..."
  const jsonPath = join(dir, `${stem}-validation.json`)
  const mdPath = join(dir, `${stem}-validation.md`)

  // Write JSON
  await writeFile(jsonPath, JSON.stringify(validationMap, null, 2), 'utf-8')

  // Write human-readable markdown table
  const mdContent = buildMarkdownReport(validationMap)
  await writeFile(mdPath, mdContent, 'utf-8')

  // Report to console
  process.stdout.write(
    chalk.bold(`\nValidation coverage for: ${basename(absolutePlanPath)}\n\n`),
  )
  process.stdout.write(
    `  Detected runners : ${validationMap.detected_runners.join(', ') || '(none)'}\n`,
  )
  process.stdout.write(`  Tasks mapped     : ${validationMap.entries.length}\n`)
  process.stdout.write(
    `  Uncovered tasks  : ${validationMap.uncovered_tasks.length}\n\n`,
  )

  if (validationMap.uncovered_tasks.length > 0) {
    process.stderr.write(
      chalk.yellow('Uncovered tasks (no test runner detected):\n'),
    )
    for (const taskId of validationMap.uncovered_tasks) {
      process.stderr.write(chalk.yellow(`  ⚠  ${taskId}\n`))
    }
    process.stderr.write('\n')
  }

  process.stdout.write(chalk.dim(`JSON : ${jsonPath}\n`))
  process.stdout.write(chalk.dim(`MD   : ${mdPath}\n\n`))
}

// ─── Markdown report builder ──────────────────────────────────────────────────

function buildMarkdownReport(map: ValidationMap): string {
  const lines: string[] = []
  lines.push('# Validation Coverage Map')
  lines.push('')
  lines.push(`**Plan:** \`${map.plan_path}\`  `)
  lines.push(`**Generated:** ${map.generated_at}  `)
  lines.push(
    `**Detected runners:** ${map.detected_runners.join(', ') || '(none)'}`,
  )
  lines.push('')

  if (map.entries.length > 0) {
    lines.push('## Covered Tasks')
    lines.push('')
    lines.push('| Task ID | Test Command |')
    lines.push('|---------|--------------|')
    for (const entry of map.entries) {
      lines.push(`| \`${entry.task_id}\` | \`${entry.test_command}\` |`)
    }
    lines.push('')
  }

  if (map.uncovered_tasks.length > 0) {
    lines.push('## Uncovered Tasks')
    lines.push('')
    lines.push(
      '> These tasks have no detected test runner. Add a test runner or run `anvil plan validate-coverage` after setup.',
    )
    lines.push('')
    for (const taskId of map.uncovered_tasks) {
      lines.push(`- \`${taskId}\` — no test command mapped`)
    }
    lines.push('')
  }

  if (map.uncovered_tasks.length === 0 && map.entries.length === 0) {
    lines.push('> No tasks found in this plan.')
    lines.push('')
  }

  return lines.join('\n')
}
