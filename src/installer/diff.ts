/**
 * Plan-mode diff for `anvil init --diff`.
 *
 * Compares the would-be anvil home (built in-memory by `stageAnvilHome`)
 * against the existing files at `<home>/.anvil/`. Produces a structured
 * report: new / changed / deleted / unchanged. No writes.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AdapterContext } from '../adapters/interface.js'
import { stageAnvilHome } from './stage.js'

/**
 * Path prefixes (relative to anvilHome) that are managed outside the staged
 * files manifest (e.g. runtime mirror sources written by sync.ts via `cp`).
 * These are excluded from deletion enumeration to avoid false positives until
 * ANV-0031 install-state ledger lands.
 */
const DELETION_EXCLUDED_PREFIXES: readonly string[] = [
  'runtime/dist',
  'runtime/dist-hooks',
]

export interface PathDiff {
  relativePath: string
  status: 'new' | 'changed' | 'deleted' | 'unchanged'
  /** Lines added to the staging file vs the current file. */
  added?: number
  /** Lines removed from the current file vs the staging file. */
  removed?: number
  /** First ~20 lines of unified diff, when status === 'changed'. */
  preview?: string
}

export interface DiffReport {
  anvilHome: string
  paths: PathDiff[]
  summary: { new: number; changed: number; deleted: number; unchanged: number }
}

export async function diffAnvilHome(
  ctx: AdapterContext,
  anvilHome: string,
): Promise<DiffReport> {
  const staged = await stageAnvilHome(ctx)
  const stagedPaths = new Map(staged.files.map((f) => [f.relativePath, f]))
  const paths: PathDiff[] = []

  for (const [rel, file] of stagedPaths) {
    const proposed =
      typeof file.content === 'string'
        ? file.content
        : file.content.toString('utf-8')
    const current = await safeReadFile(join(anvilHome, rel))
    if (current === null) {
      paths.push({
        relativePath: rel,
        status: 'new',
        added: countLines(proposed),
      })
      continue
    }
    if (current === proposed) {
      paths.push({ relativePath: rel, status: 'unchanged' })
      continue
    }
    const { added, removed, preview } = unifiedLineDiff(current, proposed)
    paths.push({
      relativePath: rel,
      status: 'changed',
      added,
      removed,
      preview,
    })
  }

  // Deletion detection: enumerate existing files under anvilHome and find
  // paths that are absent from the staged set. Scoped to the staging root
  // prefix (anvilHome) to avoid false positives until ANV-0031 lands.
  const existingPaths = await enumerateAnvilHome(anvilHome)
  for (const rel of existingPaths) {
    if (!stagedPaths.has(rel)) {
      paths.push({ relativePath: rel, status: 'deleted' })
    }
  }

  paths.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  const summary = paths.reduce(
    (acc, p) => {
      acc[p.status]++
      return acc
    },
    { new: 0, changed: 0, deleted: 0, unchanged: 0 },
  )

  return { anvilHome, paths, summary }
}

/**
 * Recursively enumerate regular files under `anvilHome`, returning relative
 * paths (relative to `anvilHome`). Paths that resolve outside `anvilHome`
 * (e.g. dangling or outbound symlinks) are rejected and skipped. Paths under
 * `DELETION_EXCLUDED_PREFIXES` are skipped to avoid false positives for
 * runtime-mirror content managed outside the staged files manifest.
 *
 * Uses `readdir({recursive: true})` for O(n) non-quadratic enumeration.
 * Returns an empty array when `anvilHome` does not exist.
 */
async function enumerateAnvilHome(anvilHome: string): Promise<string[]> {
  const resolvedHome = resolve(anvilHome)
  let entries: import('node:fs').Dirent[]
  try {
    // Node ≥20: readdir with recursive:true + withFileTypes returns Dirent[].
    // Each Dirent carries `parentPath` (absolute path of the containing dir).
    entries = (await readdir(resolvedHome, {
      recursive: true,
      withFileTypes: true,
    })) as import('node:fs').Dirent[]
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return []
    throw err
  }

  const result: string[] = []
  for (const entry of entries) {
    // Only include regular files (not directories, symlinks, etc.)
    if (!entry.isFile()) continue

    // Reconstruct relative path using parentPath (absolute path of parent dir)
    // Node ≥20 sets Dirent.parentPath; resolve it and strip the home prefix.
    const parentAbs = resolve(entry.parentPath)
    const rel =
      parentAbs === resolvedHome
        ? entry.name
        : `${parentAbs.slice(resolvedHome.length + 1).replace(/\\/g, '/')}/${entry.name}`

    // Guard: reject any resolved path that escapes anvilHome (e.g. outbound symlinks)
    const abs = resolve(resolvedHome, rel)
    if (!abs.startsWith(`${resolvedHome}/`) && abs !== resolvedHome) {
      continue
    }

    // Skip excluded prefixes (runtime mirror content not tracked in staged files)
    if (
      DELETION_EXCLUDED_PREFIXES.some(
        (prefix) => rel === prefix || rel.startsWith(`${prefix}/`),
      )
    ) {
      continue
    }

    result.push(rel)
  }
  return result
}

async function safeReadFile(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf-8')
  } catch {
    return null
  }
}

function countLines(s: string): number {
  if (s.length === 0) return 0
  return s.split('\n').length - (s.endsWith('\n') ? 1 : 0)
}

/**
 * LCS-based unified line diff. Adequate for typical small markdown / JSON
 * files in `anvil init` output; not optimized for huge diffs (the install
 * surface is tiny — at most a few thousand lines total across ~150 files).
 */
function unifiedLineDiff(
  a: string,
  b: string,
): { added: number; removed: number; preview: string } {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const m = aLines.length
  const n = bLines.length

  // Build LCS length table
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) lcs[i][j] = lcs[i + 1][j + 1] + 1
      else lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: string[] = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`-${aLines[i]}`)
      removed++
      i++
    } else {
      out.push(`+${bLines[j]}`)
      added++
      j++
    }
  }
  while (i < m) {
    out.push(`-${aLines[i++]}`)
    removed++
  }
  while (j < n) {
    out.push(`+${bLines[j++]}`)
    added++
  }

  const preview = out.slice(0, 20).join('\n')
  return { added, removed, preview }
}
