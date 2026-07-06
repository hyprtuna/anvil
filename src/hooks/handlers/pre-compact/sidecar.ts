/**
 * Pre-compact runtime sidecar — ANV-0126 (Phase C).
 *
 * Pure helpers for building, validating, and locating the
 * `.anvil/runtime/pre-compact-<timestamp>.json` sidecar that captures
 * `active-routing.json` + `active-skill.json` snapshots before context
 * compaction discards them.
 *
 * Sidecar shape (Zod-validated; round-trips through JSON.stringify):
 *
 * {
 *   "version": 1,
 *   "captured_at": "2026-05-15T20:33:00.000Z",
 *   "active_skill":   { ... } | null,
 *   "active_routing": { ... } | null,
 *   "summary":        string | null
 * }
 *
 * The summary slot is reserved for ANV-0xxx work that records "what was
 * being worked on" — for now it stays null.
 *
 * Layer 2 (hook handler peer), pure: no I/O outside Zod validation.
 */

import { z } from 'zod'

/** Schema version — bump when the on-disk shape changes incompatibly. */
export const PRE_COMPACT_SIDECAR_VERSION = 1

/** Default restore window: ignore sidecars older than 1 hour. */
export const DEFAULT_RESTORE_WINDOW_MS = 60 * 60 * 1000

/**
 * Round-trip schema for the sidecar file. All optional inner fields are
 * preserved as-is — the snapshot is opaque to most consumers; the restore
 * digest renders only what is present.
 */
export const PreCompactSidecar = z.object({
  version: z.literal(PRE_COMPACT_SIDECAR_VERSION),
  captured_at: z
    .string()
    .refine(
      (v) => !Number.isNaN(Date.parse(v)),
      'captured_at must be an ISO timestamp',
    ),
  active_skill: z.record(z.string(), z.unknown()).nullable(),
  active_routing: z.record(z.string(), z.unknown()).nullable(),
  summary: z.string().nullable(),
})
export type PreCompactSidecar = z.infer<typeof PreCompactSidecar>

/**
 * Build a sidecar payload from the active-state contents. Either source may
 * be `null` when the file was missing — the schema accepts that.
 */
export function buildSidecar(opts: {
  capturedAt: Date
  activeSkill: Record<string, unknown> | null
  activeRouting: Record<string, unknown> | null
  summary?: string | null
}): PreCompactSidecar {
  return {
    version: PRE_COMPACT_SIDECAR_VERSION,
    captured_at: opts.capturedAt.toISOString(),
    active_skill: opts.activeSkill,
    active_routing: opts.activeRouting,
    summary: opts.summary ?? null,
  }
}

/**
 * Filesystem-safe ISO timestamp (`:` and `.` are illegal on Windows).
 */
export function toFilesafeIso(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

/**
 * Derive the sidecar filename from a `captured_at` timestamp. The "captured
 * at" of the same logical compaction event is used so writer and reader
 * never disagree about which file is the truth-of-record.
 */
export function sidecarFilename(date: Date): string {
  return `pre-compact-${toFilesafeIso(date)}.json`
}

/**
 * Parse + validate a JSON string as a sidecar payload. Returns `null` on
 * any failure (missing fields, wrong types, bad JSON). Callers fall back
 * to "no restore digest" when this returns null.
 */
export function parseSidecar(raw: string): PreCompactSidecar | null {
  try {
    const json = JSON.parse(raw)
    const parsed = PreCompactSidecar.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Clock-skew tolerance (ms) — accepts mtimes slightly ahead of `now`. */
const CLOCK_SKEW_TOLERANCE_MS = 5_000

/**
 * Decide whether a sidecar (identified by its mtime) falls inside the
 * restore window. Pure — no clock reads — so unit tests can pass an
 * explicit `now`.
 *
 * A small tolerance (CLOCK_SKEW_TOLERANCE_MS) is granted for mtimes slightly
 * ahead of `now`: that can happen when the writing process's clock is a hair
 * ahead of the reader's, or when filesystem caching reports nanosecond-
 * precision mtimes that round above the millisecond-precision `Date.now()`.
 */
export function isWithinRestoreWindow(
  sidecarMtimeMs: number,
  nowMs: number,
  windowMs: number = DEFAULT_RESTORE_WINDOW_MS,
): boolean {
  if (!Number.isFinite(sidecarMtimeMs) || sidecarMtimeMs <= 0) return false
  if (!Number.isFinite(windowMs) || windowMs <= 0) return false
  const age = nowMs - sidecarMtimeMs
  return age >= -CLOCK_SKEW_TOLERANCE_MS && age <= windowMs
}

/**
 * Render the SessionStart restore digest body. Pure — accepts a parsed
 * sidecar and returns the user/model-visible text wrapped in a
 * `<session-restore>` envelope.
 *
 * The body intentionally compresses heavily: the goal is to remind the
 * model what it was working on, not to replay the entire previous state.
 */
export function renderRestoreDigest(sidecar: PreCompactSidecar): string {
  const lines: string[] = []
  lines.push('<session-restore>')
  lines.push(`Captured: ${sidecar.captured_at}`)
  if (sidecar.active_skill) {
    const name = readStringField(sidecar.active_skill, 'name')
    const intent = readStringField(sidecar.active_skill, 'intent')
    const scope = readStringField(sidecar.active_skill, 'scope')
    const parts = [
      name ? `name=${name}` : null,
      intent ? `intent=${intent}` : null,
      scope ? `scope=${scope}` : null,
    ].filter((p): p is string => p !== null)
    if (parts.length > 0) {
      lines.push(`active_skill: ${parts.join(', ')}`)
    }
  }
  if (sidecar.active_routing) {
    const directive = readStringField(sidecar.active_routing, 'systemInsert')
    if (directive) {
      // Keep the directive compact — single line.
      const compact = directive.replace(/\s+/g, ' ').trim()
      lines.push(`active_routing: ${compact}`)
    }
  }
  if (sidecar.summary && sidecar.summary.trim().length > 0) {
    lines.push(`summary: ${sidecar.summary.trim()}`)
  }
  lines.push('</session-restore>')
  return lines.join('\n')
}

function readStringField(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const v = obj[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}
