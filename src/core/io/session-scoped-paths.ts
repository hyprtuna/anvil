/**
 * Session-scoped sidecar path helpers (ANV-0043).
 *
 * Concurrent Claude Code / OpenCode sessions in the same project clobber each
 * other when they share project-relative sidecar paths like
 * `.anvil/active-skill.json`. This module keys per-session state by
 * `sha256(transcriptPath).slice(0, 16)` and stores files under
 * `~/.anvil/sessions/<key>/<name>.json`.
 *
 * Design principles:
 *  - Deterministic per session: same transcript path → same key, always.
 *  - Isolated per session: different transcript paths → distinct directories.
 *  - Sweep on write (1% sample rate): sessions older than 7 days are pruned;
 *    total sessions capped at 50.
 *
 * Layer-0: this file imports nothing from higher layers.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getUserHome } from './home.js'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Drop sessions older than 7 days. */
export const MAX_AGE_MS = 7 * 24 * 3600 * 1000

/** Keep at most 50 session directories. */
export const MAX_ENTRIES = 50

/** 1 % of writes trigger a sweep. */
export const SWEEP_SAMPLE_RATE = 0.01

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derive a 16-hex-char session key from the transcript path.
 * Deterministic: same input → same output; collision-resistant for practical
 * concurrent-session counts.
 */
export function deriveSessionKey(transcriptPath: string): string {
  return createHash('sha256').update(transcriptPath).digest('hex').slice(0, 16)
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Root directory for all session state: `~/.anvil/sessions`. */
export function sessionsRoot(): string {
  return join(getUserHome(), '.anvil', 'sessions')
}

/** Directory for a specific session: `~/.anvil/sessions/<key>`. */
export function sessionDir(transcriptPath: string): string {
  return join(sessionsRoot(), deriveSessionKey(transcriptPath))
}

/**
 * Full path to a named sidecar file for a session.
 *
 * Example:
 *   getSessionScopedPath('/home/user/.claude/projects/anvil/session.jsonl', 'active-skill')
 *   → '/home/user/.anvil/sessions/a3f1b2c4d5e6f7a8/active-skill.json'
 */
export function getSessionScopedPath(
  transcriptPath: string,
  name: string,
): string {
  return join(sessionDir(transcriptPath), `${name}.json`)
}

// ─── Sweep ───────────────────────────────────────────────────────────────────

/**
 * Prune stale session directories.
 *
 * Called probabilistically (SWEEP_SAMPLE_RATE) on every session-scoped write
 * so the sessions directory never grows unbounded without a dedicated daemon.
 *
 * Criteria (applied in order):
 *  1. Delete any session directory last-modified more than MAX_AGE_MS ago.
 *  2. If total sessions still exceed MAX_ENTRIES, delete oldest by mtime.
 *
 * Best-effort: any error is silently swallowed.
 */
export function sweepSessions(): void {
  try {
    const root = sessionsRoot()
    let entries: Array<{ name: string; mtime: number }> = []
    try {
      const names = readdirSync(root)
      for (const name of names) {
        try {
          const st = statSync(join(root, name))
          entries.push({ name, mtime: st.mtimeMs })
        } catch {
          // unreadable — skip
        }
      }
    } catch {
      return // sessions root does not exist yet
    }

    const cutoff = Date.now() - MAX_AGE_MS

    // 1. Delete sessions older than MAX_AGE_MS
    entries = entries.filter((e) => {
      if (e.mtime < cutoff) {
        try {
          rmSync(join(root, e.name), { recursive: true, force: true })
        } catch {
          // best-effort
        }
        return false
      }
      return true
    })

    // 2. Cap to MAX_ENTRIES — drop oldest first
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => a.mtime - b.mtime)
      const toDelete = entries.slice(0, entries.length - MAX_ENTRIES)
      for (const e of toDelete) {
        try {
          rmSync(join(root, e.name), { recursive: true, force: true })
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // top-level best-effort
  }
}

/**
 * Ensure the session directory exists and probabilistically sweep stale
 * sessions. Call this before every session-scoped write.
 */
export function ensureSessionDir(transcriptPath: string): void {
  mkdirSync(sessionDir(transcriptPath), { recursive: true })
  if (Math.random() < SWEEP_SAMPLE_RATE) {
    sweepSessions()
  }
}
