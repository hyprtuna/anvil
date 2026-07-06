import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveConfig } from '../core/config/load.js'
import { buildPreset } from '../core/config/presets.js'
import {
  DEFAULT_EXPECTED_TOKENS_WARN,
  type ExpectedTokensAggregate,
  formatExpectedTokensSummary,
  shouldWarnBundle,
} from '../core/expected-tokens.js'
import {
  ANVIL_OC_ROUTING_CONTENT,
  ANVIL_ROUTING_RULES_CONTENT,
  OC_ROUTING_MARKER_CLOSE,
  OC_ROUTING_MARKER_OPEN,
} from '../core/routing-rules-content.js'
import type {
  AnvilHomeManifest,
  AnvilHomeManifestSkill,
  ManifestReadResult,
  ModelsConfig,
  PresetName,
  Scope,
  Skill,
  Target,
} from '../core/types.js'
import { writeManyAtomic } from './atomic.js'
import { buildInstallPlan } from './plan.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const SKILLS_ROOT = join(REPO_ROOT, 'skills')
const AGENTS_ROOT = join(REPO_ROOT, 'agents')

export interface InstallOptions {
  target: Target
  scope: Scope
  preset: PresetName
  cwd?: string
  home?: string
  dryRun?: boolean
  /**
   * Plan 31 B5: When true, overwrite a divergent `.claude/rules/anvil-routing.md`
   * instead of writing it to the `.new` sibling.
   */
  force?: boolean
  /**
   * Optional pre-resolved config. When supplied it overrides `preset` — used by
   * `runUpgrade` to preserve an existing `.anvil/models.json` across runs.
   */
  config?: ModelsConfig
  /**
   * ANV-0114 — suppress the cumulative expected-token warning even when the
   * selection-wide sum exceeds the configured threshold. The aggregate is
   * still computed and returned in `InstallSummary.expectedTokens` so the
   * caller can render it; only the `warnings[]` entry is omitted.
   */
  allowLargeBundle?: boolean
}

export interface InstallSummary {
  dryRun: boolean
  filesWritten: string[]
  /** Paths that were written but then rolled back due to a mid-write failure. */
  rolledBack: string[]
  adapters: Array<{ name: string; count: number }>
  /**
   * Plan 31 B5: non-blocking warnings emitted during install (e.g. divergent
   * `.claude/rules/anvil-routing.md` written to `.new` sibling).
   */
  warnings: string[]
  /**
   * ANV-0114 — cumulative expected-token summary for the selection.
   * Always populated (even on --dry-run / zero-skill installs); a missing
   * field would force every caller to null-check, so we surface a complete
   * aggregate including the zero case.
   */
  expectedTokens: ExpectedTokensAggregate
  /**
   * ANV-0114 — human-readable install-summary line corresponding to
   * `expectedTokens` (e.g. "selected 12 skills + 5 agents = ~38k expected tokens").
   * The CLI / TUI prints this verbatim above the file-write list.
   */
  expectedTokensLine: string
}

export const runInstaller: import('./interface.js').InstallerFn = async (
  opts: InstallOptions,
): Promise<InstallSummary> => {
  const cwd = opts.cwd ?? process.cwd()
  const config: ModelsConfig = opts.config ?? buildPreset(opts.preset)
  const plan = await buildInstallPlan({
    cwd,
    scope: opts.scope,
    target: opts.target,
    config,
    skillsRoot: SKILLS_ROOT,
    agentsRoot: AGENTS_ROOT,
    home: opts.home,
  })

  // ANV-0114 — compute the bundle warning once; reused for both dry-run and
  // real-run summaries so the caller sees identical telemetry.
  const expectedTokensLine = formatExpectedTokensSummary(plan.expectedTokens)
  const bundleThreshold =
    config.compression?.expected_tokens_warn ?? DEFAULT_EXPECTED_TOKENS_WARN
  const bundleWarning =
    !opts.allowLargeBundle &&
    shouldWarnBundle(plan.expectedTokens, bundleThreshold)
      ? `cumulative expected_tokens (~${plan.expectedTokens.totalKnown}) exceeds threshold ${bundleThreshold} — re-run with --allow-large-bundle to suppress`
      : null

  if (opts.dryRun) {
    return {
      dryRun: true,
      filesWritten: plan.adapters.flatMap((a) =>
        a.files.map((f) => join(a.installRoot, f.relativePath)),
      ),
      rolledBack: [],
      adapters: plan.adapters.map((a) => ({
        name: a.adapterName,
        count: a.files.length,
      })),
      warnings: bundleWarning ? [bundleWarning] : [],
      expectedTokens: plan.expectedTokens,
      expectedTokensLine,
    }
  }

  await saveConfig(config, { scope: opts.scope, cwd, home: opts.home })
  const filesWritten: string[] = []
  const rolledBack: string[] = []
  const warnings: string[] = []
  if (bundleWarning) warnings.push(bundleWarning)
  try {
    for (const adapterFiles of plan.adapters) {
      const written = await writeManyAtomic(
        adapterFiles.installRoot,
        adapterFiles.files,
        {
          onRollback: (paths) => {
            rolledBack.push(...paths)
          },
        },
      )
      filesWritten.push(...written)
    }
  } catch (err) {
    const installErr = new Error(
      `install failed mid-write; ${rolledBack.length} file(s) have been rolled back`,
    ) as Error & { rolledBack: string[] }
    installErr.rolledBack = rolledBack
    installErr.cause = err
    throw installErr
  }

  // Plan 31 B5: write .claude/rules/anvil-routing.md with idempotency + .new fallback.
  // Only when targeting Claude Code or both.
  if (opts.target === 'claude-code' || opts.target === 'both') {
    const routingWarning = await writeRoutingRules(cwd, opts.force ?? false)
    if (routingWarning) {
      warnings.push(routingWarning)
      filesWritten.push(routingWarning.split('"')[1] ?? '')
    } else {
      filesWritten.push(join(cwd, '.claude', 'rules', 'anvil-routing.md'))
    }
  }

  // Plan 32 F2: write AGENTS.md routing block for OpenCode.
  // Only when targeting OpenCode or both.
  if (opts.target === 'opencode' || opts.target === 'both') {
    const agentsWarning = await writeOpenCodeStandingInstructions(
      cwd,
      opts.force ?? false,
    )
    if (agentsWarning) {
      warnings.push(agentsWarning)
    } else {
      filesWritten.push(join(cwd, 'AGENTS.md'))
    }
  }

  // Plan 31 F7: ensure .anvil/notepads/, .anvil/archive/, and
  // .anvil/active-routing.json are in the project's .gitignore.
  // ANV-0124 / ANV-0126: .anvil/runtime/ holds rule-reinforcement turn
  // counters and pre-compact sidecars; never check those in.
  await ensureGitignoreEntries(cwd, [
    '.anvil/notepads/',
    '.anvil/archive/',
    '.anvil/active-routing.json',
    '.anvil/runtime/',
  ])

  // Plan 36 Phase C: copy SDD skeleton templates to <cwd>/templates/.
  // Always written regardless of target — templates are platform-agnostic.
  const templateFiles = await writeProjectTemplates(cwd)
  filesWritten.push(...templateFiles)

  // ANV-0014: record the install target + skill manifest in ~/.anvil/manifest.json.
  // Skills array enables the OpenCode plugin to discover enabled skills without
  // fixture edits. Previously only `installedTarget` + `installedAt` were written.
  const anvilHomeDir = join(opts.home ?? process.env.HOME ?? '/tmp', '.anvil')
  await writeAnvilManifest(anvilHomeDir, opts.target, plan.skills)

  return {
    dryRun: false,
    filesWritten,
    rolledBack: [],
    adapters: plan.adapters.map((a) => ({
      name: a.adapterName,
      count: a.files.length,
    })),
    warnings,
    expectedTokens: plan.expectedTokens,
    expectedTokensLine,
  }
}

// ─── Plan 31 B5 — routing rules writer ──────────────────────────────────────

/**
 * Write `.claude/rules/anvil-routing.md` in the project directory.
 *
 * Idempotency rules:
 *   - File missing → write canonical content.
 *   - File present, byte-identical to canonical → skip silently.
 *   - File present, divergent, force=false → write canonical to `.new` sibling;
 *     return a non-blocking warning message.
 *   - File present, divergent, force=true → overwrite with canonical; return null.
 *
 * Returns a warning string when the `.new` path was used, otherwise null.
 */
export async function writeRoutingRules(
  cwd: string,
  force: boolean,
): Promise<string | null> {
  const rulesDir = join(cwd, '.claude', 'rules')
  const rulesPath = join(rulesDir, 'anvil-routing.md')
  const canonical = ANVIL_ROUTING_RULES_CONTENT

  // Ensure directory exists.
  await mkdir(rulesDir, { recursive: true })

  let existing: string | null = null
  try {
    existing = await readFile(rulesPath, 'utf-8')
  } catch {
    // File doesn't exist — fall through to write.
  }

  if (existing === null) {
    // Fresh install — write canonical.
    const tmpPath = `${rulesPath}.tmp`
    await writeFile(tmpPath, canonical, 'utf-8')
    await rename(tmpPath, rulesPath)
    return null
  }

  if (existing === canonical) {
    // Byte-identical — skip silently.
    return null
  }

  if (force) {
    // Force overwrite.
    const tmpPath = `${rulesPath}.tmp`
    await writeFile(tmpPath, canonical, 'utf-8')
    await rename(tmpPath, rulesPath)
    return null
  }

  // Divergent and not force — write to .new sibling and warn.
  const newPath = `${rulesPath}.new`
  await writeFile(newPath, canonical, 'utf-8')
  return `divergent .claude/rules/anvil-routing.md — canonical written to "${newPath}" (re-run with --force to overwrite)`
}

// ─── Plan 31 F7 — .gitignore updater ────────────────────────────────────────

/**
 * Ensure that each of the given `entries` is present in the project's
 * `.gitignore`. Idempotent — never adds a duplicate line.
 * Creates `.gitignore` if it does not exist.
 * Uses atomic write (tmp → rename) to avoid corruption.
 */
export async function ensureGitignoreEntries(
  cwd: string,
  entries: string[],
): Promise<void> {
  const gitignorePath = join(cwd, '.gitignore')

  let existing = ''
  try {
    existing = await readFile(gitignorePath, 'utf-8')
  } catch {
    // File doesn't exist — will create it
  }

  const lines = existing.split('\n')
  const missing = entries.filter((e) => !lines.some((l) => l.trim() === e))

  if (missing.length === 0) return // Already present — no-op

  const section = ['', '# Anvil runtime state (Plan 31 F7)', ...missing].join(
    '\n',
  )

  const updated = `${existing.trimEnd()}${section}\n`
  const tmpPath = `${gitignorePath}.tmp`
  await writeFile(tmpPath, updated, 'utf-8')
  await rename(tmpPath, gitignorePath)
}

// ─── Plan 36 Phase C — SDD skeleton template writer ─────────────────────────

const TEMPLATES_ROOT = join(REPO_ROOT, 'templates')
const SDD_TEMPLATES = ['spec.md', 'plan.md', 'tasks.md'] as const

/**
 * Copy SDD skeleton templates (spec.md, plan.md, tasks.md) from the repo's
 * `templates/` directory to `<cwd>/templates/`. Idempotent — skips files that
 * already match content. Returns absolute paths of files written.
 */
export async function writeProjectTemplates(cwd: string): Promise<string[]> {
  const destDir = join(cwd, 'templates')
  await mkdir(destDir, { recursive: true })

  const written: string[] = []
  for (const name of SDD_TEMPLATES) {
    const srcPath = join(TEMPLATES_ROOT, name)
    const destPath = join(destDir, name)
    let src: string
    try {
      src = await readFile(srcPath, 'utf-8')
    } catch {
      // Template source missing (e.g. running from a stripped bundle that
      // didn't include the templates dir). Skip gracefully.
      continue
    }

    // Idempotency: skip if content already matches.
    let existing = ''
    try {
      existing = await readFile(destPath, 'utf-8')
    } catch {
      // File not present — fall through to write.
    }
    if (existing === src) continue

    const tmpPath = `${destPath}.tmp`
    await writeFile(tmpPath, src, 'utf-8')
    await rename(tmpPath, destPath)
    written.push(destPath)
  }
  return written
}

// ─── Plan 32 F2/F3 — OpenCode AGENTS.md routing block writer ────────────────

/**
 * Write or update the Anvil routing block inside `AGENTS.md` at the project root.
 *
 * The block is delimited by HTML comment markers so it can be updated without
 * clobbering other AGENTS.md content:
 *
 *   <!-- anvil-routing -->
 *   ## Anvil routing — standing instructions
 *   ...
 *   <!-- /anvil-routing -->
 *
 * Idempotency rules (Plan 32 F3):
 *   - File missing → create with the marker block (and a heading if the file
 *     is brand new).
 *   - Marker block present, byte-identical to canonical → skip silently.
 *   - Marker block present, drifted, force=false → update the block in place;
 *     return a notice string (non-blocking).
 *   - Marker block present, drifted, force=true → update silently; return null.
 *   - File present, no marker block → append the marker block.
 *
 * Returns a notice string when the block was updated (informational only),
 * otherwise null.
 *
 * See ADR: .anvil/_archive/docs-anvil/specs/2026-04-26-opencode-standing-instructions.md
 */
export async function writeOpenCodeStandingInstructions(
  cwd: string,
  force: boolean,
): Promise<string | null> {
  const agentsPath = join(cwd, 'AGENTS.md')
  const canonicalBlock = [
    OC_ROUTING_MARKER_OPEN,
    ANVIL_OC_ROUTING_CONTENT.trimEnd(),
    OC_ROUTING_MARKER_CLOSE,
  ].join('\n')

  let existing: string | null = null
  try {
    existing = await readFile(agentsPath, 'utf-8')
  } catch {
    // File doesn't exist — create it.
  }

  if (existing === null) {
    // Fresh file — write heading + marker block.
    const content = `# AGENTS.md\n\n${canonicalBlock}\n`
    const tmpPath = `${agentsPath}.tmp`
    await writeFile(tmpPath, content, 'utf-8')
    await rename(tmpPath, agentsPath)
    return null
  }

  // Check if the marker block already exists.
  const openIdx = existing.indexOf(OC_ROUTING_MARKER_OPEN)
  const closeIdx = existing.indexOf(OC_ROUTING_MARKER_CLOSE)

  if (openIdx === -1 || closeIdx === -1 || openIdx >= closeIdx) {
    // No marker block — append it.
    const separator = existing.trimEnd().length > 0 ? '\n\n' : ''
    const updated = `${existing.trimEnd()}${separator}${canonicalBlock}\n`
    const tmpPath = `${agentsPath}.tmp`
    await writeFile(tmpPath, updated, 'utf-8')
    await rename(tmpPath, agentsPath)
    return null
  }

  // Marker block present — extract and compare.
  const existingBlock = existing.slice(
    openIdx,
    closeIdx + OC_ROUTING_MARKER_CLOSE.length,
  )

  if (existingBlock === canonicalBlock) {
    // Already canonical — skip silently.
    return null
  }

  // Block has drifted — replace it in place.
  const updated =
    existing.slice(0, openIdx) +
    canonicalBlock +
    existing.slice(closeIdx + OC_ROUTING_MARKER_CLOSE.length)

  const tmpPath = `${agentsPath}.tmp`
  await writeFile(tmpPath, updated, 'utf-8')
  await rename(tmpPath, agentsPath)

  if (!force) {
    return 'AGENTS.md routing block updated to canonical content (re-run with --force to suppress this notice)'
  }
  return null
}

/**
 * Remove the Anvil routing marker block from `AGENTS.md` (Plan 32 F4).
 *
 * If the file contains other content outside the markers, the file is
 * preserved — only the marked block is removed.
 * If the file would become empty (or whitespace-only) after removal, the
 * entire file is removed.
 *
 * Returns `true` when something was removed, `false` when there was nothing
 * to remove (missing file or missing marker).
 */
export async function removeOpenCodeStandingInstructions(
  cwd: string,
): Promise<boolean> {
  const agentsPath = join(cwd, 'AGENTS.md')

  let existing: string
  try {
    existing = await readFile(agentsPath, 'utf-8')
  } catch {
    return false // File doesn't exist — nothing to do.
  }

  const openIdx = existing.indexOf(OC_ROUTING_MARKER_OPEN)
  const closeIdx = existing.indexOf(OC_ROUTING_MARKER_CLOSE)

  if (openIdx === -1 || closeIdx === -1 || openIdx >= closeIdx) {
    return false // No marker block — nothing to remove.
  }

  // Remove the marker block and any leading blank line before it.
  const blockEnd = closeIdx + OC_ROUTING_MARKER_CLOSE.length
  let before = existing.slice(0, openIdx)
  const after = existing.slice(blockEnd)

  // Strip a trailing blank line that was used as separator before the block.
  before = before.replace(/\n\n$/, '\n')

  const updated = (before + after).trimEnd()

  if (updated.replace(/\s/g, '').length === 0) {
    // File is now empty — remove it entirely.
    const { rm } = await import('node:fs/promises')
    await rm(agentsPath, { force: true })
    return true
  }

  const tmpPath = `${agentsPath}.tmp`
  await writeFile(tmpPath, `${updated}\n`, 'utf-8')
  await rename(tmpPath, agentsPath)
  return true
}

// ─── ANV-0014 — install manifest writer (versioned, skills array) ────────────

/**
 * Build the `AnvilHomeManifestSkill` entry list from the loaded skill registry.
 * All bundled skills are enabled by default at install time. The preset-pruned
 * disable list is stored in `models.json` (disabled.skills); this manifest
 * reflects what was staged, not what the user has subsequently toggled.
 */
function buildManifestSkills(skills: Skill[]): AnvilHomeManifestSkill[] {
  return skills.map((s) => ({
    name: s.frontmatter.name,
    enabled: true,
    sourcePath: s.sourcePath,
    public: s.frontmatter['user-invocable'] ?? true,
  }))
}

/**
 * Write (or update) ~/.anvil/manifest.json with the versioned AnvilHomeManifest
 * shape (ANV-0014). Includes the `skills` array so the OpenCode plugin can
 * discover enabled skill directories without fixture edits.
 *
 * `schemaVersion: "anvil.opencode.v1"` is the contract identifier — the plugin
 * reader asserts this field before processing the skills list.
 *
 * Idempotent: safe to call on every install invocation.
 */
export async function writeAnvilManifest(
  anvilHome: string,
  target: 'claude-code' | 'opencode' | 'both',
  skills: Skill[] = [],
): Promise<void> {
  const manifestPath = join(anvilHome, 'manifest.json')
  const manifest: AnvilHomeManifest = {
    schemaVersion: 'anvil.opencode.v1',
    installedTarget: target,
    installedAt: new Date().toISOString(),
    skills: buildManifestSkills(skills),
  }
  const tmpPath = `${manifestPath}.tmp`
  await mkdir(anvilHome, { recursive: true })
  await writeFile(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  await rename(tmpPath, manifestPath)
}

/**
 * Read ~/.anvil/manifest.json and return the recorded install target.
 *
 * v0.10.9 E-003: returns a discriminated `ManifestReadResult` so callers can
 * distinguish a legitimately absent manifest (pre-v0.9.0 installs, fresh
 * environments) from a corrupt one. The pre-v0.10.9 shape collapsed both
 * cases into `null`, which prevented doctor / wiring checks from surfacing
 * actually-broken JSON.
 */
export type AnvilManifestTarget = 'claude-code' | 'opencode' | 'both'

export async function readAnvilManifestTarget(
  anvilHome: string,
): Promise<ManifestReadResult<AnvilManifestTarget>> {
  const manifestPath = join(anvilHome, 'manifest.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { present: false }
    return {
      present: true,
      error: `read failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return {
      present: true,
      error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { present: true, error: 'expected JSON object at top level' }
  }
  const t = (parsed as Record<string, unknown>).installedTarget
  if (t === 'claude-code' || t === 'opencode' || t === 'both') {
    return { present: true, value: t }
  }
  return {
    present: true,
    error: `installedTarget missing or invalid (got ${typeof t === 'string' ? `"${t}"` : typeof t})`,
  }
}
