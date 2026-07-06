/**
 * subagentStatusLine renderer — Plan 29 Phase F1 (Plan 28 carry-forward C8).
 *
 * CC ships a separate `subagentStatusLine` setting that renders one row per
 * active subagent in the agent panel. This module handles rendering of the
 * subagent task objects into the `{id, content}` JSON lines CC expects.
 *
 * Input shape: CC `tasks[]` from the subagentStatusLine stdin payload.
 * Output: one JSON line per task `{id, content}`.
 */

const ESC = '\x1b'
const RESET = `${ESC}[0m`
const DIM = `${ESC}[2m`
const RED = `${ESC}[0;31m`
const YELLOW = `${ESC}[0;33m`
const GREEN = `${ESC}[0;32m`
const BLUE = `${ESC}[0;34m`
const MAGENTA = `${ESC}[0;35m`

export interface SubagentTask {
  id: string
  name: string
  type?: string
  status?: string
  description?: string
  label?: string
  /** ISO-8601 or Unix epoch ms start time. */
  startTime?: string | number
  tokenCount?: number
  tokenSamples?: number[]
  cwd?: string
}

export interface SubagentLineOutput {
  id: string
  content: string
}

/** Maps task status to a status badge with colour. */
function statusBadge(status: string | undefined): string {
  switch (status?.toLowerCase()) {
    case 'running':
      return `${GREEN}●${RESET}`
    case 'pending':
      return `${YELLOW}○${RESET}`
    case 'done':
    case 'complete':
    case 'completed':
      return `${DIM}✓${RESET}`
    case 'error':
    case 'failed':
      return `${RED}✗${RESET}`
    default:
      return `${DIM}?${RESET}`
  }
}

/** Derives a colour for a model badge from the task name (mirrors render.ts). */
function modelColor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('opus')) return RED
  if (lower.includes('sonnet')) return YELLOW
  if (lower.includes('haiku')) return GREEN
  return MAGENTA
}

/**
 * Formats elapsed milliseconds into a compact human-readable string.
 * Mirrors the format_reset_time convention from render.ts but counts up
 * rather than down.
 */
function formatElapsed(startTime: string | number | undefined): string {
  if (startTime === undefined) return ''
  const startMs =
    typeof startTime === 'number' ? startTime : new Date(startTime).getTime()
  if (Number.isNaN(startMs)) return ''
  const elapsedMs = Date.now() - startMs
  if (elapsedMs < 0) return ''
  const elapsedSec = Math.floor(elapsedMs / 1000)
  if (elapsedSec < 60) return `${elapsedSec}s`
  if (elapsedSec < 3600) {
    const m = Math.floor(elapsedSec / 60)
    const s = elapsedSec % 60
    return `${m}m${s}s`
  }
  const h = Math.floor(elapsedSec / 3600)
  const m = Math.floor((elapsedSec % 3600) / 60)
  return `${h}h${m}m`
}

/**
 * Formats a token count into a compact representation — mirrors the
 * `formatTokens` helper in `render.ts` but takes a raw number directly
 * rather than a full `StatuslineInputT`.
 */
export function formatTokenCount(
  count: number | undefined,
): string | undefined {
  if (count === undefined || count === 0) return undefined
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return `${count}`
}

function sep(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(` ${DIM}|${RESET} `)
}

/**
 * Renders one subagent task row.
 *
 * Format: `[status] [modelBadge name] [elapsed] | tok:N`
 */
export function renderSubagentLine(task: SubagentTask): SubagentLineOutput {
  const parts: string[] = []

  // Status badge
  const badge = statusBadge(task.status)
  const color = modelColor(task.name)
  const nameLabel = task.label ?? task.name
  parts.push(`${badge} ${color}${nameLabel}${RESET}`)

  // Elapsed time
  const elapsed = formatElapsed(task.startTime)
  if (elapsed) parts.push(`${DIM}${elapsed}${RESET}`)

  // Token count
  const tokStr = formatTokenCount(task.tokenCount)
  if (tokStr) parts.push(`${DIM}tok:${RESET}${tokStr}`)

  // Type hint (e.g. "agent", "tool")
  if (task.type && task.type !== 'agent') {
    parts.push(`${BLUE}${task.type}${RESET}`)
  }

  return { id: task.id, content: sep(parts) }
}

/**
 * Renders multiple subagent tasks into a `{id, content}` array.
 * Returns an empty array when `tasks` is empty (free-tier / no active agents).
 */
export function renderSubagentBatch(
  tasks: SubagentTask[],
): SubagentLineOutput[] {
  return tasks.map(renderSubagentLine)
}
