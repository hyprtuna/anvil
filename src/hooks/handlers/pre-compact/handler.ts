/**
 * Pre-compact sidecar handler — ANV-0126 (Phase C).
 *
 * Companion to the existing `preCompactSnapshotHandler` (which writes a
 * markdown notepad bundling spec/plan/tasks + git log). This handler is
 * narrower: it captures the JSON active-routing.json + active-skill.json
 * snapshot to a structured sidecar under `.anvil/runtime/` so the next
 * SessionStart can re-inject a compact restore digest.
 *
 * Sidecar location:  {projectRoot}/.anvil/runtime/pre-compact-<ISO>.json
 * Disable:           pre_compact.disable=true in models.json OR env var
 *                    ANVIL_DISABLE_PRE_COMPACT=1.
 *
 * Failure modes are best-effort — pre-compact must never block.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../../core/io/project-scoped-paths.js'
import { safeWrite } from '../../../core/io/safe-write.js'
import { findProjectRoot } from '../../../core/project/root.js'
import type { HookHandler } from '../../../core/types.js'
import { buildSidecar, sidecarFilename } from './sidecar.js'

/**
 * Best-effort read of a JSON object from disk. Returns null on missing /
 * unreadable / malformed files.
 */
function readJsonObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Return true when pre-compact is disabled by config or env. Env wins.
 */
function isDisabled(ctx: Parameters<HookHandler>[0]): boolean {
  if (ctx.env.ANVIL_DISABLE_PRE_COMPACT === '1') return true
  const cfg = (ctx.config as unknown as { pre_compact?: { disable?: boolean } })
    .pre_compact
  return cfg?.disable === true
}

export const preCompactSidecarHandler: HookHandler = async (ctx) => {
  if (isDisabled(ctx)) {
    return { exitCode: 0 }
  }

  let projectRoot: string
  try {
    projectRoot = (await findProjectRoot(ctx.cwd)) ?? ctx.cwd
  } catch {
    projectRoot = ctx.cwd
  }

  const anvilDir = join(projectRoot, '.anvil')
  const runtimeDir = join(anvilDir, 'runtime')
  await ensureProjectDir(projectRoot)
  const activeSkillPath = await getProjectScopedPath(
    projectRoot,
    'active-skill',
  )
  const activeRoutingPath = await getProjectScopedPath(
    projectRoot,
    'active-routing',
  )

  const activeSkill = readJsonObject(activeSkillPath)
  const activeRouting = readJsonObject(activeRoutingPath)

  // Even when both snapshots are missing we still emit a sidecar — this
  // records that compaction occurred and gives SessionStart a deterministic
  // "no active state at compact-time" signal.

  const capturedAt = new Date()
  const sidecar = buildSidecar({
    capturedAt,
    activeSkill,
    activeRouting,
  })
  const filename = sidecarFilename(capturedAt)
  const targetPath = join(runtimeDir, filename)

  try {
    mkdirSync(runtimeDir, { recursive: true })
    safeWrite(targetPath, JSON.stringify(sidecar, null, 2), {
      maxBytes: 256 * 1024,
    })
  } catch (err) {
    // Best-effort — never block compaction on sidecar write failures.
    if (ctx.env.ANVIL_VERBOSE) {
      // eslint-disable-next-line no-console
      console.warn('[pre-compact:sidecar] write failed:', err)
    }
    return { exitCode: 0 }
  }

  return {
    exitCode: 0,
    message: `▶ Anvil saved a pre-compact runtime sidecar to .anvil/runtime/${filename}`,
  }
}
