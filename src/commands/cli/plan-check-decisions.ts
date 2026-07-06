import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import chalk from 'chalk'
import type { DecisionCoverageReport } from '../../core/types.js'
import { parseDecisionsBlock } from '../../core/validation/decisions.js'

/**
 * `anvil plan-check-decisions <plan-file> [--strict]`
 *
 * 1. Reads the plan markdown.
 * 2. Extracts the `<decisions>` block (if any).
 * 3. For each decision id, checks whether it appears verbatim anywhere in the
 *    plan body outside the decisions block — that counts as "referenced by at
 *    least one task".
 * 4. Builds a `DecisionCoverageReport` and prints it.
 * 5. With `--strict`, exits with code 1 if any decision id is uncovered.
 *
 * Decision id coverage heuristic: a decision id like "D-001" is considered
 * covered when the id string appears at least once anywhere in the body text
 * that remains after stripping the decisions block.
 */
export async function planCheckDecisionsCommand(
  planPath: string,
  opts: { strict?: boolean },
): Promise<void> {
  const absolutePlanPath = resolve(planPath)

  let markdown: string
  try {
    markdown = await readFile(absolutePlanPath, 'utf-8')
  } catch {
    throw new Error(`plan file not found: ${absolutePlanPath}`)
  }

  const { decisions, bodyWithoutBlock } = parseDecisionsBlock(markdown)

  if (decisions.length === 0) {
    process.stderr.write(
      chalk.yellow(
        `[warn] No <decisions> block found in ${absolutePlanPath}. Zero decisions to check.\n`,
      ),
    )
  }

  // Determine which ids appear at least once in the body text
  const coveredIds: string[] = []
  const uncoveredIds: string[] = []

  for (const decision of decisions) {
    if (bodyWithoutBlock.includes(decision.id)) {
      coveredIds.push(decision.id)
    } else {
      uncoveredIds.push(decision.id)
    }
  }

  const report: DecisionCoverageReport = {
    source_path: absolutePlanPath,
    total: decisions.length,
    covered_ids: coveredIds,
    uncovered_ids: uncoveredIds,
    passed: uncoveredIds.length === 0,
  }

  // ─── Print report ────────────────────────────────────────────────────────

  process.stdout.write(
    chalk.bold(`\nDecision coverage: ${absolutePlanPath}\n\n`),
  )
  process.stdout.write(`  Total decisions  : ${report.total}\n`)
  process.stdout.write(`  Covered          : ${report.covered_ids.length}\n`)
  process.stdout.write(
    `  Uncovered        : ${report.uncovered_ids.length}\n\n`,
  )

  if (report.covered_ids.length > 0) {
    process.stdout.write(chalk.green('Covered decisions:\n'))
    for (const id of report.covered_ids) {
      const dec = decisions.find((d) => d.id === id)
      process.stdout.write(
        chalk.green(`  ✔  ${id}`) + (dec ? `  — ${dec.title}\n` : '\n'),
      )
    }
    process.stdout.write('\n')
  }

  if (report.uncovered_ids.length > 0) {
    process.stderr.write(
      chalk.yellow('Uncovered decisions (not referenced in plan body):\n'),
    )
    for (const id of report.uncovered_ids) {
      const dec = decisions.find((d) => d.id === id)
      process.stderr.write(
        chalk.yellow(`  ⚠  ${id}`) + (dec ? `  — ${dec.title}\n` : '\n'),
      )
    }
    process.stderr.write('\n')
  }

  if (report.passed) {
    process.stdout.write(
      chalk.green('All decisions are referenced in the plan body.\n\n'),
    )
  } else {
    const msg = `${report.uncovered_ids.length} decision(s) are not referenced by any task in the plan body.\n`
    if (opts.strict) {
      process.stderr.write(chalk.red(`[error] ${msg}`))
      process.exit(1)
    } else {
      process.stderr.write(chalk.yellow(`[warn] ${msg}`))
    }
  }
}
