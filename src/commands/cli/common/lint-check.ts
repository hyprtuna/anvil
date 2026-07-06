/**
 * ANV-0184 — Shared types for the anvil skill|agent|hook lint commands.
 *
 * `LintCheckResult` is the per-check row emitted by each lint command.
 * Shape mirrors `DoctorCheckRow` (same `name`/`status`/`detail`) so
 * existing push-helper adapters can forward their results without conversion.
 */

export type LintCheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface LintCheckResult {
  /** Stable check identifier — also used as display label. */
  name: string
  status: LintCheckStatus
  detail: string
}
