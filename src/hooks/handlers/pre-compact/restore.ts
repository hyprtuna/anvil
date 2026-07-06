/**
 * SessionStart pre-compact restore reader — ANV-0126 (Phase C).
 *
 * On SessionStart, locate the most recent runtime sidecar produced by
 * preCompactSidecarHandler. When one is found within the configured
 * restore window (default 1h), render a compact `<session-restore>`
 * digest that the model can read to re-orient itself.
 *
 * Pure-ish — reads from disk but does no writes and no process I/O.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from '../../../core/project/root.js'
import {
  DEFAULT_RESTORE_WINDOW_MS,
  type PreCompactSidecar,
  isWithinRestoreWindow,
  parseSidecar,
  renderRestoreDigest,
} from './sidecar.js'

/**
 * Locate the most-recently-modified pre-compact sidecar inside
 * `{projectRoot}/.anvil/runtime/`. Returns null when no candidates exist.
 */
export function findLatestSidecarPath(runtimeDir: string): string | null {
  if (!existsSync(runtimeDir)) return null
  let entries: string[]
  try {
    entries = readdirSync(runtimeDir)
  } catch {
    return null
  }
  let best: { path: string; mtime: number } | null = null
  for (const name of entries) {
    if (!name.startsWith('pre-compact-') || !name.endsWith('.json')) continue
    const full = join(runtimeDir, name)
    try {
      const st = statSync(full)
      if (!st.isFile()) continue
      if (best === null || st.mtimeMs > best.mtime) {
        best = { path: full, mtime: st.mtimeMs }
      }
    } catch {
      // skip unreadable entry
    }
  }
  return best?.path ?? null
}

/** Returned when no usable sidecar exists or restore is disabled. */
export interface NoRestore {
  kind: 'none'
}

/** Returned when a sidecar was found and rendered. */
export interface RestoreReady {
  kind: 'restore'
  digest: string
  sidecar: PreCompactSidecar
  sidecarPath: string
}

export type RestoreResult = NoRestore | RestoreReady

/**
 * Attempt to render a SessionStart restore digest from the most recent
 * sidecar. Returns `{kind:'none'}` when:
 *   - the runtime dir does not exist
 *   - no sidecar matches the naming convention
 *   - the latest sidecar is older than `windowMs`
 *   - the sidecar fails Zod validation
 *
 * Otherwise returns `{kind:'restore', digest, sidecar, sidecarPath}`.
 */
export function tryRestore(opts: {
  cwd: string
  projectRoot: string
  nowMs: number
  windowMs?: number
}): RestoreResult {
  const runtimeDir = join(opts.projectRoot, '.anvil', 'runtime')
  const path = findLatestSidecarPath(runtimeDir)
  if (!path) return { kind: 'none' }

  let mtimeMs: number
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch {
    return { kind: 'none' }
  }

  if (
    !isWithinRestoreWindow(
      mtimeMs,
      opts.nowMs,
      opts.windowMs ?? DEFAULT_RESTORE_WINDOW_MS,
    )
  ) {
    return { kind: 'none' }
  }

  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    return { kind: 'none' }
  }
  const sidecar = parseSidecar(raw)
  if (!sidecar) return { kind: 'none' }

  const digest = renderRestoreDigest(sidecar)
  return { kind: 'restore', digest, sidecar, sidecarPath: path }
}

/**
 * Resolve the restore window from typed config plus env override (env
 * wins). Returns `null` when restore is disabled.
 */
export function resolveRestoreWindowMs(
  config: unknown,
  env: Record<string, string | undefined>,
): number | null {
  if (env.ANVIL_DISABLE_PRE_COMPACT === '1') return null
  const cfg = (
    config as {
      pre_compact?: { disable?: boolean; restore_window_ms?: number }
    }
  ).pre_compact
  if (cfg?.disable === true) return null
  const w = cfg?.restore_window_ms
  if (typeof w === 'number' && Number.isFinite(w) && w > 0) return w
  return DEFAULT_RESTORE_WINDOW_MS
}

/**
 * Top-level helper consumed by `session-start.ts` — returns the digest
 * string (or null) given the SessionStart hook context.
 */
export async function buildSessionStartRestoreDigest(opts: {
  cwd: string
  config: unknown
  env: Record<string, string | undefined>
}): Promise<string | null> {
  const windowMs = resolveRestoreWindowMs(opts.config, opts.env)
  if (windowMs === null) return null
  let projectRoot: string
  try {
    projectRoot = (await findProjectRoot(opts.cwd)) ?? opts.cwd
  } catch {
    projectRoot = opts.cwd
  }
  const result = tryRestore({
    cwd: opts.cwd,
    projectRoot,
    nowMs: Date.now(),
    windowMs,
  })
  return result.kind === 'restore' ? result.digest : null
}
