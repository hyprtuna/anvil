import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { safeWrite } from '../io/safe-write.js'
import {
  compressOlderThan,
  formatRecentContext,
  formatSectionFile,
} from './format.js'
import {
  deriveBranchSlug,
  getNotepadsDir,
  getRecentContextPath,
  getSectionPath,
} from './paths.js'
import {
  type NotepadsEntry,
  type NotepadsSection,
  NotepadsSection as NotepadsSectionEnum,
} from './types.js'

export type { NotepadsEntry, NotepadsSection }
export {
  deriveBranchSlug,
  getNotepadsDir,
  getRecentContextPath,
  getSectionPath,
}

// ─── Token budget ────────────────────────────────────────────────────────────

/**
 * Approximate char count from token count (chars/4).
 * Conservative estimate; avoids loading a tokenizer at hook time.
 */
function tokensToChars(tokens: number): number {
  return tokens * 4
}

// ─── Current branch detection ────────────────────────────────────────────────

/**
 * Detect the current git branch. Returns 'HEAD' for detached HEAD state.
 *
 * Strips inherited `GIT_*` env vars so cwd-based git discovery wins. Without
 * this, callers running inside a git hook (e.g. pre-push) would see the
 * parent repo's branch instead of `cwd`'s, because `GIT_DIR`/`GIT_WORK_TREE`
 * take precedence over cwd in git's repo discovery.
 */
export function detectBranch(cwd: string): string {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  try {
    const branch = execSync('git branch --show-current', {
      cwd,
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return branch || 'HEAD'
  } catch {
    return 'HEAD'
  }
}

// ─── Parse section file ───────────────────────────────────────────────────────

/**
 * Parse entries from a section markdown file.
 * Parses `### YYYY-MM-DD — headline [source]` style headers.
 */
function parseSectionFile(
  content: string,
  section: NotepadsSection,
): NotepadsEntry[] {
  const entries: NotepadsEntry[] = []
  const lines = content.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    // Match compressed entries: `- YYYY-MM-DD: headline`
    const compressedMatch = /^- (\d{4}-\d{2}-\d{2}): (.+)$/.exec(line)
    if (compressedMatch) {
      const date = compressedMatch[1]
      const headline = compressedMatch[2].slice(0, 80)
      entries.push({
        section,
        headline,
        source: 'compact',
        timestamp: new Date(`${date}T00:00:00.000Z`).toISOString(),
      })
      i++
      continue
    }

    // Match active entries: `### YYYY-MM-DD — headline [source]`
    const activeMatch = /^### (\d{4}-\d{2}-\d{2}) — (.+) \[([^\]]+)\]$/.exec(
      line,
    )
    if (activeMatch) {
      const dateStr = activeMatch[1]
      const headline = activeMatch[2].slice(0, 80)
      const source = activeMatch[3]

      // Collect body lines until next section header or end
      const bodyLines: string[] = []
      i++
      while (
        i < lines.length &&
        !lines[i].startsWith('###') &&
        !lines[i].startsWith('##') &&
        !lines[i].startsWith('---')
      ) {
        if (lines[i].trim()) bodyLines.push(lines[i])
        i++
      }

      entries.push({
        section,
        headline,
        body: bodyLines.length > 0 ? bodyLines.join('\n') : undefined,
        source,
        timestamp: new Date(`${dateStr}T00:00:00.000Z`).toISOString(),
      })
      continue
    }

    i++
  }

  return entries
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the `recent-context.md` snippet for the current or specified branch.
 *
 * @param repoRoot  Absolute path to the repository root.
 * @param branch    Git branch name (or 'HEAD' for detached HEAD).
 * @param maxChars  Maximum character count for the output (default 500*4=2000).
 * @returns Markdown string ready to inject via `systemInsert`, or empty string
 *          if no notepad exists.
 */
export async function loadRecentContext(
  repoRoot: string,
  branch: string,
  maxChars = tokensToChars(500),
): Promise<string> {
  const contextPath = getRecentContextPath(repoRoot, branch)

  if (!existsSync(contextPath)) return ''

  let content: string
  try {
    content = await readFile(contextPath, 'utf-8')
  } catch (err) {
    process.stderr.write(
      `[anvil:notepads] warning: failed to read ${contextPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return ''
  }

  if (!content.trim()) return ''

  // 5KB disk limit guard
  const byteLen = Buffer.byteLength(content, 'utf-8')
  if (byteLen > 5 * 1024) {
    process.stderr.write(
      `[anvil:notepads] warning: notepad too large (${byteLen} bytes); run \`anvil notepad compact\`\n`,
    )
    return '*(notepad too large; run `anvil notepad compact` to reduce)*'
  }

  // Truncate to maxChars
  if (content.length > maxChars) {
    const truncated = content.slice(0, maxChars)
    const lastNewline = truncated.lastIndexOf('\n')
    const safe = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated
    return `${safe}\n*(notepad truncated; use 'anvil notepad read <section>' for full)*`
  }

  return content
}

/**
 * Append a new entry to a section file.
 *
 * Idempotent: if an entry with the same `headline` and `section` was written
 * in the last hour, the write is skipped silently.
 *
 * Uses atomic write (tmp → rename) to avoid corruption.
 */
export async function appendEntry(
  repoRoot: string,
  branch: string,
  entry: NotepadsEntry,
): Promise<void> {
  const sectionPath = getSectionPath(repoRoot, branch, entry.section)
  const slug = deriveBranchSlug(branch)
  const dir = join(getNotepadsDir(repoRoot), slug)

  await mkdir(dir, { recursive: true })

  // Load existing entries
  let existing: NotepadsEntry[] = []
  if (existsSync(sectionPath)) {
    try {
      const raw = await readFile(sectionPath, 'utf-8')
      existing = parseSectionFile(raw, entry.section)
    } catch {
      // Unreadable — start fresh
    }
  }

  // Idempotency check: skip if same headline+section within the same calendar day.
  // We use day-level comparison because the section file format stores only YYYY-MM-DD,
  // so the parsed timestamp is always midnight UTC — a time-based comparison would
  // incorrectly fail later in the day.
  const entryDay = entry.timestamp.slice(0, 10)
  const isDuplicate = existing.some(
    (e) =>
      e.headline === entry.headline &&
      e.section === entry.section &&
      e.source !== 'compact' &&
      e.timestamp.slice(0, 10) === entryDay,
  )
  if (isDuplicate) return

  const updated = [...existing, entry]

  // Write section file atomically (safe-io provides O_NOFOLLOW + atomic rename).
  const content = formatSectionFile(updated, entry.section, slug)
  safeWrite(sectionPath, content, { maxBytes: 256 * 1024 })

  // Regenerate recent-context.md
  await regenerateRecentContext(repoRoot, branch)
}

/**
 * Read all entries from a section file.
 */
export async function readSection(
  repoRoot: string,
  branch: string,
  section: NotepadsSection,
): Promise<NotepadsEntry[]> {
  const sectionPath = getSectionPath(repoRoot, branch, section)
  if (!existsSync(sectionPath)) return []

  try {
    const raw = await readFile(sectionPath, 'utf-8')
    return parseSectionFile(raw, section)
  } catch {
    return []
  }
}

/**
 * Compact a branch's notepad — compress entries older than 7 days in each
 * section file, then regenerate `recent-context.md`.
 *
 * @returns `{ removed, kept }` counts.
 */
export async function compact(
  repoRoot: string,
  branch: string,
  opts?: { olderThanDays?: number },
): Promise<{ removed: number; kept: number }> {
  const days = opts?.olderThanDays ?? 7
  const slug = deriveBranchSlug(branch)
  const sections = NotepadsSectionEnum.options

  let removed = 0
  let kept = 0

  for (const section of sections) {
    const sectionPath = getSectionPath(repoRoot, branch, section)
    if (!existsSync(sectionPath)) continue

    const raw = await readFile(sectionPath, 'utf-8')
    const entries = parseSectionFile(raw, section)
    const compressed = compressOlderThan(entries, days)

    // "removed" = entries that were individually lost (replaced by compressed stub)
    // Count original non-stub entries that are no longer individually present
    const originalNonStub = entries.filter((e) => e.source !== 'compact').length
    const survivingNonStub = compressed.filter(
      (e) => e.source !== 'compact',
    ).length
    removed += originalNonStub - survivingNonStub
    kept += compressed.length

    const content = formatSectionFile(compressed, section, slug)
    safeWrite(sectionPath, content, { maxBytes: 256 * 1024 })
  }

  // Regenerate recent-context
  await regenerateRecentContext(repoRoot, branch)

  return { removed, kept }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Regenerate `recent-context.md` from all section files for a branch.
 */
async function regenerateRecentContext(
  repoRoot: string,
  branch: string,
): Promise<void> {
  const slug = deriveBranchSlug(branch)
  const dir = join(getNotepadsDir(repoRoot), slug)
  const contextPath = join(dir, 'recent-context.md')

  // Collect entries from all sections
  const allEntries: NotepadsEntry[] = []
  for (const section of NotepadsSectionEnum.options) {
    const sectionPath = join(dir, `${section}.md`)
    if (!existsSync(sectionPath)) continue
    try {
      const raw = await readFile(sectionPath, 'utf-8')
      allEntries.push(...parseSectionFile(raw, section))
    } catch {
      // Skip unreadable sections
    }
  }

  if (allEntries.length === 0) {
    // Nothing to show — remove if exists
    return
  }

  // Cap to standard 500-token limit (2000 chars)
  const maxChars = tokensToChars(500)
  const content = formatRecentContext(allEntries, maxChars, slug)

  safeWrite(contextPath, content, { maxBytes: 256 * 1024 })
}

/**
 * Initialize a notepad directory for a branch with empty section stub files.
 */
export async function initNotepad(
  repoRoot: string,
  branch: string,
): Promise<string[]> {
  const slug = deriveBranchSlug(branch)
  const dir = join(getNotepadsDir(repoRoot), slug)
  await mkdir(dir, { recursive: true })

  const created: string[] = []
  for (const section of NotepadsSectionEnum.options) {
    const sectionPath = join(dir, `${section}.md`)
    if (!existsSync(sectionPath)) {
      const stub = `# ${section} — branch:${slug}\n\n## Active\n\n`
      safeWrite(sectionPath, stub)
      created.push(sectionPath)
    }
  }

  return created
}

/**
 * List all branch slugs that have notepads.
 */
export async function listNotepads(repoRoot: string): Promise<string[]> {
  const notepadsDir = getNotepadsDir(repoRoot)
  if (!existsSync(notepadsDir)) return []

  try {
    const entries = await readdir(notepadsDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}
