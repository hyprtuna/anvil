/**
 * Statusline renderer — Plan 28 Phase C3, Plan 34 A4.
 *
 * Three tiers consume the documented Claude Code stdin JSON shape
 * (see `schema.ts`) and emit a single-line status string. The colour
 * rules mirror `references/statusline-command.sh` (the user's working
 * bash reference) so the TS renderer is a drop-in replacement.
 *
 * Plan 34 A4: a `template` option dispatches to the rich RGB-gradient
 * renderer (`renderRich`) when set to 'rich' (the new default), or
 * falls through to the existing tier-based chain when set to 'simple'.
 */

import { renderRich } from './render-rich.js'
import type { StatuslineInputT } from './schema.js'
import { type GitInfo, stripControls } from './shared.js'

const ESC = ''
const RESET = `${ESC}[0m`
const DIM = `${ESC}[2m`
const RED = `${ESC}[0;31m`
const YELLOW = `${ESC}[0;33m`
const GREEN = `${ESC}[0;32m`
const BLUE = `${ESC}[0;34m`
const ORANGE = `${ESC}[38;5;208m`
const MAGENTA = `${ESC}[0;35m`

export type Tier = 'minimal' | 'default' | 'maximal'

export interface RenderOptions {
  /** Show git branch (default true on default + maximal). */
  show_branch?: boolean
  /** Show dirty marker (default true on maximal). */
  show_dirty?: boolean
  /** Show active routed skill (default true on maximal). */
  show_active_skill?: boolean
  /** Currently-active skill name, read from `~/.anvil/projects/<name>/active-skill.json`. */
  active_skill?: string | undefined
  /** Current branch name, read by the caller (renderer is pure). */
  branch?: string | undefined
  /** Whether the working tree is dirty. */
  dirty?: boolean
  /**
   * Plan 34 A4 — which rendering template to use.
   * 'rich'   = truecolor RGB-gradient renderer (default).
   * 'simple' = legacy tier-based renderer.
   */
  template?: 'simple' | 'rich'
  /**
   * Plan 45 / v0.11.0 — enable OSC 8 hyperlinks (D-08).
   * Only emitted when termProgram is in the allowlist.
   * Default false.
   */
  links?: boolean
  /**
   * Plan 45 / v0.11.0 — TERM_PROGRAM value for OSC 8 allowlist check (D-08).
   * Tests inject this rather than mutating process.env.
   */
  termProgram?: string | undefined
  /**
   * ANV-0062 — Pre-aggregated git information.
   * When provided, the rich renderer uses these values directly instead of
   * shelling out to git. The statusline command (layer 4) populates this field
   * before calling render, keeping the renderer pure (no child_process I/O).
   */
  gitInfo?: GitInfo | undefined
}

function modelColor(modelId: string): string {
  if (modelId.includes('opus')) return RED
  if (modelId.includes('sonnet')) return YELLOW
  if (modelId.includes('haiku')) return GREEN
  return ''
}

function effortColor(effort: string | undefined): string {
  switch (effort?.toLowerCase()) {
    case 'max':
      return RED
    case 'xhigh':
      return ORANGE
    case 'high':
      return YELLOW
    case 'medium':
      return GREEN
    case 'low':
      return BLUE
    default:
      return ''
  }
}

function pctColor(pct: number): string {
  if (pct >= 90) return RED
  if (pct >= 75) return ORANGE
  if (pct >= 50) return YELLOW
  return GREEN
}

function formatTokens(input: StatuslineInputT): string | undefined {
  const cw = input.context_window
  if (!cw) return undefined
  const total = (cw.total_input_tokens ?? 0) + (cw.total_output_tokens ?? 0)
  if (total === 0) return undefined
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`
  return `${total}`
}

function formatResetTime(
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

function sep(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(` ${DIM}|${RESET} `)
}

export function renderMinimal(input: StatuslineInputT): string {
  const parts: string[] = []
  const m = input.model
  parts.push(`${modelColor(m.id)}${m.display_name}${RESET}`)
  const tok = formatTokens(input)
  if (tok) parts.push(`${DIM}tok:${RESET}${tok}`)
  return sep(parts)
}

export function renderDefault(
  input: StatuslineInputT,
  opts: RenderOptions = {},
): string {
  const parts: string[] = []
  const m = input.model
  parts.push(`${modelColor(m.id)}${m.display_name}${RESET}`)
  const effort = input.output_style?.name
  // A3: always show effort when defined (even 'default') so model · effort are always side-by-side.
  if (effort) parts.push(`${effortColor(effort)}${effort}${RESET}`)
  const tok = formatTokens(input)
  if (tok) parts.push(`${DIM}tok:${RESET}${tok}`)
  // ctx percentage — shown in default tier so daily users see context headroom.
  const usedPct = input.context_window?.used_percentage
  if (usedPct != null) {
    const used = Math.round(usedPct)
    parts.push(`${DIM}ctx:${RESET}${pctColor(used)}${used}%${RESET}`)
  }
  // 5h rate limit (Pro/Max only).
  const fiveH = input.rate_limits?.five_hour
  if (fiveH) {
    const reset = formatResetTime(fiveH.resets_at)
    parts.push(
      `${DIM}5h:${RESET}${pctColor(fiveH.used_percentage)}${Math.round(fiveH.used_percentage)}%${RESET}${DIM}(${reset})${RESET}`,
    )
  }
  // 7d week's usage window (Pro/Max only).
  const week = input.rate_limits?.seven_day
  if (week) {
    const reset = formatResetTime(week.resets_at)
    parts.push(
      `${DIM}7d:${RESET}${pctColor(week.used_percentage)}${Math.round(week.used_percentage)}%${RESET}${DIM}(${reset})${RESET}`,
    )
  }
  // Cost stays maximal-only — not all users want $$ visible by default.
  if (opts.show_branch !== false && opts.branch) {
    parts.push(`${DIM}${opts.branch}${RESET}`)
  }
  return sep(parts)
}

export function renderMaximal(
  input: StatuslineInputT,
  opts: RenderOptions = {},
): string {
  const parts: string[] = []
  const m = input.model
  parts.push(`${modelColor(m.id)}${m.display_name}${RESET}`)
  const output_style = input.output_style?.name
  // A3: always show effort when defined.
  if (output_style)
    parts.push(`${effortColor(output_style)}${output_style}${RESET}`)
  const tok = formatTokens(input)
  if (tok) parts.push(`${DIM}tok:${RESET}${tok}`)
  // ctx percentage from current_usage when available
  const usedPct = input.context_window?.used_percentage
  if (usedPct != null) {
    const used = Math.round(usedPct)
    parts.push(`${DIM}ctx:${RESET}${pctColor(used)}${used}%${RESET}`)
  }
  // cost
  const cost = input.cost?.total_cost_usd
  if (cost != null && cost > 0) parts.push(`${DIM}$${cost.toFixed(2)}${RESET}`)
  // duration — shown when >= 60s
  const durationMs = input.cost?.total_duration_ms
  if (durationMs != null && durationMs >= 60_000) {
    const totalMin = Math.floor(durationMs / 60_000)
    const hours = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    const durStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`
    parts.push(`${DIM}⏱${durStr}${RESET}`)
  }
  // rate limits — Pro/Max only
  const fiveH = input.rate_limits?.five_hour
  if (fiveH) {
    const reset = formatResetTime(fiveH.resets_at)
    parts.push(
      `${DIM}5h:${RESET}${pctColor(fiveH.used_percentage)}${Math.round(fiveH.used_percentage)}%${RESET}${DIM}(${reset})${RESET}`,
    )
  }
  const week = input.rate_limits?.seven_day
  if (week) {
    const reset = formatResetTime(week.resets_at)
    parts.push(
      `${DIM}7d:${RESET}${pctColor(week.used_percentage)}${Math.round(week.used_percentage)}%${RESET}${DIM}(${reset})${RESET}`,
    )
  }
  // cache_read_input_tokens — shown when >= 1k
  const cacheRead = input.context_window?.current_usage?.cache_read_input_tokens
  if (cacheRead != null && cacheRead >= 1000) {
    const cacheK = Math.floor(cacheRead / 1000)
    parts.push(`${DIM}cached:${cacheK}k${RESET}`)
  }
  // branch + dirty
  if (opts.show_branch !== false && opts.branch) {
    const dirtyMarker =
      opts.show_dirty !== false && opts.dirty ? ` ${YELLOW}●${RESET}` : ''
    parts.push(`${DIM}${opts.branch}${RESET}${dirtyMarker}`)
  }
  // active skill
  if (opts.show_active_skill !== false && opts.active_skill) {
    parts.push(`${MAGENTA}${opts.active_skill}${RESET}`)
  }
  // active agent (CC populates `agent.name` when --agent is set)
  if (input.agent?.name) {
    const safeName = stripControls(input.agent.name)
    if (safeName) parts.push(`${BLUE}@${safeName}${RESET}`)
  }
  // vim.mode — shown when present
  if (input.vim?.mode) {
    parts.push(`${DIM}[${input.vim.mode}]${RESET}`)
  }
  // worktree annotation — shown when branch differs from original_branch
  if (
    input.worktree?.name &&
    input.worktree.branch &&
    input.worktree.original_branch &&
    input.worktree.branch !== input.worktree.original_branch
  ) {
    parts.push(
      `${DIM}🌳 ${input.worktree.name} (${input.worktree.branch})${RESET}`,
    )
  }
  // session_name — shown when set (via /rename)
  if (input.session_name) {
    parts.push(`${BLUE}${input.session_name}${RESET}`)
  }
  // exceeds_200k_tokens — alarm when true
  if (input.exceeds_200k_tokens === true) {
    parts.push(`${RED}\x1b[1m!200K${RESET}`)
  }
  return sep(parts)
}

export function render(
  tier: Tier,
  input: StatuslineInputT,
  opts: RenderOptions = {},
): string {
  // Plan 34 A4: 'rich' template (default) dispatches to the RGB-gradient renderer
  // regardless of tier. 'simple' falls through to the tier-based chain.
  const template = opts.template ?? 'rich'
  if (template === 'rich') {
    return renderRich(input, opts)
  }
  switch (tier) {
    case 'minimal':
      return renderMinimal(input)
    case 'default':
      return renderDefault(input, opts)
    case 'maximal':
      return renderMaximal(input, opts)
  }
}
