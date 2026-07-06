/**
 * ANV-0141 — Capability category doctor checks.
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Keeps `function pushXyzCheck(checks: Check[])` signatures intact.
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 *
 * ANV-0033 — Extends this file with four DoctorCheck-registry rows:
 *   snapshot-integrity, snapshot-freshness, model-provenance,
 *   fallback-chain-coverage. See bottom of file.
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { lintBootstrapSkew } from '../../../core/bootstrap-skew/index.js'
import {
  type SkillValidationInput,
  pushSkillBehaviorValidationRows,
} from '../doctor-skills-validation.js'
import { walkSlugFiles } from './architecture.js'

// Local mirror of the Check interface from doctor.ts (same shape).
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * ANV-0001 — Per-adapter bootstrap status row.
 *
 * Reports whether the bootstrap skill (`skills/using-anvil/SKILL.md`) is
 * present and non-empty for each adapter:
 *   - Claude Code: file must exist under the installed skills/ tree.
 *   - OpenCode: file must exist in ~/.anvil/skills/using-anvil/SKILL.md.
 *
 * When bootstrap content cannot be located for ANY adapter, the row emits
 * `fail`, causing `anvil doctor` to exit non-zero (acceptance criterion 3).
 *
 * Exported for unit testing.
 */
export function pushAdapterBootstrapCheck(
  checks: Check[],
  cwd: string,
  anvilHome: string,
): void {
  // Claude Code bootstrap path: project-scoped plugin writes skills under
  // .claude-plugin/skills/ — but the canonical source is the repo skills/ tree.
  // For an installed global layout the skills land in anvilHome/skills/.
  // We check both: project-local first, then global installed.
  const ccProjectBootstrap = join(
    cwd,
    '.claude-plugin',
    'skills',
    'using-anvil',
    'SKILL.md',
  )
  const ccGlobalBootstrap = join(anvilHome, 'skills', 'using-anvil', 'SKILL.md')
  const ocBootstrap = join(anvilHome, 'skills', 'using-anvil', 'SKILL.md')

  const ccExists =
    existsSync(ccProjectBootstrap) || existsSync(ccGlobalBootstrap)
  const ocExists = existsSync(ocBootstrap)

  if (!ccExists && !ocExists) {
    checks.push({
      name: 'Adapter bootstrap (using-anvil/SKILL.md)',
      status: 'fail',
      detail:
        'bootstrap skill missing for all adapters — run `anvil init` to restage skills/using-anvil/SKILL.md',
    })
    return
  }

  const adapterRows: string[] = []
  if (ccExists) adapterRows.push('claude-code: present')
  else
    adapterRows.push(
      'claude-code: missing (run `anvil init --target claude-code`)',
    )
  if (ocExists) adapterRows.push('opencode: present')
  else
    adapterRows.push('opencode: missing (run `anvil init --target opencode`)')

  const allPresent = ccExists && ocExists
  checks.push({
    name: 'Adapter bootstrap (using-anvil/SKILL.md)',
    status: allPresent ? 'pass' : 'warn',
    detail: adapterRows.join('; '),
  })
}

/**
 * ANV-0103 — Bootstrap content version-skew check.
 *
 * Reads the bootstrap skill file (skills/using-anvil/SKILL.md from the project
 * skills tree, or the global ~/.anvil/skills/using-anvil/SKILL.md), extracts
 * all `anvil:<slug>` references, and verifies each slug exists in the loaded
 * skill/agent registries.
 *
 * Status semantics:
 *   pass  — all referenced slugs resolve in the registry.
 *   warn  — bootstrap file not found (ANV-0001 will already have reported this).
 *   fail  — one or more dangling references detected.
 *   skip  — skills/ tree absent from cwd (not an Anvil project).
 *
 * Exported for unit testing.
 */
export async function pushBootstrapSkewCheck(
  checks: Check[],
  cwd: string,
  anvilHome: string,
): Promise<void> {
  const name = 'Bootstrap slug references (version-skew)'

  // Prefer project-local skills tree; fall back to global installed layout.
  const projectBootstrap = join(
    cwd,
    '.claude-plugin',
    'skills',
    'using-anvil',
    'SKILL.md',
  )
  const projectSourceBootstrap = join(cwd, 'skills', 'using-anvil', 'SKILL.md')
  const globalBootstrap = join(anvilHome, 'skills', 'using-anvil', 'SKILL.md')

  // Resolve bootstrap path FIRST so we can decide which registry root matches it.
  // (Loading project skills against the global bootstrap would false-positive
  //  for any downstream consumer who authored custom skills locally.)
  let bootstrapPath: string | undefined
  for (const candidate of [
    projectSourceBootstrap,
    projectBootstrap,
    globalBootstrap,
  ]) {
    if (existsSync(candidate)) {
      bootstrapPath = candidate
      break
    }
  }

  // The registries we lint against MUST live in the same tree as the bootstrap
  // we resolved, so a global-installed Anvil checks slugs against the global
  // skills/agents and a project source-tree checks against its own.
  const isGlobal = bootstrapPath === globalBootstrap
  const skillsRoot = isGlobal ? join(anvilHome, 'skills') : join(cwd, 'skills')
  const agentsRoot = isGlobal ? join(anvilHome, 'agents') : join(cwd, 'agents')

  // Only run when there is a registry root to lint against.
  if (!existsSync(skillsRoot)) {
    checks.push({
      name,
      status: 'skip',
      detail: `no skills/ tree at ${skillsRoot} — skipped`,
    })
    return
  }

  if (!bootstrapPath) {
    // ANV-0001 already reports this; emit a warn (not fail) here to avoid
    // double-failing on a missing bootstrap file.
    checks.push({
      name,
      status: 'warn',
      detail:
        'bootstrap skill (using-anvil/SKILL.md) not found — run `anvil init` to restage; skipping skew check',
    })
    return
  }

  // Load bootstrap text.
  let bootstrapText: string
  try {
    bootstrapText = await readFile(bootstrapPath, 'utf-8')
  } catch (err) {
    checks.push({
      name,
      status: 'warn',
      detail: `could not read bootstrap file at ${bootstrapPath}: ${(err as Error).message}`,
    })
    return
  }

  // Load skill and agent registries.
  let skillNames: Set<string>
  let agentNames: Set<string>
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const skillReg = await loadAllSkills({ skillsRoot })
    skillNames = new Set(skillReg.getAll().map((s) => s.frontmatter.name))
  } catch (err) {
    checks.push({
      name,
      status: 'warn',
      detail: `could not load skill registry: ${(err as Error).message}`,
    })
    return
  }

  try {
    const { loadAllAgents } = await import('../../../agents/load-all.js')
    const agentReg = await loadAllAgents({ agentsRoot })
    agentNames = new Set(agentReg.getAll().map((a) => a.frontmatter.name))
  } catch (err) {
    // Agent registry failure is non-fatal — fall through with an empty set so
    // any skill-slug refs in bootstrap still get linted; the agent-resolution
    // gap is captured in a follow-up check below.
    agentNames = new Set<string>()
    checks.push({
      name: `${name} (agent registry)`,
      status: 'warn',
      detail: `could not load agent registry, agent refs in bootstrap will be flagged: ${(err as Error).message}`,
    })
  }

  // Run the lint.
  const result = lintBootstrapSkew(bootstrapText, skillNames, agentNames)

  if (result.violations.length === 0) {
    checks.push({
      name,
      status: 'pass',
      detail: `${result.refsFound} anvil: reference(s) checked — all resolve`,
    })
    return
  }

  const slugList = result.violations.map((v) => v.ref).join(', ')
  const firstHint = result.violations[0]?.hint ?? ''
  checks.push({
    name,
    status: 'fail',
    detail:
      `${result.violations.length} dangling reference(s): ${slugList}. ` +
      `${firstHint}`,
  })
}

/**
 * ANV-0054 — Generated-file guard coverage row.
 *
 * Reports how many disk-mutating hook handlers opt in to the generated-file
 * predicate via `respectGenerated: true`. Warns when coverage is below 100%.
 *
 * Exported for unit tests.
 */
export async function pushGeneratedFileGuardCheck(
  checks: Check[],
): Promise<void> {
  const { loadAllHooks } = await import('../../../hooks/load-all.js')
  const { buildDefaultConfig } = await import(
    '../../../core/config/defaults.js'
  )

  const config = buildDefaultConfig()
  const registry = loadAllHooks({ config })
  const all = registry.getAll()

  // Disk-mutating handler names — those that call safeWrite against
  // user-visible or Anvil state files (ANV-0054 scope).
  const DISK_MUTATING = new Set(['session-start', 'session-end', 'pre-compact'])

  const diskMutating = all.filter((h) => DISK_MUTATING.has(h.name))
  const guarded = diskMutating.filter((h) => h.respectGenerated === true)

  const n = guarded.length
  const total = diskMutating.length

  if (total === 0) {
    checks.push({
      name: 'Generated-file guard coverage',
      status: 'skip',
      detail: 'no disk-mutating handlers registered',
    })
    return
  }

  if (n < total) {
    const missing = diskMutating
      .filter((h) => !h.respectGenerated)
      .map((h) => h.name)
      .join(', ')
    checks.push({
      name: 'Generated-file guard coverage',
      status: 'warn',
      detail:
        `${n}/${total} disk-mutating handlers respect generated files — ` +
        `missing: ${missing} — add respectGenerated: true in load-all.ts`,
    })
    return
  }

  checks.push({
    name: 'Generated-file guard coverage',
    status: 'pass',
    detail: `${n}/${total} disk-mutating handlers respect generated files`,
  })
}

/**
 * ANV-0051 (hooks only) — Hook safety annotations doctor row.
 *
 * ANV-0216: Agent safety coverage retired — the MCP 4-tuple is not consumed
 * by any agent dispatcher. This row now covers hooks only.
 *
 * Verifies that every hook handler in the DEFAULTS registry declares all four
 * MCP hint fields (readOnlyHint, destructiveHint, idempotentHint, openWorldHint).
 * Emits a warning when coverage < 100%, and a fail when any contradictory
 * annotations are found (readOnlyHint=true + destructiveHint=true together).
 */
export async function pushAgentSafetyAnnotationsCheck(
  checks: Check[],
  _agentsRootOverride?: string,
): Promise<void> {
  const { computeHookSafetyCoverage } = await import(
    '../common/hook-safety-check.js'
  )
  const { getHookSafetyRecords } = await import('../../../hooks/load-all.js')

  // ── Hook coverage ─────────────────────────────────────────────────────────
  const hookResult = computeHookSafetyCoverage(getHookSafetyRecords())

  // ── Fail on contradictory hook annotations ────────────────────────────────
  if (hookResult.contradictory.length > 0) {
    checks.push({
      name: 'Hook safety annotations',
      status: 'fail',
      detail: `contradictory annotations (readOnly + destructive both true) on hooks: ${hookResult.contradictory.join(', ')} — a handler cannot be both read-only and destructive`,
    })
    return
  }

  // ── Build summary string ──────────────────────────────────────────────────
  const hookSummary =
    hookResult.status === 'skip'
      ? '0/0 hooks (no hooks registered)'
      : `${hookResult.covered}/${hookResult.total} hooks annotated`

  // ── Warn when hook coverage < 100% ───────────────────────────────────────
  if (hookResult.status !== 'skip' && hookResult.covered < hookResult.total) {
    const hookMissing = hookResult.missing
    checks.push({
      name: 'Hook safety annotations',
      status: 'warn',
      detail: `${hookSummary}${hookMissing.length > 0 ? ` — hooks missing annotations: ${hookMissing.slice(0, 5).join(', ')}${hookMissing.length > 5 ? ` …+${hookMissing.length - 5}` : ''}` : ''}`,
    })
    return
  }

  checks.push({
    name: 'Hook safety annotations',
    status: hookResult.status === 'skip' ? 'skip' : 'pass',
    detail: hookSummary,
  })
}

/**
 * ANV-0036 (v0.13.0) — Skill behaviour validation: deterministic doctor rows.
 *
 * Loads skills from disk (using the live loadAllSkills registry), then delegates
 * all checks to the pure functions in doctor-skills-validation.ts so the logic
 * is independently unit-testable without live filesystem.
 *
 * Also collects agent slugs (from agents/) and command slugs (from the CLI dir)
 * for cross-surface duplicate detection.
 */
export async function pushSkillBehaviorValidationChecks(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  __dirname: string,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill catalog',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  // Load all skills from the live registry, then walk raw files to capture
  // frontmatter-invalid entries the loader silently dropped (AC-1: ANV-0036).
  let skills: SkillValidationInput[] = []
  let loadError: string | null = null
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const { readdirSync: rds, readFileSync: rfs } = await import('node:fs')
    const reg = await loadAllSkills({ skillsRoot })

    // Valid skills — sourced from the registry.
    const validPaths = new Set<string>()
    skills = reg.getAll().map((s) => {
      if (s.sourcePath) validPaths.add(s.sourcePath)
      return {
        name: s.frontmatter.name,
        description: s.originalDescription ?? s.frontmatter.description,
        sourcePath: s.sourcePath,
        frontmatterValid: true,
        scripts: s.frontmatter.scripts,
        references: s.frontmatter.references,
        assets: s.frontmatter.assets,
        body: s.body,
      }
    })

    // Invalid skills — walk the directory for .md files not loaded by the registry.
    // Skip top-level meta-files that are not skills (guidance docs for AI agents).
    // ANV-0179 — also skip `*-prompt.md` files: these are ANV-0083 collapsed-agent
    // prompt fragments invoked via `Task(general-purpose)`, not skills. The skill
    // loader silently ignores them (subdir-form short-circuit only loads SKILL.md);
    // the catalog walker must honor the same convention or it will mis-flag them
    // as "invalid frontmatter".
    const META_FILENAMES = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md'])
    const walkMd = (dir: string): string[] => {
      try {
        return rds(dir, { withFileTypes: true }).flatMap((e) => {
          const p = `${dir}/${e.name}`
          if (e.isDirectory()) return walkMd(p)
          if (!e.name.endsWith('.md')) return []
          if (META_FILENAMES.has(e.name)) return []
          if (e.name.endsWith('-prompt.md')) return []
          return [p]
        })
      } catch {
        return []
      }
    }
    for (const filePath of walkMd(skillsRoot)) {
      if (validPaths.has(filePath)) continue
      // File exists but was not loaded — invalid/unparseable frontmatter.
      let rawName = filePath.split('/').pop()?.replace(/\.md$/, '') ?? 'unknown'
      try {
        const raw = rfs(filePath, 'utf8')
        const nameMatch = raw.match(/^name:\s*(.+)$/m)
        if (nameMatch) rawName = nameMatch[1].trim()
      } catch {
        /* best-effort */
      }
      skills.push({
        name: rawName,
        description: '',
        sourcePath: filePath,
        frontmatterValid: false,
      })
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  if (loadError !== null) {
    checks.push({
      name: 'Skill catalog',
      status: 'fail',
      detail: `failed to load skills: ${loadError}`,
    })
    return
  }

  // Collect agent slugs from agents/ directory (file-based, no load required).
  const agentsRoot = join(cwd, 'agents')
  const agentSlugs: string[] = []
  if (existsSync(agentsRoot)) {
    try {
      const agentFiles = walkSlugFiles(agentsRoot)
      for (const f of agentFiles) {
        const base = f.split('/').pop() ?? f
        agentSlugs.push(base.replace(/\.md$/, ''))
      }
    } catch {
      // Ignore — agent slug collection is best-effort for this check.
    }
  }

  // Collect command slugs from the CLI commands directory.
  // We use readdirSync to avoid dynamic imports of every command file.
  const { readdirSync } = await import('node:fs')
  const commandSlugs: string[] = []
  const cliDir = __dirname
  try {
    const entries = readdirSync(cliDir)
    for (const entry of entries) {
      if (
        entry.endsWith('.ts') ||
        entry.endsWith('.js') ||
        entry.endsWith('.cjs')
      ) {
        // Strip extension and common suffixes that aren't slugs.
        const base = entry
          .replace(/\.(ts|js|cjs)$/, '')
          .replace(/^doctor.*/, '') // doctor.ts is not a command slug
        if (base.length > 0 && !base.includes('-') && base !== 'doctor') {
          commandSlugs.push(base)
        }
      }
    }
  } catch {
    // Ignore — command slug collection is best-effort.
  }

  pushSkillBehaviorValidationRows(checks, {
    skills,
    agentSlugs,
    commandSlugs,
    skillsRoot,
  })
}

/**
 * ANV-0045 — Static doctor row: reports how many user-invocable skills have
 * fixture prompt files under `tests/skill-triggering/fixtures/<slug>.md`.
 *
 * Warns when coverage is below 100% so gaps are visible in normal CI.
 * The `--live` flag runs a separate eval pass (see `runLiveSkillEval`).
 *
 * @param checks - Mutable check list to append to.
 * @param cwd - Current working directory (must be the repo root).
 * @param userInvocableNames - Slugs of all user-invocable skills.
 */
export function pushSkillFixtureCoverageRow(
  checks: Check[],
  cwd: string,
  userInvocableNames: string[],
): void {
  const fixturesDir = join(cwd, 'tests', 'skill-triggering', 'fixtures')
  const total = userInvocableNames.length

  if (total === 0) {
    checks.push({
      name: 'skill-triggering fixture coverage',
      status: 'skip',
      detail: 'no user-invocable skills found',
    })
    return
  }

  const covered = userInvocableNames.filter((slug) =>
    existsSync(join(fixturesDir, `${slug}.md`)),
  ).length

  checks.push({
    name: 'skill-triggering fixture coverage',
    status: covered === total ? 'pass' : 'warn',
    detail:
      covered === total
        ? `${covered}/${total} user-invocable skills have fixture prompts`
        : `${covered}/${total} user-invocable skills have fixture prompts — add missing fixtures under tests/skill-triggering/fixtures/`,
  })
}

// ─── ANV-0033: DoctorCheck registry entries ──────────────────────────────────
// These use the typed DoctorCheck interface from doctor-registry.ts, distinct
// from the local Check interface above. Both coexist in this file.

import { resolveAlias } from '../../../core/models/aliases.js'
import {
  MAX_SNAPSHOT_AGE_DAYS,
  loadBundledSnapshot,
  lookupCapability,
  snapshotAgeDays,
} from '../../../core/models/capability-snapshot.js'
import type {
  ModelCapabilitySnapshot,
  ModelsConfig,
} from '../../../core/types.js'
import { ModelsConfig as ModelsConfigSchema } from '../../../core/types.js'
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckRow,
} from '../doctor-registry.js'

// ─── 5a: Snapshot integrity ─────────────────────────────────────────────────

function runSnapshotIntegrityCheck(
  _ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  try {
    loadBundledSnapshot()
    rows.push({
      name: 'Capability snapshot integrity',
      status: 'pass',
      detail: 'data/model-capabilities.json parses OK (no duplicates)',
    })
  } catch (err) {
    rows.push({
      name: 'Capability snapshot integrity',
      status: 'fail',
      detail: `bundled snapshot invalid: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
    })
  }
}

export const snapshotIntegrityCheck: DoctorCheck = {
  id: 'capability/snapshot-integrity',
  label: 'Capability snapshot integrity',
  category: 'capability',
  runner: runSnapshotIntegrityCheck,
}

export function pushSnapshotIntegrityCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  snapshotIntegrityCheck.runner(ctx, rows)
}

// ─── 5b: Snapshot freshness ──────────────────────────────────────────────────

function runSnapshotFreshnessCheck(
  _ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  let snapshot: ModelCapabilitySnapshot
  try {
    snapshot = loadBundledSnapshot()
  } catch {
    // Integrity check already covers this — skip silently.
    return
  }
  const ageDays = snapshotAgeDays(snapshot)
  if (ageDays > MAX_SNAPSHOT_AGE_DAYS) {
    rows.push({
      name: 'Capability snapshot freshness',
      status: 'warn',
      detail: `data/model-capabilities.json is ${Math.floor(ageDays)} days old (threshold: ${MAX_SNAPSHOT_AGE_DAYS} days) — run: anvil models refresh`,
    })
  } else {
    rows.push({
      name: 'Capability snapshot freshness',
      status: 'pass',
      detail: `snapshot is ${Math.floor(ageDays)} days old (within ${MAX_SNAPSHOT_AGE_DAYS}-day threshold)`,
    })
  }
}

export const snapshotFreshnessCheck: DoctorCheck = {
  id: 'capability/snapshot-freshness',
  label: 'Capability snapshot freshness',
  category: 'capability',
  runner: runSnapshotFreshnessCheck,
}

export function pushSnapshotFreshnessCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  snapshotFreshnessCheck.runner(ctx, rows)
}

// ─── 5c: Model provenance ────────────────────────────────────────────────────

/**
 * Loads the user's ~/.anvil/models.json and parses it via ModelsConfig.
 * Returns null if the file doesn't exist or fails to parse.
 */
function tryLoadUserModelsConfig(anvilHome: string): ModelsConfig | null {
  const filePath = join(anvilHome, 'models.json')
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const result = ModelsConfigSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Collects all configured model IDs from a ModelsConfig, resolving any aliases
 * (e.g. `sonnet`, `cheap`, `coding`) to their concrete provider IDs first so the
 * capability snapshot lookup sees the same keys it indexes on. `resolveAlias`
 * returns its input unchanged for unknown IDs (cycle-safe — see ANV-0166).
 */
function collectConfiguredModelIds(config: ModelsConfig): string[] {
  const resolve = (id: string): string => resolveAlias(id, config.model_aliases)
  const ids = new Set<string>()
  ids.add(resolve(config.defaults.model))
  if (config.defaults.fallback_model)
    ids.add(resolve(config.defaults.fallback_model))
  for (const id of config.defaults.fallback_chain) ids.add(resolve(id))
  for (const group of Object.values(config.groups)) {
    ids.add(resolve(group.model))
    for (const id of group.fallback_chain) ids.add(resolve(id))
  }
  for (const override of Object.values(config.overrides)) {
    ids.add(resolve(override.model))
    for (const id of override.fallback_chain) ids.add(resolve(id))
  }
  return [...ids]
}

function runModelProvenanceCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  let snapshot: ModelCapabilitySnapshot
  try {
    snapshot = loadBundledSnapshot()
  } catch {
    return
  }
  const config = tryLoadUserModelsConfig(ctx.anvilHome)
  if (!config) return

  const modelIds = collectConfiguredModelIds(config)
  const unknowns = modelIds.filter(
    (id) => lookupCapability(id, snapshot).source === 'unknown',
  )
  if (unknowns.length > 0) {
    rows.push({
      name: 'Capability model provenance',
      status: 'warn',
      detail: `${unknowns.length} model ID(s) not in snapshot or heuristics: ${unknowns.slice(0, 5).join(', ')}${unknowns.length > 5 ? ` (+${unknowns.length - 5} more)` : ''}`,
    })
  } else {
    rows.push({
      name: 'Capability model provenance',
      status: 'pass',
      detail: `all ${modelIds.length} configured model ID(s) recognised (snapshot or heuristic)`,
    })
  }
}

export const modelProvenanceCheck: DoctorCheck = {
  id: 'capability/model-provenance',
  label: 'Capability model provenance',
  category: 'capability',
  silentOnPass: true,
  runner: runModelProvenanceCheck,
}

export function pushModelProvenanceCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  modelProvenanceCheck.runner(ctx, rows)
}

// ─── 5d: Fallback chain coverage ─────────────────────────────────────────────

/**
 * Collects all fallback chains from a ModelsConfig, resolving aliases through
 * `resolveAlias` so each chain entry matches the concrete IDs in the snapshot
 * (ANV-0166). Bare-word aliases (`sonnet`, `haiku`, `opus`, `balanced`, …)
 * would otherwise miss every snapshot key.
 */
function collectFallbackChains(
  config: ModelsConfig,
): Array<{ name: string; chain: string[] }> {
  const resolveChain = (chain: string[]): string[] =>
    chain.map((id) => resolveAlias(id, config.model_aliases))
  const chains: Array<{ name: string; chain: string[] }> = []
  if (config.defaults.fallback_chain.length > 0) {
    chains.push({
      name: 'defaults',
      chain: resolveChain(config.defaults.fallback_chain),
    })
  }
  for (const [groupName, group] of Object.entries(config.groups)) {
    if (group.fallback_chain.length > 0) {
      chains.push({
        name: `groups.${groupName}`,
        chain: resolveChain(group.fallback_chain),
      })
    }
  }
  for (const [overrideName, override] of Object.entries(config.overrides)) {
    if (override.fallback_chain.length > 0) {
      chains.push({
        name: `overrides.${overrideName}`,
        chain: resolveChain(override.fallback_chain),
      })
    }
  }
  return chains
}

function runFallbackChainCoverageCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  let snapshot: ModelCapabilitySnapshot
  try {
    snapshot = loadBundledSnapshot()
  } catch {
    return
  }
  const config = tryLoadUserModelsConfig(ctx.anvilHome)
  if (!config) return

  const chains = collectFallbackChains(config)
  if (chains.length === 0) return

  const zeroCoverageChains = chains.filter(({ chain }) => {
    const inSnapshot = chain.filter(
      (id) => lookupCapability(id, snapshot).source === 'snapshot',
    )
    return inSnapshot.length === 0
  })

  if (zeroCoverageChains.length > 0) {
    const names = zeroCoverageChains
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ')
    const more =
      zeroCoverageChains.length > 3
        ? ` (+${zeroCoverageChains.length - 3} more)`
        : ''
    rows.push({
      name: 'Capability fallback-chain coverage',
      status: 'warn',
      detail: `${zeroCoverageChains.length} fallback chain(s) have 0 snapshot-confirmed entries: ${names}${more}`,
    })
  } else {
    rows.push({
      name: 'Capability fallback-chain coverage',
      status: 'pass',
      detail: `all ${chains.length} fallback chain(s) have ≥1 snapshot-confirmed entry`,
    })
  }
}

export const fallbackChainCoverageCheck: DoctorCheck = {
  id: 'capability/fallback-chain-coverage',
  label: 'Capability fallback-chain coverage',
  category: 'capability',
  runner: runFallbackChainCoverageCheck,
}

export function pushFallbackChainCoverageCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): void {
  fallbackChainCoverageCheck.runner(ctx, rows)
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * ANV-0033 capability checks in declaration order (5a → 5b → 5c → 5d).
 */
export const CAPABILITY_CHECKS: readonly DoctorCheck[] = [
  snapshotIntegrityCheck,
  snapshotFreshnessCheck,
  modelProvenanceCheck,
  fallbackChainCoverageCheck,
]
