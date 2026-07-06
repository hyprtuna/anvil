/**
 * Tests for session-scoped sidecar path helpers (ANV-0043).
 *
 * Verifies:
 *  1. Same transcript_path → same key (deterministic).
 *  2. Different transcript_paths → different keys (isolation).
 *  3. getSessionScopedPath returns a path under ~/.anvil/sessions/<key>/.
 *  4. ensureSessionDir creates the directory.
 *  5. sweepSessions prunes sessions older than MAX_AGE_MS.
 *  6. sweepSessions caps to MAX_ENTRIES.
 *  7. Concurrent-session simulation: two sessions produce non-conflicting paths.
 */

import { existsSync, mkdirSync, rmSync, utimesSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_AGE_MS,
  MAX_ENTRIES,
  deriveSessionKey,
  ensureSessionDir,
  getSessionScopedPath,
  sessionDir,
  sessionsRoot,
  sweepSessions,
} from '../../../../src/core/io/session-scoped-paths.js'

// ─── Key derivation ───────────────────────────────────────────────────────────

describe('deriveSessionKey', () => {
  it('returns a 16-char hex string', () => {
    const key = deriveSessionKey(
      '/home/user/.claude/sessions/abc/transcript.jsonl',
    )
    expect(key).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic — same input → same key', () => {
    const tp = '/home/user/.claude/sessions/abc123/transcript.jsonl'
    expect(deriveSessionKey(tp)).toBe(deriveSessionKey(tp))
  })

  it('is distinct for different transcript paths', () => {
    const a = deriveSessionKey(
      '/home/user/.claude/sessions/session-A/transcript.jsonl',
    )
    const b = deriveSessionKey(
      '/home/user/.claude/sessions/session-B/transcript.jsonl',
    )
    expect(a).not.toBe(b)
  })
})

// ─── Path helpers ─────────────────────────────────────────────────────────────

describe('getSessionScopedPath', () => {
  it('returns a path ending in <name>.json', () => {
    const p = getSessionScopedPath('/some/transcript.jsonl', 'active-skill')
    expect(p).toMatch(/active-skill\.json$/)
  })

  it('places the file under the session key directory', () => {
    const tp = '/some/transcript.jsonl'
    const key = deriveSessionKey(tp)
    const p = getSessionScopedPath(tp, 'active-skill')
    expect(dirname(p)).toContain(key)
  })

  it('two different transcript paths produce non-conflicting paths', () => {
    const p1 = getSessionScopedPath('/sessions/A/t.jsonl', 'active-skill')
    const p2 = getSessionScopedPath('/sessions/B/t.jsonl', 'active-skill')
    expect(p1).not.toBe(p2)
    // Verify they are siblings under different session dirs, not the same file
    expect(basename(p1)).toBe(basename(p2)) // same file name
    expect(dirname(p1)).not.toBe(dirname(p2)) // but different session dirs
  })
})

// ─── ensureSessionDir ─────────────────────────────────────────────────────────

describe('ensureSessionDir', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
    }
    testDirs.length = 0
  })

  it('creates the session directory on disk', () => {
    const tp = `/fake/transcript-${Date.now()}-ensure.jsonl`
    const dir = sessionDir(tp)
    testDirs.push(dir)

    ensureSessionDir(tp)

    expect(existsSync(dir)).toBe(true)
  })
})

// ─── sweepSessions ────────────────────────────────────────────────────────────

describe('sweepSessions', () => {
  // Why this test needed HOME isolation seeding:
  // sessionsRoot() calls homedir() which reads process.env.HOME at call time.
  // Capturing `root` at describe-scope (collection time) reads the real HOME
  // before setup-isolated-home.ts beforeAll runs. Test then creates dirs in
  // the real HOME path while sweepSessions() operates on the isolated HOME →
  // the stale dir is never swept. Fix: evaluate sessionsRoot() inside beforeEach
  // after the isolated HOME is set. (Class A — HOME seeding needed.)
  let root: string
  const createdDirs: string[] = []

  beforeEach(() => {
    root = sessionsRoot()
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best-effort
      }
    }
    createdDirs.length = 0
  })

  it('deletes sessions older than MAX_AGE_MS', () => {
    const staleKey = `test-stale-${Date.now()}`
    const staleDir = join(root, staleKey)
    mkdirSync(staleDir, { recursive: true })
    createdDirs.push(staleDir)

    // Backdate the mtime by MAX_AGE_MS + 1 hour
    const staleTime = new Date(Date.now() - MAX_AGE_MS - 3_600_000)
    utimesSync(staleDir, staleTime, staleTime)

    sweepSessions()

    expect(existsSync(staleDir)).toBe(false)
  })

  it('keeps sessions younger than MAX_AGE_MS', () => {
    const freshKey = `test-fresh-${Date.now()}`
    const freshDir = join(root, freshKey)
    mkdirSync(freshDir, { recursive: true })
    createdDirs.push(freshDir)

    sweepSessions()

    expect(existsSync(freshDir)).toBe(true)
  })

  it('caps total sessions to MAX_ENTRIES by removing the oldest', () => {
    const now = Date.now()
    const testPrefix = `test-cap-${now}`

    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      const key = `${testPrefix}-${i}`
      const dir = join(root, key)
      mkdirSync(dir, { recursive: true })
      // Assign staggered mtimes (all within TTL) so oldest can be identified
      const mtime = new Date(now - (MAX_ENTRIES + 5 - i) * 1000)
      utimesSync(dir, mtime, mtime)
      createdDirs.push(dir)
    }

    sweepSessions()

    const surviving = readdirSync(root).filter((e) => e.startsWith(testPrefix))

    // After sweep, surviving test entries must be ≤ MAX_ENTRIES
    // (the global cap applies across all sessions, including any real ones)
    expect(surviving.length).toBeLessThanOrEqual(MAX_ENTRIES)
  })
})

// ─── Concurrent session isolation ────────────────────────────────────────────

describe('concurrent session isolation', () => {
  it('two concurrent sessions write to distinct paths', () => {
    const sessionA =
      '/home/user/.claude/projects/myapp/session-A/conversation.jsonl'
    const sessionB =
      '/home/user/.claude/projects/myapp/session-B/conversation.jsonl'

    const pathA = getSessionScopedPath(sessionA, 'active-skill')
    const pathB = getSessionScopedPath(sessionB, 'active-skill')

    // Different transcript paths must produce different storage paths
    expect(pathA).not.toBe(pathB)
    // Parent directories must differ
    expect(dirname(pathA)).not.toBe(dirname(pathB))
  })

  it('same session always resolves to the same path (determinism)', () => {
    const session =
      '/home/user/.claude/projects/myapp/session-X/conversation.jsonl'

    const path1 = getSessionScopedPath(session, 'active-routing')
    const path2 = getSessionScopedPath(session, 'active-routing')

    expect(path1).toBe(path2)
  })

  it('five concurrent sessions all produce distinct paths', () => {
    const paths = [1, 2, 3, 4, 5].map((n) =>
      getSessionScopedPath(
        `/home/user/.claude/projects/proj/session-${n}/t.jsonl`,
        'active-skill',
      ),
    )
    const unique = new Set(paths)
    expect(unique.size).toBe(5)
  })
})
