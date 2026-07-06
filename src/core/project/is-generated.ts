/**
 * Generated-file predicate (ANV-0054).
 *
 * Provides a single async function `isGenerated(path)` that returns true
 * when a file is considered generated:
 *   1. Header detection — the first 300 bytes contain any of:
 *        @generated, AUTO-GENERATED, DO NOT EDIT (case-insensitive).
 *   2. Gitignore matching — the path matches a `.gitignore` pattern in the
 *      project root (simple line-by-line prefix / exact / glob match).
 *
 * Results are memoized per path for the lifetime of the process. Call
 * `resetGeneratedCache()` to clear (used in tests).
 *
 * Layer 0: no imports from higher layers.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// ---------------------------------------------------------------------------
// Session-level cache (singleton)
// ---------------------------------------------------------------------------

/** Memoized results keyed by absolute path. */
const cache = new Map<string, boolean>()

/** Clear the cache — used in tests to isolate cases. */
export function resetGeneratedCache(): void {
  cache.clear()
}

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

/** Number of bytes to inspect for generated markers. */
const HEADER_BYTES = 300

/** Case-insensitive markers that flag a file as generated. */
const GENERATED_MARKERS = [
  '@generated',
  'auto-generated',
  'do not edit',
] as const

/**
 * Returns true if the first HEADER_BYTES of the file contain any of the
 * known generated-file markers (case-insensitive). Returns false on any
 * read error (the file may not exist, may be binary, etc.).
 */
function hasGeneratedHeader(filePath: string): boolean {
  try {
    const fd = readFileSync(filePath)
    const head = fd.subarray(0, HEADER_BYTES).toString('utf-8').toLowerCase()
    return GENERATED_MARKERS.some((marker) => head.includes(marker))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Gitignore matching
// ---------------------------------------------------------------------------

/** Gitignore pattern cache keyed by gitignore file path. */
const gitignorePatternCache = new Map<string, string[]>()

/**
 * Read and return raw non-comment, non-empty gitignore lines.
 * Returns [] when the file is absent or unreadable.
 */
function loadGitignorePatterns(gitignorePath: string): string[] {
  const cached = gitignorePatternCache.get(gitignorePath)
  if (cached !== undefined) return cached

  let patterns: string[] = []
  try {
    if (existsSync(gitignorePath)) {
      const raw = readFileSync(gitignorePath, 'utf-8')
      patterns = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
    }
  } catch {
    patterns = []
  }

  gitignorePatternCache.set(gitignorePath, patterns)
  return patterns
}

/**
 * Minimal glob-to-regex converter for gitignore patterns.
 *
 * Supports * (non-separator chars), ** (any chars), ? (single non-separator),
 * trailing / (directory-only), anchored patterns (contain /), and floating
 * patterns (match any path segment). Negation patterns (!) are skipped.
 *
 * This is intentionally simple — no new npm dependencies.
 */
function gitignorePatternMatches(pattern: string, relPath: string): boolean {
  if (pattern.startsWith('!')) return false

  const dirOnly = pattern.endsWith('/')
  const stripped = dirOnly ? pattern.slice(0, -1) : pattern

  const escaped = stripped
    .replace(/[.+^{}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, ' STARSTAR ')
    .replace(/\*/g, '[^/]*')
    .replace(/ STARSTAR /g, '.*')
    .replace(/\?/g, '[^/]')

  if (dirOnly) {
    const re = new RegExp(`(^|/)${escaped}(/|$)`)
    return re.test(relPath)
  }

  if (stripped.includes('/')) {
    const re = new RegExp(`^${escaped}($|/)`)
    return re.test(relPath)
  }

  const re = new RegExp(`(^|/)${escaped}($|/)`)
  return re.test(relPath)
}

/**
 * Returns true when the file at `filePath` is matched by any non-negation
 * pattern in the `.gitignore` found at `projectRoot/.gitignore`.
 */
function matchesGitignore(filePath: string, projectRoot: string): boolean {
  const gitignorePath = join(projectRoot, '.gitignore')
  const patterns = loadGitignorePatterns(gitignorePath)
  if (patterns.length === 0) return false

  const relPath = relative(projectRoot, filePath).replace(/\\/g, '/')
  if (relPath.startsWith('..')) return false

  for (const pattern of patterns) {
    if (gitignorePatternMatches(pattern, relPath)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if `filePath` is considered generated:
 *   1. First HEADER_BYTES contain a @generated / AUTO-GENERATED / DO NOT EDIT marker, OR
 *   2. The path matches a `.gitignore` pattern in `projectRoot`.
 *
 * Results are memoized per absolute path for the process lifetime.
 * Pass `projectRoot` to enable gitignore matching.
 */
export async function isGenerated(
  filePath: string,
  projectRoot?: string,
): Promise<boolean> {
  const cacheKey = `${filePath}::${projectRoot ?? ''}`
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit

  let result = false

  if (hasGeneratedHeader(filePath)) {
    result = true
  }

  if (!result && projectRoot) {
    result = matchesGitignore(filePath, projectRoot)
  }

  cache.set(cacheKey, result)
  return result
}
