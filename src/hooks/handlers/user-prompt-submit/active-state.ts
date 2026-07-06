/**
 * Active-state writers for user-prompt-submit (Plan 43 Phase H, ANV-0043).
 *
 * Writes:
 *   ~/.anvil/sessions/<sha256(transcriptPath)[:16]>/active-skill.json
 *   ~/.anvil/sessions/<sha256(transcriptPath)[:16]>/active-routing.json
 *
 * The per-session path prevents concurrent CC/OC sessions in the same project
 * from clobbering each other (ANV-0043). When `transcriptPath` is unavailable
 * (legacy or test callers), falls back to the legacy project-relative paths:
 *   {cwd}/.anvil/active-skill.json
 *   {cwd}/.anvil/active-routing.json
 *
 * Both are best-effort — failures log under ANVIL_VERBOSE and never block
 * the prompt. `active-routing.json` writes via .tmp + rename for atomicity.
 */

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../../core/io/project-scoped-paths.js'
import { safeWrite } from '../../../core/io/safe-write.js'
import {
  ensureSessionDir,
  getSessionScopedPath,
} from '../../../core/io/session-scoped-paths.js'
import type { RoutingDecision, SkillScope } from '../../../core/types.js'

/**
 * ANV-0123 — best-effort lookup of a skill's loaded scope by filesystem
 * stat against the same candidate paths the loader scans. Used by the
 * routing trace so debugging shadowing is easy.
 *
 * Returns 'project', 'home', 'bundled' (in that precedence order) or
 * undefined when no file exists at any candidate. This is intentionally
 * lighter than running the full loader at hook time — we only need the
 * scope label, not the body.
 */
export function findSkillScope(
  cwd: string,
  slug: string,
): SkillScope | undefined {
  const home = homedir()
  const anvilHome =
    process.env.ANVIL_HOME ?? join(process.env.HOME ?? home, '.anvil')

  // Project candidates (precedence 1)
  for (const root of [
    join(cwd, '.claude', 'skills'),
    join(cwd, '.opencode', 'skills'),
  ]) {
    if (skillFileExistsAt(root, slug)) return 'project'
  }
  // Home candidates (precedence 2)
  for (const root of [
    join(anvilHome, 'skills'),
    join(home, '.claude', 'skills'),
    join(home, '.opencode', 'skills'),
    join(anvilHome, 'managed-skills'),
    join(anvilHome, 'plugin-skills'),
  ]) {
    if (skillFileExistsAt(root, slug)) return 'home'
  }
  // Bundled candidate (precedence 3) — Anvil source-tree skills/
  const bundled = join(cwd, 'skills')
  if (skillFileExistsAt(bundled, slug)) return 'bundled'

  return undefined
}

function skillFileExistsAt(root: string, slug: string): boolean {
  if (!existsSync(root)) return false
  // Layouts considered:
  //   {root}/<slug>.md
  //   {root}/<slug>/SKILL.md
  //   {root}/universal/<slug>.md
  //   {root}/languages/<lang>/<slug>.md
  if (existsSync(join(root, `${slug}.md`))) return true
  if (existsSync(join(root, slug, 'SKILL.md'))) return true
  if (existsSync(join(root, 'universal', `${slug}.md`))) return true
  const langsDir = join(root, 'languages')
  if (existsSync(langsDir)) {
    try {
      for (const lang of readdirSync(langsDir)) {
        if (existsSync(join(langsDir, lang, `${slug}.md`))) return true
      }
    } catch {
      // unreadable — fall through
    }
  }
  return false
}

// ─── Transcript-path extraction ───────────────────────────────────────────────

/**
 * Extract `transcript_path` from the hook payload.
 * Returns `undefined` when the payload is a plain string or lacks the field.
 */
export function extractTranscriptPath(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const p = payload as Record<string, unknown>
  return typeof p.transcript_path === 'string' ? p.transcript_path : undefined
}

// ─── Writers ──────────────────────────────────────────────────────────────────

export async function writeActiveSkill(
  cwd: string,
  decision: RoutingDecision,
  transcriptPath?: string,
): Promise<void> {
  const skill = decision.skills[0]
  if (!skill) return

  // ANV-0123 — include the winning scope so debugging shadowing is easy.
  // Best-effort: an unresolved scope omits the field entirely (back-compat
  // with downstream consumers reading the existing 3-field shape).
  const scope = findSkillScope(cwd, skill)
  const payload = JSON.stringify(
    {
      name: skill,
      intent: decision.intent,
      at: new Date().toISOString(),
      ...(scope ? { scope } : {}),
    },
    null,
    2,
  )

  if (transcriptPath) {
    // ANV-0043: session-scoped path
    try {
      ensureSessionDir(transcriptPath)
      safeWrite(getSessionScopedPath(transcriptPath, 'active-skill'), payload)
    } catch (err) {
      if (process.env.ANVIL_VERBOSE) {
        console.warn(
          '[user-prompt-submit] active-skill (session) write failed:',
          err,
        )
      }
    }
  } else {
    // Per-project path (migrates legacy .anvil/<name>.json on first ensure)
    try {
      await ensureProjectDir(cwd)
      const path = await getProjectScopedPath(cwd, 'active-skill')
      safeWrite(path, payload)
    } catch (err) {
      if (process.env.ANVIL_VERBOSE) {
        console.warn('[user-prompt-submit] active-skill write failed:', err)
      }
    }
  }
}

export async function writeActiveRouting(
  cwd: string,
  systemInsert: string,
  prompt: string,
  transcriptPath?: string,
): Promise<void> {
  const payload = JSON.stringify(
    { systemInsert, prompt, timestamp: new Date().toISOString() },
    null,
    2,
  )

  if (transcriptPath) {
    // ANV-0043: session-scoped path
    try {
      ensureSessionDir(transcriptPath)
      // safeWrite handles atomic temp+rename internally with O_NOFOLLOW.
      safeWrite(
        getSessionScopedPath(transcriptPath, 'active-routing'),
        payload,
        {
          maxBytes: 256 * 1024,
        },
      )
    } catch (err) {
      if (process.env.ANVIL_VERBOSE) {
        console.warn(
          '[user-prompt-submit] active-routing (session) write failed:',
          err,
        )
      }
    }
  } else {
    // Per-project path (migrates legacy .anvil/<name>.json on first ensure)
    try {
      await ensureProjectDir(cwd)
      const path = await getProjectScopedPath(cwd, 'active-routing')
      // safeWrite handles the atomic temp+rename internally with O_NOFOLLOW.
      safeWrite(path, payload, { maxBytes: 256 * 1024 })
    } catch (err) {
      if (process.env.ANVIL_VERBOSE) {
        console.warn('[user-prompt-submit] active-routing write failed:', err)
      }
    }
  }
}
