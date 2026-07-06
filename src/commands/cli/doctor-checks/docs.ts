/**
 * ANV-0141 — Docs category doctor checks.
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Keeps `function pushXyzCheck(checks: Check[])` signatures intact.
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatDocDriftSummary,
  runDocDriftLint,
  runProseAiTellLint,
} from '../../../core/docs/lint/index.js'

// Local mirror of the Check interface from doctor.ts (same shape).
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

// v0.10.9 T-001-followup — Doc tests are structural (no value-pinning).
// ---------------------------------------------------------------------------

/**
 * Static check over `tests/unit/docs/*.test.ts`: doc tests must remain
 * structural (assert that a section exists, assert that a fenced block
 * parses, etc.) and never pin a literal count of skills/agents/hooks or a
 * release-version literal. Both rot every release and create silent
 * doc-staleness once the assertion stops matching reality.
 *
 * Two regex pattern families flag offenders:
 *   1. Hardcoded count next to a surface noun:
 *      `/\b\d{2,3}\b\s*(skills?|agents?|hooks?|handlers?|commands?)/i`
 *   2. Version literal:
 *      `/v0\.\d+\.\d+/` — exempted on lines containing "CHANGELOG" so the
 *      legitimate changelog cross-reference can survive. Also exempted for
 *      files whose filename itself contains a version literal (these test
 *      historical release artifacts, e.g. `v0.10.2-content-overlays.md`,
 *      and the version reference is the test's intentional anchor).
 *
 * Status: pass when no offenders found, fail with a detail listing up to
 * 5 offending file:line entries.
 *
 * Exported for unit testing.
 */
export function scanDocTestsForValuePinning(testsDocsRoot: string): {
  status: 'pass' | 'fail'
  offenders: string[]
  filesScanned: number
} {
  const offenders: string[] = []
  let filesScanned = 0
  if (!existsSync(testsDocsRoot)) {
    return { status: 'pass', offenders, filesScanned }
  }
  let entries: string[] = []
  try {
    entries = readdirSync(testsDocsRoot)
  } catch {
    return { status: 'pass', offenders, filesScanned }
  }
  const countPattern =
    /\b\d{2,3}\b\s*(skills?|agents?|hooks?|handlers?|commands?)/i
  const versionPattern = /v0\.\d+\.\d+/
  for (const entry of entries) {
    if (!entry.endsWith('.test.ts')) continue
    const filePath = join(testsDocsRoot, entry)
    let text: string
    try {
      text = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    filesScanned++
    // Files whose name carries a version literal are testing historical
    // release artifacts; the version reference is the intentional anchor.
    const filenameVersionPinned = versionPattern.test(entry)
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (countPattern.test(line)) {
        offenders.push(`tests/unit/docs/${entry}:${i + 1} (count pin)`)
        continue
      }
      if (
        versionPattern.test(line) &&
        !line.includes('CHANGELOG') &&
        !filenameVersionPinned
      ) {
        offenders.push(`tests/unit/docs/${entry}:${i + 1} (version pin)`)
      }
    }
  }
  return {
    status: offenders.length === 0 ? 'pass' : 'fail',
    offenders,
    filesScanned,
  }
}

export function pushDocTestStructuralCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
): void {
  const name = 'doc tests are structural (no value-pinning)'
  const testsDocsRoot = join(cwd, 'tests', 'unit', 'docs')
  if (!inProject || !existsSync(testsDocsRoot)) {
    checks.push({ name, status: 'skip', detail: skipDetail })
    return
  }
  const result = scanDocTestsForValuePinning(testsDocsRoot)
  if (result.status === 'pass') {
    checks.push({
      name,
      status: 'pass',
      detail: `${result.filesScanned} doc test file(s) clean`,
    })
    return
  }
  const preview = result.offenders.slice(0, 5).join(', ')
  const more =
    result.offenders.length > 5 ? ` (+${result.offenders.length - 5} more)` : ''
  checks.push({
    name,
    status: 'fail',
    detail: `${result.offenders.length} value-pin(s): ${preview}${more}`,
  })
}

// ANV-0007 — Doc-drift lint engine.
// ---------------------------------------------------------------------------

/**
 * ANV-0007 — Runs the doc-drift lint engine and pushes a doctor row.
 *
 * Status semantics:
 *   pass  — no violations in scanned docs.
 *   warn  — violations found (non-blocking; the engine is conservative).
 *   skip  — not in a project root (nothing meaningful to scan).
 *
 * The check is always async to allow future I/O expansion, but currently
 * uses only synchronous FS reads under the hood.
 */
export async function pushDocDriftCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
): Promise<void> {
  const name = 'doc drift (links, commands, slugs, template files)'
  if (!inProject) {
    checks.push({ name, status: 'skip', detail: skipDetail })
    return
  }
  const result = runDocDriftLint(cwd)
  const summary = formatDocDriftSummary(result)
  if (result.violations.length === 0) {
    checks.push({ name, status: 'pass', detail: summary })
    return
  }
  // Warn (not fail) — heuristics can produce false positives; operators
  // should inspect and add <!-- doc-drift: skip --> where appropriate.
  checks.push({ name, status: 'warn', detail: summary })
}

// ANV-0279 — Prose AI-tell denylist (standard+ tier only).
// ---------------------------------------------------------------------------

/**
 * ANV-0279 — Runs the prose AI-tell denylist check across skills/, agents/,
 * and docs/ and pushes a doctor row.
 *
 * Tier: standard+ only (not run in the quick / --smoke tier).
 * Severity: warn-only — never fail. High false-positive risk by design.
 *
 * Status semantics:
 *   pass  — no AI-tell terms found in scanned files.
 *   warn  — one or more terms found (non-blocking).
 *   skip  — not in a project root.
 */
export function pushProseAiTellCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
): void {
  const name = 'prose AI-tell denylist (skills, agents, docs)'
  if (!inProject) {
    checks.push({ name, status: 'skip', detail: skipDetail })
    return
  }
  const { violations, filesScanned } = runProseAiTellLint(cwd)
  if (violations.length === 0) {
    checks.push({
      name,
      status: 'pass',
      detail: `${filesScanned} file(s) scanned — no AI-tell terms found`,
    })
    return
  }
  // Surface up to 3 examples so the operator knows where to look.
  const preview = violations
    .slice(0, 3)
    .map((v) => `${v.file}:${v.line}`)
    .join(', ')
  const more = violations.length > 3 ? ` (+${violations.length - 3} more)` : ''
  // Warn only — never fail.
  checks.push({
    name,
    status: 'warn',
    detail: `${filesScanned} file(s) scanned — ${violations.length} AI-tell term(s): ${preview}${more}`,
  })
}
