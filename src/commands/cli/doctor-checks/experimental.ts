/**
 * ANV-0245 — Doctor row "Experimental features".
 *
 * Exports:
 *   - `buildExperimentalDoctorRows` — pure builder, no I/O, fully testable.
 *   - `pushExperimentalChecks`      — thin wrapper; calls builder, pushes rows.
 *
 * Layer 4 (commands/cli/doctor-checks/). Imports only from layer 0 (core/).
 *
 * Pure builder MUST NOT call fs, path, os, or any I/O API.
 */

import { listExperimentalFeatures } from '../../../core/experimental-registry.js'

// ─── Local Check interface (mirrors doctor.ts) ────────────────────────────────

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

// ─── Pure builder ─────────────────────────────────────────────────────────────

/**
 * Build one doctor row per experimental feature in the registry.
 *
 * Row format:
 *   name:   "Experimental: <id> (<title>)"
 *   status: 'warn' for inflight/paused, 'pass' for graduating
 *   detail: "<progress>% — <status> — owner: <ownerTicket>[, target: <graduationTarget>]"
 *
 * Pure — no I/O. Safe to call in any context.
 */
export function buildExperimentalDoctorRows(): Check[] {
  const features = listExperimentalFeatures()
  return features.map((f) => {
    const status: Check['status'] = f.status === 'graduating' ? 'pass' : 'warn'
    let detail = `${f.progress}% — ${f.status} — owner: ${f.ownerTicket}`
    if (f.graduationTarget !== undefined) {
      detail += `, target: ${f.graduationTarget}`
    }
    if (f.followups !== undefined && f.followups.length > 0) {
      detail += `; follow-ups: ${f.followups.join(', ')}`
    }
    return {
      name: `Experimental: ${f.id} (${f.title})`,
      status,
      detail,
    }
  })
}

// ─── I/O wrapper ─────────────────────────────────────────────────────────────

/**
 * Push experimental feature rows into the given checks array.
 *
 * Thin wrapper around `buildExperimentalDoctorRows()` for use in the main
 * `doctorCommand` flow.
 */
export function pushExperimentalChecks(checks: Check[]): void {
  const rows = buildExperimentalDoctorRows()
  for (const row of rows) {
    checks.push(row)
  }
}
