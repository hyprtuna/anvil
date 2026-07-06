/**
 * Shared statusline helpers — Plan 34 A2.
 *
 * Used by both the simple renderer (render.ts) and the rich
 * truecolor renderer (render-rich.ts). Keeping them here avoids
 * circular imports and duplication.
 */

/**
 * Git repository information aggregated outside the renderer.
 * Populated by the statusline command (layer 4) and passed via
 * RenderOptions so the renderer stays pure (no node:child_process).
 */
export interface GitInfo {
  /** Repository root directory name (e.g. "anvil"). Empty string when not in a git repo. */
  repoName: string
  /** Current branch name or short SHA. Empty string when unavailable. */
  branch: string
  /** Lines added relative to HEAD (from git diff --shortstat HEAD). */
  added: number
  /** Lines removed relative to HEAD. */
  removed: number
}

const ESC = '\x1b'
export const RESET = `${ESC}[0m`
export const DIM = `${ESC}[2m`

/** Build a truecolor RGB foreground escape sequence. */
export function rgbFg(r: number, g: number, b: number): string {
  return `${ESC}[38;2;${r};${g};${b}m`
}

/**
 * Linearly interpolate between two RGB colours at t ∈ [0,1].
 * Mirrors `lerp_rgb` in the bash reference (lines 17-24).
 */
export function lerpRgb(
  t: number,
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): string {
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return rgbFg(r, g, b)
}

/**
 * Returns a truecolor escape for a percentage value using the
 * green→yellow→red gradient from the bash reference (lines 27-40).
 *
 * 0–50  %: green(0,200,80)   → yellow(220,200,0)
 * 50–100%: yellow(220,200,0) → red(220,40,20)
 */
export function pctRgb(pct: number): string {
  const p = Math.max(0, Math.min(100, pct))
  if (p <= 50) {
    const t = p / 50
    return lerpRgb(t, 0, 200, 80, 220, 200, 0)
  }
  const t = Math.min(1, (p - 50) / 50)
  return lerpRgb(t, 220, 200, 0, 220, 40, 20)
}

const OSC8_TERM_ALLOWLIST = new Set([
  'iTerm.app',
  'WezTerm',
  'kitty',
  'ghostty',
])

/**
 * Strips control characters (ESC, BEL, and C0/C1 controls) from a string.
 * Returns the sanitised string.
 */
export function stripControls(s: string): string {
  // Remove ESC (\x1b), BEL (\x07), and all other C0 controls (\x00-\x1f)
  // plus DEL (\x7f) and C1 controls (\x80-\x9f).
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control chars for sanitisation
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, '')
}

/**
 * Sanitise a label and URL for safe use in an OSC 8 hyperlink.
 *
 * - Strips ESC (`\x1b`), BEL (`\x07`), and all C0/C1 control characters
 *   from both label and url.
 * - URL-encodes the URL via `encodeURI` (preserves valid URL structure while
 *   encoding unsafe characters).
 * - Returns `null` when either field is empty after sanitisation.
 */
export function sanitiseOsc8(
  label: string,
  url: string,
): { label: string; url: string } | null {
  const cleanLabel = stripControls(label)
  const cleanUrl = stripControls(url)
  if (!cleanLabel || !cleanUrl) return null
  return { label: cleanLabel, url: encodeURI(cleanUrl) }
}

/**
 * Wrap text in an OSC 8 hyperlink iff the terminal is allowlisted AND
 * `enabled` is true. Otherwise returns the raw text. Per D-08, Apple
 * Terminal is explicitly excluded.
 *
 * The `url` is sanitised via `sanitiseOsc8` (control chars stripped,
 * then URL-encoded) before emission. The `text` display string is emitted
 * as-is — callers are responsible for ensuring it does not contain raw
 * control characters (use `sanitiseOsc8` or strip controls at the call site).
 * If the url is empty after sanitisation, `text` is returned unchanged.
 */
export function link(
  text: string,
  url: string,
  enabled: boolean,
  termProgram: string | undefined,
): string {
  if (!enabled) return text
  if (!termProgram || !OSC8_TERM_ALLOWLIST.has(termProgram)) return text
  // Sanitise the URL only; the display text may contain intentional ANSI escapes.
  const cleanUrl = stripControls(url)
  if (!cleanUrl) return text
  const encodedUrl = encodeURI(cleanUrl)
  const ESC = '\x1b'
  return `${ESC}]8;;${encodedUrl}${ESC}\\${text}${ESC}]8;;${ESC}\\`
}

/**
 * Format a Unix-epoch reset time relative to now (seconds).
 * Mirrors `format_reset_time` in the bash reference (lines 52-63).
 */
export function formatResetTime(
  epoch: number,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const diff = epoch - nowSec
  if (diff <= 0) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    return `${h}h${m}m`
  }
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  return `${d}d${h}h`
}
