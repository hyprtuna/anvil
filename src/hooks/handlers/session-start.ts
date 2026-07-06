import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  loadPhaseContext,
  renderArtifactBlock,
} from '../../core/context/artifact-loader.js'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../core/io/project-scoped-paths.js'
import { safeWrite } from '../../core/io/safe-write.js'
import { detectBranch, loadRecentContext } from '../../core/notepads/index.js'
import { detectProject } from '../../core/project/detect.js'
import { isGenerated } from '../../core/project/is-generated.js'
import { findProjectRoot } from '../../core/project/root.js'
import { readState } from '../../core/sdd/state-store.js'
import type { HookHandler, ProjectContext } from '../../core/types.js'
import { createSystemDirective } from '../system-directive.js'
import { buildSessionStartRestoreDigest } from './pre-compact/restore.js'
import { SESSION_START_BUDGET_CHARS } from './session-start/budget.js'
import {
  DEFAULT_STARTUP_SECTION_PRIORITIES,
  compactStructuralSections,
} from './session-start/compaction.js'
import { preCompactRestoreCharBudget } from './session-start/shared-budget.js'

/**
 * Plan 31 F8 — max chars for notepad auto-load at SessionStart.
 * Token cap: 500 tokens × 4 chars/token = 2000 chars.
 * Uses chars/4 approximation (avoids tokenizer dependency at hook time).
 */
const NOTEPAD_MAX_CHARS = 500 * 4

/**
 * Reads names of installed .md files from a directory.
 * Skips doc files (CLAUDE.md, AGENTS.md, README.md — uppercase first letter).
 * Returns an empty array if the directory is missing or unreadable.
 */
async function readMdNames(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir)
    return entries
      .filter((e) => e.endsWith('.md') && !/^[A-Z]/.test(e))
      .map((e) => e.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

/**
 * Resolves the skill and agent directories from the installed Anvil layout.
 *
 * Resolution order (first found wins):
 * 1. `{cwd}/.claude/skills` and `{cwd}/.claude/agents` — project-scoped install
 *    (installer symlinks these from {anvil-home}/skills + agents).
 * 2. `{HOME}/.claude/skills` and `{HOME}/.claude/agents` — user-scoped install.
 * 3. `{HOME}/.anvil/skills` and `{HOME}/.anvil/agents` — direct Anvil home.
 *
 * Returns undefined when no install is found.
 */
function resolveInstalledPaths(
  cwd: string,
): { skillsDir: string; agentsDir: string } | undefined {
  const home = homedir()
  const candidates = [
    {
      skillsDir: join(cwd, '.claude', 'skills'),
      agentsDir: join(cwd, '.claude', 'agents'),
    },
    {
      skillsDir: join(home, '.claude', 'skills'),
      agentsDir: join(home, '.claude', 'agents'),
    },
    {
      skillsDir: join(home, '.anvil', 'skills'),
      agentsDir: join(home, '.anvil', 'agents'),
    },
  ]
  for (const c of candidates) {
    if (existsSync(c.skillsDir) || existsSync(c.agentsDir)) return c
  }
  return undefined
}

/**
 * Scans the skills directory recursively (one level of language subdirs)
 * for skill names. Mirrors the structure: skills/universal/*.md and
 * skills/languages/<lang>/*.md → extracts basename without .md extension.
 */
async function readSkillNames(skillsDir: string): Promise<string[]> {
  if (!existsSync(skillsDir)) return []
  const names: string[] = []
  try {
    const top = await readdir(skillsDir)
    for (const entry of top) {
      if (entry === 'universal') {
        const universalDir = join(skillsDir, 'universal')
        names.push(...(await readMdNames(universalDir)))
      } else if (entry === 'languages') {
        const langsDir = join(skillsDir, 'languages')
        if (existsSync(langsDir)) {
          const langs = await readdir(langsDir).catch(() => [])
          for (const lang of langs) {
            names.push(...(await readMdNames(join(langsDir, lang))))
          }
        }
      }
    }
    // Flat layout (installed symlink may be flat)
    if (names.length === 0) names.push(...(await readMdNames(skillsDir)))
  } catch {
    // Best-effort
  }
  return names
}

export const sessionStartHandler: HookHandler = async (ctx) => {
  try {
    const project = await detectProject(ctx.cwd)
    const primaryLang = project.languages[0]?.name ?? 'unknown'
    const fwInfo = project.frameworks.length
      ? ` + ${project.frameworks.join(', ')}`
      : ''

    // Plan 31 A3: pre-load skill and agent registry names from the installed
    // layout and persist to .anvil/registry.json so user-prompt-submit can
    // pass live Sets to the router instead of empty Sets.
    const paths = resolveInstalledPaths(ctx.cwd)
    const [skillNames, agentNames] = await Promise.all([
      paths ? readSkillNames(paths.skillsDir) : Promise.resolve([]),
      paths ? readMdNames(paths.agentsDir) : Promise.resolve([]),
    ])

    // ANV-0139: resolve the canonical project root once so writes target the
    // canonical .anvil/ rather than the worktree-cwd (linked worktrees have
    // no .anvil/ of their own and the reads in user-prompt-submit look at
    // the canonical root).
    const projectRoot = (await findProjectRoot(ctx.cwd)) ?? ctx.cwd

    await Promise.all([
      writeRegistry(projectRoot, skillNames, agentNames),
      writeProject(projectRoot, project),
    ])

    // Plan 31 F5: load per-branch recent-context.md and emit on systemInsert.
    // Token cap: 500 tokens ≈ 2000 chars (chars/4 approximation).
    // Silent no-op when no notepad exists; warning logged on read failure.
    const branch = detectBranch(ctx.cwd)
    let recentContext: string | undefined
    try {
      const rc = await loadRecentContext(ctx.cwd, branch, NOTEPAD_MAX_CHARS)
      recentContext = rc || undefined
    } catch {
      // Never block session start on notepad errors
      recentContext = undefined
    }

    // ANV-0019: phase-aware artifact context. Reads the SDD state to
    // determine the current phase, resolves the declarative manifest,
    // truncates per per-artefact maxBytes, and enforces a 6 KB aggregate
    // cap. Failures here are non-blocking — SessionStart MUST never abort
    // on missing artefacts.
    let artifactBlock: string | undefined
    try {
      const state = await readState(ctx.cwd)
      const phase = state.phase ?? 'none'
      const featureSlug = state.feature_slug
      if (phase !== 'none') {
        const loaded = await loadPhaseContext({
          cwd: ctx.cwd,
          phase,
          featureSlug,
          emitObservability: true,
        })
        for (const w of loaded.warnings) {
          // Non-blocking — surface as stderr so the user sees what was
          // missing or truncated.
          process.stderr.write(`${w}\n`)
        }
        artifactBlock = renderArtifactBlock(loaded, phase)
      }
    } catch {
      // Never block session start on artifact-loader errors.
      artifactBlock = undefined
    }

    // ANV-0126 — try to load a pre-compact restore digest. When a sidecar
    // exists within the configured window, render a compact
    // <session-restore> envelope so the model re-orients to the prior
    // routing/skill state. Failures here are non-blocking — never abort
    // SessionStart on restore-digest errors.
    let restoreDigest: string | undefined
    try {
      const digest = await buildSessionStartRestoreDigest({
        cwd: ctx.cwd,
        config: ctx.config,
        env: ctx.env,
      })
      if (digest) {
        // Clamp the restore digest to its shared-budget reservation so a
        // rogue sidecar cannot starve other SessionStart fragments.
        const cap = preCompactRestoreCharBudget()
        restoreDigest =
          digest.length > cap
            ? `${digest.slice(0, Math.max(0, cap - 1))}…`
            : digest
      }
    } catch {
      restoreDigest = undefined
    }

    // Compose the systemInsert. Recent context wins precedence for back-
    // compat with Plan 31 F5; the artifact block is appended when present;
    // the pre-compact restore digest (ANV-0126) is appended last so it is
    // the most-recent context the model sees.
    const rawBody = [recentContext, artifactBlock, restoreDigest]
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .join('\n\n')

    // ANV-0118: compact known structural sections (e.g. <anvil_skills>,
    // <anvil_agents>) before the dispatcher applies fragment-level budget
    // aggregation. Sections are stripped in priority order (lowest first)
    // until the body fits within the configured SessionStart budget.
    // Pairs with ANV-0056: this trims a single fragment in-place so the
    // dispatcher does not have to drop the whole fragment for size alone.
    const budgetChars =
      ctx.config.hooks?.session_start?.budget_chars ??
      SESSION_START_BUDGET_CHARS
    const directiveBody =
      budgetChars > 0
        ? compactStructuralSections(rawBody, budgetChars, [
            ...DEFAULT_STARTUP_SECTION_PRIORITIES,
          ])
        : rawBody

    return {
      exitCode: 0,
      message: `anvil ready: ${primaryLang}${fwInfo}`,
      ...(directiveBody
        ? {
            systemInsert: createSystemDirective('BOOTSTRAP', directiveBody),
          }
        : {}),
      context: {
        project,
        registry: { skills: skillNames, agents: agentNames },
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { exitCode: 1, message: `project detection failed: ${msg}` }
  }
}

async function writeRegistry(
  cwd: string,
  skills: string[],
  agents: string[],
): Promise<void> {
  try {
    await ensureProjectDir(cwd)
    const registryPath = await getProjectScopedPath(cwd, 'registry')
    // ANV-0054: respect_generated guard — skip write if target is generated.
    if (await isGenerated(registryPath, cwd)) {
      process.stderr.write(
        '[anvil:session-start] skipping registry.json — file is marked generated\n',
      )
      return
    }
    safeWrite(
      registryPath,
      JSON.stringify({ skills, agents, at: new Date().toISOString() }, null, 2),
      { maxBytes: 256 * 1024 },
    )
  } catch {
    // Best-effort — never block session start on disk errors.
  }
}

async function writeProject(
  cwd: string,
  project: ProjectContext,
): Promise<void> {
  try {
    await ensureProjectDir(cwd)
    const projectPath = await getProjectScopedPath(cwd, 'project')
    // ANV-0054: respect_generated guard — skip write if target is generated.
    if (await isGenerated(projectPath, cwd)) {
      process.stderr.write(
        '[anvil:session-start] skipping project.json — file is marked generated\n',
      )
      return
    }
    safeWrite(projectPath, JSON.stringify(project, null, 2), {
      maxBytes: 128 * 1024,
    })
  } catch {
    // Best-effort — never block session start on disk errors.
  }
}
