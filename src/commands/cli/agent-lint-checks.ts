/**
 * ANV-0184 — Agent lint checks.
 *
 * Runs the 4 user-meaningful agent checks that were migrated from
 * `anvil doctor` to `anvil agent lint`.
 *
 * The 4 agent-targeted checks:
 *   1. Required reading budget
 *   2. Required reading paths resolve
 *   3. Agent + hook safety annotations
 *   4. Agent permission taxonomy
 */

import type { LintCheckResult } from './common/lint-check.js'

type CheckBuf = {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

function toResult(c: CheckBuf): LintCheckResult {
  return { name: c.name, status: c.status, detail: c.detail }
}

const SKIP = 'no agents directory found — skipped'

/**
 * Run all agent-targeted lint checks against a given agents root directory.
 *
 * @param root - Path to the agents directory to lint (e.g. ~/.anvil/agents)
 * @param cwd  - Project working directory (used for resolving required_reading paths)
 */
export async function runAgentLintChecks(
  root: string,
  cwd: string,
): Promise<LintCheckResult[]> {
  const results: LintCheckResult[] = []

  // ── 1. Required reading budget ────────────────────────────────────────────
  {
    const { pushRequiredReadingBudgetCheck } = await import(
      './doctor-checks/skill-checks.js'
    )
    const buf: CheckBuf[] = []
    pushRequiredReadingBudgetCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 2. Required reading paths resolve ─────────────────────────────────────
  {
    const { pushRequiredReadingPathsResolveCheck } = await import(
      './doctor-checks/skill-checks.js'
    )
    const buf: CheckBuf[] = []
    pushRequiredReadingPathsResolveCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 3. Agent + hook safety annotations ───────────────────────────────────
  {
    const { pushAgentSafetyAnnotationsCheck } = await import(
      './doctor-checks/capability.js'
    )
    const buf: CheckBuf[] = []
    await pushAgentSafetyAnnotationsCheck(buf, root)
    results.push(...buf.map(toResult))
  }

  // ── 4. Agent permission taxonomy ─────────────────────────────────────────
  {
    const { runAgentPermissionCheckForRoot } = await import(
      './doctor-checks/agent-permission.js'
    )
    const rows = await runAgentPermissionCheckForRoot(root)
    results.push(...rows.map(toResult))
  }

  return results
}
