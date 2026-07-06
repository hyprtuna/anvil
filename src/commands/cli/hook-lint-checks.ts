/**
 * ANV-0184 — Hook lint checks.
 *
 * Runs the 3 user-meaningful hook checks that were migrated from
 * `anvil doctor` to `anvil hook lint`.
 *
 * The 3 hook-targeted checks:
 *   1. Hook exit-code contract
 *   2. Hook handler size
 *   3. templates/embedded-prose-lint (applied to skills that use template markers)
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

const SKIP = 'no hooks directory found — skipped'

/**
 * Run all hook-targeted lint checks against a given hooks root directory.
 *
 * @param root - Path to the hooks directory to lint (e.g. ~/.anvil/hooks)
 * @param cwd  - Project working directory
 */
export async function runHookLintChecks(
  root: string,
  cwd: string,
): Promise<LintCheckResult[]> {
  const results: LintCheckResult[] = []

  // ── 1. Hook exit-code contract ────────────────────────────────────────────
  // This is a pure logic check (no path needed); it verifies HookExit constants.
  {
    const { pushHookExitCodeCheck } = await import('./doctor-checks/hooks.js')
    const buf: CheckBuf[] = []
    pushHookExitCodeCheck(buf)
    results.push(...buf.map(toResult))
  }

  // ── 2. Hook handler size ──────────────────────────────────────────────────
  // For user hooks, the "handlers" directory IS the hooks root itself.
  {
    const { pushHookHandlerSizeCheck } = await import(
      './doctor-checks/hooks.js'
    )
    const buf: CheckBuf[] = []
    pushHookHandlerSizeCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 3. templates/embedded-prose-lint ─────────────────────────────────────
  // This check scans skills/ for embedded template markers. When run from hook
  // lint, we look for a sibling skills/ directory next to the hooks/ root.
  // If none exists, the check will skip gracefully.
  {
    const { join, dirname } = await import('node:path')
    const { pushTemplateEmbeddedLintCheck } = await import(
      './doctor-checks/templates.js'
    )
    // Derive a sibling skills/ directory from the hooks root parent
    const parentDir = dirname(root)
    const siblingSklllsRoot = join(parentDir, 'skills')
    const buf: CheckBuf[] = []
    pushTemplateEmbeddedLintCheck(buf, cwd, siblingSklllsRoot)
    results.push(...buf.map(toResult))
  }

  return results
}
