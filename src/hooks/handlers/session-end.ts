import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { getProjectScopedPath } from '../../core/io/project-scoped-paths.js'
import { safeWrite } from '../../core/io/safe-write.js'
import { getSessionScopedPath } from '../../core/io/session-scoped-paths.js'
import { isGenerated } from '../../core/project/is-generated.js'
import type { HookHandler } from '../../core/types.js'

/**
 * Fires when a session ends. Emits a structured summary of the session:
 * files modified, commits created, tokens consumed, duration.
 * Advisory only — never blocks.
 *
 * Also persists a CostData record to `.anvil/session.json` so that
 * `anvil progress` can display real cost/token telemetry after a session.
 */
export const sessionEndHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as {
    filesModified?: string[]
    commitsCreated?: number
    tokensUsed?: number
    durationMs?: number
    estimatedCostUsd?: number
    sessionStart?: string
  } | null

  const filesModified = payload?.filesModified ?? []
  const commitsCreated = payload?.commitsCreated ?? 0
  const tokensUsed = payload?.tokensUsed ?? 0
  const durationMs = payload?.durationMs ?? 0
  const estimatedCostUsd = payload?.estimatedCostUsd ?? 0
  const sessionStart =
    payload?.sessionStart ?? new Date(Date.now() - durationMs).toISOString()

  const durationSec = Math.round(durationMs / 1000)
  const summary = [
    `session-end: ${filesModified.length} files modified`,
    `${commitsCreated} commits`,
    `${tokensUsed} tokens`,
    durationMs > 0 ? `${durationSec}s` : '',
  ]
    .filter(Boolean)
    .join(', ')

  // Persist cost data for `anvil progress`
  const anvilDir = join(ctx.cwd, '.anvil')
  const sessionPath = join(anvilDir, 'session.json')
  try {
    await fs.mkdir(anvilDir, { recursive: true })
    // ANV-0054: respect_generated guard — skip write if target is generated.
    if (await isGenerated(sessionPath, ctx.cwd)) {
      process.stderr.write(
        '[anvil:session-end] skipping session.json — file is marked generated\n',
      )
    } else {
      safeWrite(
        sessionPath,
        JSON.stringify(
          { tokensUsed, estimatedCostUsd, durationMs, sessionStart },
          null,
          2,
        ),
      )
    }
  } catch (err) {
    if (process.env.ANVIL_VERBOSE) {
      console.warn(`[session-end] Failed to write ${sessionPath}:`, err)
    }
  }

  // Plan 28 C7 / ANV-0043: clear stale active-skill record at session end so
  // the statusline does not advertise a routed skill into the next session.
  // Clear session-scoped path when transcript_path is available (ANV-0043).
  const rawPayload = ctx.payload as Record<string, unknown> | null | undefined
  const transcriptPath =
    rawPayload != null && typeof rawPayload.transcript_path === 'string'
      ? rawPayload.transcript_path
      : undefined
  if (transcriptPath) {
    try {
      await fs.unlink(getSessionScopedPath(transcriptPath, 'active-skill'))
    } catch {
      // already absent — fine.
    }
    try {
      await fs.unlink(getSessionScopedPath(transcriptPath, 'active-routing'))
    } catch {
      // already absent — fine.
    }
  }
  // Per-project path: clear the project-scoped active-skill.
  try {
    const projectSkillPath = await getProjectScopedPath(ctx.cwd, 'active-skill')
    await fs.unlink(projectSkillPath)
  } catch {
    // already absent — fine.
  }

  return {
    exitCode: 0,
    message: summary,
    context: {
      filesModified,
      commitsCreated,
      tokensUsed,
      durationMs,
    },
  }
}
