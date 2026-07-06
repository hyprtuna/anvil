/**
 * Rich (truecolor RGB-gradient) statusline renderer — Plan 34 A2.
 *
 * Ports `tests/fixtures/statusline-bash-reference.sh` to TypeScript.
 * Produces byte-identical output (after ANSI normalisation) for all
 * canonical fixtures tested by `tests/integration/statusline-bash-parity.test.ts`.
 *
 * Output format (segments present only when data is available):
 *   repo | 🌿 (branch) | <20-block bar> <emoji> <ctx%> | 7d:<pct>(<reset>) | 5h:<pct>(<reset>) | +N -M | 🤖 <model> · <effort>
 *
 * ANV-0062: This renderer is pure — no I/O, no child_process. All git data
 * arrives via opts.gitInfo, populated by the statusline command (layer 4).
 */

import type { RenderOptions } from './render.js'
import type { StatuslineInputT } from './schema.js'
import {
  DIM,
  RESET,
  formatResetTime,
  link,
  pctRgb,
  rgbFg,
  sanitiseOsc8,
} from './shared.js'

// ── Colour anchors (mirroring bash reference lines 94-100) ───────────────────
const BOLD = '\x1b[1m'
const BOLD_YELLOW = rgbFg(230, 200, 50)
const BOLD_CYAN = rgbFg(80, 220, 230)
const MAGENTA = rgbFg(220, 100, 220)
const GREEN_DELTA = rgbFg(0, 200, 80)
const RED_DELTA = rgbFg(220, 40, 20)
const EMPTY_BLOCK_COLOR = rgbFg(60, 60, 60)
const RED_BOLD = '\x1b[1m\x1b[31m'
const BLUE = rgbFg(100, 180, 255)

const SEP = `${rgbFg(120, 120, 120)}|${RESET}`

/** Join non-empty segments with ` | ` separator. */
function sep(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(` ${SEP} `)
}

/**
 * Emoji that scales with context usage (bash reference lines 43-50).
 * <20% → 🟢, 20–69% → ⚡, 70–89% → 🔥, ≥90% → 🚨
 */
function ctxEmoji(pct: number): string {
  if (pct >= 90) return '🚨'
  if (pct >= 70) return '🔥'
  if (pct >= 20) return '⚡'
  return '🟢'
}

/**
 * Build the 20-block gradient context bar.
 * Each filled block is coloured by its position along the bar (0..100).
 * Empty blocks are gray (60,60,60). Mirrors bash lines 115-143.
 */
function buildContextBar(ctxPct: number): string {
  const BAR_TOTAL = 20
  const ctxInt = Math.min(100, Math.round(ctxPct))
  const barFilled = Math.min(BAR_TOTAL, Math.floor((ctxInt * BAR_TOTAL) / 100))

  let bar = ''
  for (let i = 1; i <= barFilled; i++) {
    // Color each block by its position along the bar (0..100).
    // bash: block_pct=$(( (i - 1) * 100 / (bar_total - 1) ))
    const blockPct = Math.floor(((i - 1) * 100) / (BAR_TOTAL - 1))
    bar += `${pctRgb(blockPct)}█`
  }

  const empty = BAR_TOTAL - barFilled
  if (empty > 0) {
    bar += EMPTY_BLOCK_COLOR
    bar += '░'.repeat(empty)
  }

  bar += RESET
  return bar
}

/**
 * Main rich renderer — mirrors the bash reference end-to-end.
 *
 * @param input  - Parsed CC statusline JSON.
 * @param opts   - Render options (branch, dirty, active_skill etc.).
 *                 When `opts.branch` is supplied it overrides the git lookup
 *                 (used by tests and the simple-render path).
 * @param _nowSec - Seconds since epoch (injectable for tests). Defaults to now.
 */
export function renderRich(
  input: StatuslineInputT,
  opts: RenderOptions = {},
  _nowSec?: number,
): string {
  const parts: string[] = []
  const linksEnabled = opts.links ?? false
  const termProgram = opts.termProgram

  // ── Git info ───────────────────────────────────────────────────────────────
  // Use opts.gitInfo when supplied (populated by the statusline command layer).
  // Fall back to opts.branch for test compatibility (tests that inject a branch
  // directly without going through the aggregator).
  const gitInfo = opts.gitInfo
  let repoName = gitInfo?.repoName ?? ''
  const branch = opts.branch ?? gitInfo?.branch ?? ''
  // If opts.branch overrides gitInfo.branch, repoName from gitInfo is still valid.
  if (!repoName && gitInfo?.repoName) repoName = gitInfo.repoName

  // ── vim.mode — shown when present ─────────────────────────────────────────
  if (input.vim?.mode) {
    parts.push(`${DIM}[${input.vim.mode}]${RESET}`)
  }

  // ── Repo ──────────────────────────────────────────────────────────────────
  if (repoName) {
    parts.push(`${BOLD}${BOLD_YELLOW}${repoName}${RESET}`)
  }

  // ── 🌿 Branch ─────────────────────────────────────────────────────────────
  if (branch) {
    parts.push(`${BOLD}${BOLD_CYAN}🌿 (${branch})${RESET}`)
  }

  // ── Worktree annotation — shown when branch differs from original_branch ──
  if (
    input.worktree?.name &&
    input.worktree.branch &&
    input.worktree.original_branch &&
    input.worktree.branch !== input.worktree.original_branch
  ) {
    parts.push(
      `${BOLD_CYAN}🌳 ${input.worktree.name} (${input.worktree.branch})${RESET}`,
    )
  }

  // ── 20-block context bar ───────────────────────────────────────────────────
  const ctxUsed = input.context_window?.used_percentage
  if (ctxUsed != null) {
    const ctxInt = Math.min(100, Math.round(ctxUsed))
    const bar = buildContextBar(ctxInt)
    const emoji = ctxEmoji(ctxInt)
    const pctCol = pctRgb(ctxInt)
    parts.push(`${bar} ${emoji} ${pctCol}${ctxInt}%${RESET}`)
  }

  // ── cache_read_input_tokens — shown when >= 1k ─────────────────────────────
  const cacheRead = input.context_window?.current_usage?.cache_read_input_tokens
  if (cacheRead != null && cacheRead >= 1000) {
    const cacheK = Math.floor(cacheRead / 1000)
    parts.push(`${DIM}cached:${cacheK}k${RESET}`)
  }

  // ── 7d weekly usage ────────────────────────────────────────────────────────
  const week = input.rate_limits?.seven_day
  if (week) {
    const weekInt = Math.min(100, Math.round(week.used_percentage))
    const weekCol = pctRgb(weekInt)
    const weekTime = formatResetTime(week.resets_at, _nowSec)
    let seg = `${DIM}7d:${RESET}${weekCol}${weekInt}%${RESET}`
    if (weekTime) seg += `${DIM}(${weekTime})${RESET}`
    parts.push(seg)
  }

  // ── 5h usage ──────────────────────────────────────────────────────────────
  const fiveH = input.rate_limits?.five_hour
  if (fiveH) {
    const fiveInt = Math.min(100, Math.round(fiveH.used_percentage))
    const fiveCol = pctRgb(fiveInt)
    const fiveTime = formatResetTime(fiveH.resets_at, _nowSec)
    let seg = `${DIM}5h:${RESET}${fiveCol}${fiveInt}%${RESET}`
    if (fiveTime) seg += `${DIM}(${fiveTime})${RESET}`
    parts.push(seg)
  }

  // ── duration — shown when >= 60s ──────────────────────────────────────────
  const durationMs = input.cost?.total_duration_ms
  if (durationMs != null && durationMs >= 60_000) {
    const totalMin = Math.floor(durationMs / 60_000)
    const hours = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    const durStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`
    parts.push(`${DIM}⏱${durStr}${RESET}`)
  }

  // ── Code velocity ──────────────────────────────────────────────────────────
  // Velocity data comes from opts.gitInfo (aggregated in the command layer).
  const velAdded = gitInfo?.added ?? 0
  const velRemoved = gitInfo?.removed ?? 0
  if (velAdded > 0 || velRemoved > 0) {
    parts.push(
      `${GREEN_DELTA}+${velAdded}${RESET} ${RED_DELTA}-${velRemoved}${RESET}`,
    )
  }

  // ── session_name — bold cyan when set (via /rename) ───────────────────────
  if (input.session_name) {
    parts.push(`${BOLD}${BOLD_CYAN}${input.session_name}${RESET}`)
  }

  // ── agent.name — now in rich too (already in maximal) ─────────────────────
  if (input.agent?.name) {
    // Sanitise agent.name before embedding in OSC 8 hyperlink to prevent
    // terminal injection via control characters (ANV-0110).
    const rawName = input.agent.name
    // Strip control chars from the name for display purposes.
    // sanitiseOsc8 validates the name (label); if the name is entirely control
    // characters it returns null and we skip the segment entirely.
    // The URL is built from the raw name via encodeURIComponent (safe) and
    // passed to link() which sanitises/encodes it before emission.
    const agentUrl = `https://github.com/search?q=${encodeURIComponent(rawName)}`
    const sanitised = sanitiseOsc8(rawName, agentUrl)
    if (sanitised) {
      // Use sanitised.label for display to prevent BEL/ESC reaching the terminal
      const agentText = `${BLUE}@${sanitised.label}${RESET}`
      // Pass the raw agentUrl to link() — link() sanitises and encodes it independently
      parts.push(link(agentText, agentUrl, linksEnabled, termProgram))
    }
    // If sanitised is null, name was all control chars — skip segment (nothing to display)
  }

  // ── 🤖 Model · output_style ───────────────────────────────────────────────
  const modelName = input.model.display_name
  const output_style = input.output_style?.name
  if (modelName) {
    let modelSeg = `${MAGENTA}🤖 ${modelName}${RESET}`
    if (output_style) {
      modelSeg += ` ${DIM}·${RESET} ${MAGENTA}${output_style}${RESET}`
    }
    parts.push(modelSeg)
  }

  // ── exceeds_200k_tokens — !200K alarm ─────────────────────────────────────
  if (input.exceeds_200k_tokens === true) {
    parts.push(`${RED_BOLD}!200K${RESET}`)
  }

  return sep(parts)
}
