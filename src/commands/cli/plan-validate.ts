/**
 * `anvil plan validate <plan-path>` (ANV-0026)
 *
 * Reads a plan markdown file, extracts the `executable_plan:` frontmatter
 * block, and validates it against the ExecutablePlan Zod schema.
 *
 * Output:
 *   - On success: prints `OK ${path} — ${N} tasks in ${W} waves` and exits 0.
 *   - On failure: prints the failure reason + the Zod issues and exits 1.
 *   - With `--json`: emits a single-line JSON envelope to stdout (success
 *     or failure shape mirrors the ParseResult union).
 *
 * This command does NOT execute the plan's verification commands. It only
 * checks the contract shape. Execution is ANV-0025's job.
 */

import { resolve } from 'node:path'
import chalk from 'chalk'
import { parseExecutablePlanFromFile } from '../../core/plans/parse.js'

interface JsonResult {
  ok: boolean
  path: string
  reason?: string
  message?: string
  issues?: Array<{ path: string; message: string }>
  tasks?: number
  waves?: number
}

export async function planValidateCommand(
  planPath: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  const absolutePath = resolve(planPath)
  const result = await parseExecutablePlanFromFile(absolutePath)
  const json = opts.json === true

  if (result.ok) {
    const payload: JsonResult = {
      ok: true,
      path: absolutePath,
      tasks: result.plan.tasks.length,
      waves: result.plan.waves.length,
    }
    if (json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`)
    } else {
      process.stdout.write(
        chalk.green(
          `OK ${absolutePath} — ${result.plan.tasks.length} task(s) in ${result.plan.waves.length} wave(s)\n`,
        ),
      )
    }
    return
  }

  // Failure path — assemble structured + human output.
  const payload: JsonResult = {
    ok: false,
    path: absolutePath,
    reason: result.reason,
    message: result.message,
  }
  if (result.reason === 'schema-invalid') {
    payload.issues = result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
      message: issue.message,
    }))
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } else {
    process.stderr.write(chalk.red(`FAIL ${absolutePath}\n`))
    process.stderr.write(`  reason: ${result.reason}\n`)
    process.stderr.write(`${indent(result.message, '  ')}\n`)
  }

  process.exit(1)
}

function indent(s: string, prefix: string): string {
  return s
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n')
}
