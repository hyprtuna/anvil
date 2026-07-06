/**
 * ANV-0037 — Availability validation for skill-declared MCP servers.
 *
 * Pure where possible: for stdio refs we check `command` exists on PATH via
 * `which`-style probe (mockable through {@link ValidateOptions.whichCheck}).
 * For transport refs we accept any declared URL as "declared-ok"; deeper
 * reachability checks are deferred (declare-only release).
 */
import { spawn } from 'node:child_process'
import type { SkillMcpServerRef } from '../../core/types.js'

export type AvailabilityStatus = 'pass' | 'warn' | 'fail'

export interface AvailabilityResult {
  name: string
  status: AvailabilityStatus
  detail: string
}

export interface ValidationReport {
  overall: AvailabilityStatus
  results: AvailabilityResult[]
}

export interface ValidateOptions {
  /** Mockable PATH probe. Resolves to true when the command is found. */
  whichCheck?: (command: string) => Promise<boolean>
}

/**
 * Cross-platform "command exists on PATH?" probe. Uses `command -v` under a
 * POSIX shell on linux/macos. Returns false on any failure.
 */
async function defaultWhichCheck(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', `command -v ${command}`], {
      stdio: 'ignore',
    })
    child.on('exit', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/**
 * Validate availability of every declared MCP ref.
 *
 * Status rules per ref:
 *   - stdio `command` on PATH         → pass
 *   - stdio `command` missing         → warn (declare-only: not a hard fail)
 *   - transport with `url`            → pass (URL declared; deeper probe deferred)
 *   - transport without `url`         → warn
 *
 * Aggregate `overall`:
 *   - any fail → fail
 *   - else any warn → warn
 *   - else → pass
 */
export async function validateAvailability(
  refs: SkillMcpServerRef[],
  opts: ValidateOptions = {},
): Promise<ValidationReport> {
  const which = opts.whichCheck ?? defaultWhichCheck
  const results: AvailabilityResult[] = []
  for (const ref of refs) {
    if ('command' in ref) {
      const ok = await which(ref.command)
      results.push({
        name: ref.name,
        status: ok ? 'pass' : 'warn',
        detail: ok
          ? `command on PATH: ${ref.command}`
          : `command not found on PATH: ${ref.command}`,
      })
    } else {
      const declared = typeof ref.url === 'string' && ref.url.length > 0
      results.push({
        name: ref.name,
        status: declared ? 'pass' : 'warn',
        detail: declared
          ? `transport=${ref.transport} url declared`
          : `transport=${ref.transport} missing url`,
      })
    }
  }
  let overall: AvailabilityStatus = 'pass'
  for (const r of results) {
    if (r.status === 'fail') {
      overall = 'fail'
      break
    }
    if (r.status === 'warn') overall = 'warn'
  }
  return { overall, results }
}
