import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { safeAppend, safeWrite } from '../../core/io/safe-write.js'
import { isGenerated } from '../../core/project/is-generated.js'
import { readState } from '../../core/sdd/state-store.js'
import type { HookHandler } from '../../core/types.js'

const PRE_COMPACT_FAILURE_LOG = 'pre-compact-failures.jsonl'
const MAX_ERR_MSG_LEN = 200

// ---------------------------------------------------------------------------
// PreCompact snapshot handler — captures milestone artifacts to .anvil/notepads/
// before context compaction discards them.
// ---------------------------------------------------------------------------

const ARTIFACT_HEAD_BYTES = 5 * 1024 // 5 KB per artifact head
const GIT_LOG_CMD = 'git log --oneline -10'

/**
 * Read the first ARTIFACT_HEAD_BYTES of a file. Returns null if not found.
 */
function readArtifactHead(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null
    const content = readFileSync(filePath, 'utf-8')
    return content.length > ARTIFACT_HEAD_BYTES
      ? `${content.slice(0, ARTIFACT_HEAD_BYTES)}\n[... truncated]`
      : content
  } catch {
    return null
  }
}

/**
 * Capture recent git log. Returns empty string on failure (e.g. not a git repo).
 */
function captureGitLog(cwd: string): string {
  try {
    return execSync(GIT_LOG_CMD, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim()
  } catch {
    return ''
  }
}

/**
 * Sanitize an ISO timestamp for use in a filename (replace colons and dots
 * with dashes to be filesystem-safe on Windows and macOS).
 */
function toFilesafeIso(ts: string): string {
  return ts.replace(/[:.]/g, '-')
}

/**
 * Phase G — PreCompact snapshot handler.
 *
 * On PreCompact event:
 * 1. Reads .anvil/state.json
 * 2. Reads heads of active artifacts (spec/plan/tasks) if feature_slug is set
 * 3. Captures recent git log
 * 4. Writes all of the above to .anvil/notepads/pre-compact-<ISO>.md
 * 5. Emits one-line user status message
 *
 * Exits 0 always. Never blocks compaction.
 */
/**
 * Append a structured failure record to ~/.anvil/logs/pre-compact-failures.jsonl.
 * Never throws — logging failures must not block compaction.
 */
async function recordFailure(
  home: string,
  cwd: string,
  step: string,
  err: unknown,
): Promise<void> {
  try {
    const logDir = join(home, '.anvil', 'logs')
    mkdirSync(logDir, { recursive: true })
    const logPath = join(logDir, PRE_COMPACT_FAILURE_LOG)
    const entry = {
      timestamp: new Date().toISOString(),
      cwd,
      step,
      error_message: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : 'UnknownError',
    }
    safeAppend(logPath, `${JSON.stringify(entry)}\n`, { maxBytes: 16 * 1024 })
  } catch {
    // Ignore — we must never block compaction
  }
}

export const preCompactSnapshotHandler: HookHandler = async (ctx) => {
  const { cwd } = ctx
  const home = ctx.env.HOME ?? homedir()
  const anvilDir = join(cwd, '.anvil')
  const notepadsDir = join(anvilDir, 'notepads')
  const iso = new Date().toISOString()
  const safeIso = toFilesafeIso(iso)
  const snapshotFilename = `pre-compact-${safeIso}.md`
  const snapshotPath = join(notepadsDir, snapshotFilename)

  // 1. Read state.json (graceful fallback if missing)
  let state: Record<string, unknown> = {}
  try {
    state = (await readState(cwd)) as Record<string, unknown>
  } catch {
    // state.json missing or invalid — snapshot with empty state
  }

  // 2. Read artifact heads if feature_slug is present
  const artifactSections: string[] = []
  try {
    const featureSlug =
      typeof state.feature_slug === 'string' && state.feature_slug.length > 0
        ? state.feature_slug
        : null

    if (featureSlug) {
      const artifactCandidates = [
        { label: 'spec', path: join(anvilDir, 'spec.md') },
        { label: 'plan', path: join(anvilDir, 'plan.md') },
        { label: 'tasks', path: join(anvilDir, 'tasks.md') },
      ]
      for (const { label, path } of artifactCandidates) {
        const head = readArtifactHead(path)
        if (head !== null) {
          artifactSections.push(`### ${label}\n\n\`\`\`\n${head}\n\`\`\``)
        }
      }
    }
  } catch (e) {
    await recordFailure(home, cwd, 'artifacts', e)
    const truncated = (e instanceof Error ? e.message : String(e)).slice(
      0,
      MAX_ERR_MSG_LEN,
    )
    return {
      exitCode: 0,
      message: `▶ pre-compact: snapshot skipped — ${truncated}`,
    }
  }

  // 3. Capture git log
  let gitLog = ''
  try {
    gitLog = captureGitLog(cwd)
  } catch (e) {
    await recordFailure(home, cwd, 'git', e)
    const truncated = (e instanceof Error ? e.message : String(e)).slice(
      0,
      MAX_ERR_MSG_LEN,
    )
    return {
      exitCode: 0,
      message: `▶ pre-compact: snapshot skipped — ${truncated}`,
    }
  }

  // 4. Compose snapshot markdown
  let content: string
  try {
    const artifactBlock =
      artifactSections.length > 0
        ? `\n## Active Artifacts\n\n${artifactSections.join('\n\n')}\n`
        : ''

    const gitBlock =
      gitLog.length > 0
        ? `\`\`\`\n${gitLog}\n\`\`\``
        : '_(no git history available)_'

    content = [
      '# Pre-Compact Snapshot',
      '',
      `**Timestamp:** ${iso}`,
      `**cwd:** ${cwd}`,
      '',
      '## State (state.json)',
      '',
      '```json',
      JSON.stringify(state, null, 2),
      '```',
      artifactBlock,
      '## Recent Commits',
      '',
      gitBlock,
      '',
    ].join('\n')
  } catch (e) {
    await recordFailure(home, cwd, 'compose', e)
    const truncated = (e instanceof Error ? e.message : String(e)).slice(
      0,
      MAX_ERR_MSG_LEN,
    )
    return {
      exitCode: 0,
      message: `▶ pre-compact: snapshot skipped — ${truncated}`,
    }
  }

  // 5. Write snapshot file
  try {
    mkdirSync(notepadsDir, { recursive: true })
    // ANV-0054: respect_generated guard — skip write if target is generated.
    if (await isGenerated(snapshotPath, cwd)) {
      process.stderr.write(
        `[anvil:pre-compact] skipping snapshot — ${snapshotPath} is marked generated\n`,
      )
      return {
        exitCode: 0,
        message: '▶ pre-compact: snapshot skipped — target is a generated file',
      }
    }
    // Snapshot bundles spec/plan/tasks heads + git log + state — well above
    // the default 64 KB cap; 1 MB is the absolute upper bound we tolerate.
    safeWrite(snapshotPath, content, { maxBytes: 1024 * 1024 })
  } catch (e) {
    await recordFailure(home, cwd, 'write', e)
    const truncated = (e instanceof Error ? e.message : String(e)).slice(
      0,
      MAX_ERR_MSG_LEN,
    )
    return {
      exitCode: 0,
      message: `▶ pre-compact: snapshot skipped — ${truncated}`,
    }
  }

  return {
    exitCode: 0,
    message: `▶ Anvil saved a pre-compact snapshot to .anvil/notepads/${snapshotFilename}`,
  }
}
