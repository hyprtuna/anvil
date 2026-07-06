/**
 * required_reading injection helper (Plan 43 Phase I — Item 23).
 *
 * Builds a `<required_reading>` block by reading each repo-relative path
 * declared in an agent's `required_reading` frontmatter list. Total budget
 * 8 KB; on overflow the block is truncated with an explicit marker.
 *
 * Best-effort: missing or unreadable files are skipped. When `agentName` is
 * provided, a single stderr line is written per invocation summarising all
 * missing/unreadable paths (E-005 / D-09). The `<required_reading>` block
 * is omitted entirely when no listed path is readable.
 */

import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/**
 * Single source of truth for the required-reading byte budget (ANV-0016).
 * Runtime truncates at this cap; doctor warns when any agent exceeds it.
 */
export const REQUIRED_READING_BYTE_CAP = 8 * 1024

/**
 * Read each path repo-relative to `cwd` and assemble a fenced
 * `<required_reading>` block.
 *
 * When `agentName` is provided, missing or unreadable paths are collected
 * and emitted to stderr as a single summary line after the loop (D-09).
 *
 * Returns `null` when the input list is empty or no file is readable.
 */
export function buildRequiredReadingBlock(
  paths: string[] | undefined,
  cwd: string,
  agentName?: string,
): string | null {
  if (!paths || paths.length === 0) return null

  const sections: string[] = []
  let totalBytes = 0
  let truncated = false
  const missing: string[] = []

  for (const relPath of paths) {
    const abs = isAbsolute(relPath) ? relPath : join(cwd, relPath)
    if (!existsSync(abs)) {
      missing.push(relPath)
      continue
    }

    let content: string
    try {
      content = readFileSync(abs, 'utf-8')
    } catch {
      missing.push(relPath)
      continue
    }

    const remaining = REQUIRED_READING_BYTE_CAP - totalBytes
    if (remaining <= 0) {
      truncated = true
      break
    }

    if (content.length > remaining) {
      sections.push(
        `### ${relPath}\n${content.slice(0, remaining)}\n[...truncated for budget]`,
      )
      totalBytes = REQUIRED_READING_BYTE_CAP
      truncated = true
      break
    }

    sections.push(`### ${relPath}\n${content}`)
    totalBytes += content.length
  }

  // E-005 (D-09): emit one stderr line per invocation summarising all offenders.
  if (agentName && missing.length > 0) {
    process.stderr.write(
      `[anvil] agent ${agentName}: required_reading path(s) missing/unreadable: ${missing.join(', ')}\n`,
    )
  }

  if (sections.length === 0) return null

  const trailer = truncated ? '\n<!-- truncated for 8 KB budget -->' : ''
  return `<required_reading>\n${sections.join('\n\n')}${trailer}\n</required_reading>`
}

/**
 * Compute the resolved byte total for a list of required_reading paths.
 * Used by the doctor row to warn when an agent's frontmatter exceeds the
 * 8 KB cap (the cap is silent at dispatch — truncation only).
 */
export function measureRequiredReadingBytes(
  paths: string[] | undefined,
  cwd: string,
): number {
  if (!paths || paths.length === 0) return 0
  let total = 0
  for (const relPath of paths) {
    const abs = isAbsolute(relPath) ? relPath : join(cwd, relPath)
    if (!existsSync(abs)) continue
    try {
      const content = readFileSync(abs, 'utf-8')
      total += content.length
    } catch {
      // skip
    }
  }
  return total
}
