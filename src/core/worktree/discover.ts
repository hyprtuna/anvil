import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ANV-0155 — Ticket file discovery.
 * Layer 0 — reads `.anvil/tickets/` directory, returns path + first heading.
 *
 * Does NOT use `spawnSync` — pure filesystem reads only.
 */

export interface TicketFileResult {
  /** Absolute path to the ticket markdown file. */
  path: string
  /** First H1 line from the file (e.g. "ANV-0157 — Fix install-scope detection"). */
  header: string
}

/**
 * Scan `.anvil/tickets/` for a file whose name starts with `ticketId-`.
 * Returns null if nothing is found.
 *
 * @param ticketId - e.g. "ANV-0157"
 * @param repoRoot - absolute path to the git repo root (or cwd)
 */
export function findTicketFile(
  ticketId: string,
  repoRoot: string,
): TicketFileResult | null {
  const ticketsDir = join(repoRoot, '.anvil', 'tickets')
  if (!existsSync(ticketsDir)) return null

  let entries: string[]
  try {
    entries = readdirSync(ticketsDir)
  } catch {
    return null
  }

  const prefix = `${ticketId.toUpperCase()}-`
  const match = entries.find((e) => e.startsWith(prefix) && e.endsWith('.md'))
  if (!match) return null

  const filePath = join(ticketsDir, match)
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }

  // Extract the first H1 heading
  const lines = content.split('\n')
  const h1 = lines.find((l) => l.startsWith('# '))
  const header = h1 ? h1.slice(2).trim() : match.replace(/\.md$/, '')

  return { path: filePath, header }
}

/**
 * Read up to `maxChars` of the ticket file content for embedding in the
 * subagent prompt (spec_excerpt field).
 */
export function readSpecExcerpt(filePath: string, maxChars = 300): string {
  try {
    const content = readFileSync(filePath, 'utf-8')
    if (content.length <= maxChars) return content
    return `${content.slice(0, maxChars)}\n…`
  } catch {
    return ''
  }
}
