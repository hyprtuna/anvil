/**
 * ANV-0141 — Skill-checks category doctor checks (wave 2).
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Contains: skill registry, skill versions, sub-skills graph, skill providers,
 * agent runtime, tier integrity, CSO discipline, description budget,
 * skill loading mode, output schema, compression hook.
 *
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REQUIRED_READING_BYTE_CAP } from '../../../agents/required-reading.js'
import {
  type AgentFrontmatterMap,
  checkAgentMigrationCompleteness,
  checkEffortModelCompat,
  checkStaleInstalledTiers,
  checkTierNameValidity,
} from '../../../core/doctor/tier-integrity.js'
import { deriveReleaseBranch } from '../../../core/rebase-guard/index.js'
import { resolveToolBudget } from '../../../hooks/handlers/on-large-output.js'

// Local mirror of the Check interface from doctor.ts (same shape).
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * ANV-0186 — Resolve the first existing skills/ directory from a priority chain:
 * 1. <cwd>/skills  (contributor / source-tree mode)
 * 2. <anvilHome>/skills  (user-install mode: ~/.anvil/skills)
 *
 * Returns null when neither location exists.
 */
function resolveSkillsRoot(cwd: string, anvilHome: string): string | null {
  const cwdSkills = join(cwd, 'skills')
  if (existsSync(cwdSkills)) return cwdSkills
  const homeSkills = join(anvilHome, 'skills')
  if (existsSync(homeSkills)) return homeSkills
  return null
}

async function tryReadJson(filePath: string): Promise<unknown | null> {
  if (!existsSync(filePath)) return null
  try {
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function readModelsJson(
  filePath: string,
): Promise<
  | { present: false }
  | { present: true; value: unknown }
  | { present: true; error: string }
> {
  if (!existsSync(filePath)) return { present: false }
  let raw: string
  try {
    const { readFile } = await import('node:fs/promises')
    raw = await readFile(filePath, 'utf-8')
  } catch (err) {
    return {
      present: true,
      error: `read failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  try {
    return { present: true, value: JSON.parse(raw) }
  } catch (err) {
    return {
      present: true,
      error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Walk upward from `start` looking for a `.git` entry (file or directory).
 * Returns true when one is found before reaching the filesystem root.
 *
 * Exported for unit testing.
 */
export function isInsideGitRepo(start: string): boolean {
  let dir = start
  // Stop when dirname() returns the same path (root reached).
  for (;;) {
    if (existsSync(join(dir, '.git'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

/**
 * Probe whether `path` exists and is writable. Used to check the
 * `.claude/agent-memory/` directory referenced by `memory: 'project'`.
 */
function isWritableDir(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    // Touch a unique file then remove it. fsSync is fine here — doctor
    // is a one-shot CLI command, not a hot path.
    const probe = join(path, `.anvil-doctor-probe-${process.pid}`)
    writeFileSync(probe, '', 'utf-8')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/**
 * Returns true when version `a` is strictly less than version `b`.
 * Comparison is numeric tuple (major, minor, patch) — no pre-release support.
 */
function semverLt(a: string, b: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const parts = v.split('.').map(Number)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return aMaj < bMaj
  if (aMin !== bMin) return aMin < bMin
  return aPat < bPat
}

/**
 * Parses a `version:` value from raw frontmatter text (YAML-ish scan).
 * Returns undefined when not found.
 */
function parseVersionFromRawFrontmatter(raw: string): string | undefined {
  const m = raw.match(/^version:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m)
  return m?.[1]
}

/**
 * Default missing-ratio threshold above which bulk-metadata rows are demoted
 * from `warn` to `skip` (migration window active).
 *
 * Override via `ANV_MIGRATION_WINDOW_THRESHOLD=<float>` (clamped 0..1).
 * Pass `--show-migration` to disable suppression entirely.
 */
export const MIGRATION_WINDOW_THRESHOLD = 0.8

/**
 * Resolve the effective migration-window threshold.
 */
export function getMigrationWindowThreshold(): number {
  const raw = process.env.ANV_MIGRATION_WINDOW_THRESHOLD
  if (raw === undefined || raw.trim() === '') return MIGRATION_WINDOW_THRESHOLD
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return MIGRATION_WINDOW_THRESHOLD
  return Math.min(1, Math.max(0, parsed))
}

/**
 * Plan 42 D-01 — pure validator for `models.json` group + override member
 * references. Membership is `skills ∪ agents`. Returns pass/fail and a
 * detail string suitable for display.
 *
 * Exported so unit tests can exercise it without a live registry.
 */
export const validateModelsJsonReferences = Object.assign(
  function validateModelsJsonReferencesImpl(
    modelsRaw: unknown,
    skillNames: Set<string>,
    agentNames: Set<string>,
  ): { status: 'pass' | 'fail'; detail: string } {
    const referenced = collectSkillReferences(modelsRaw)
    const missing = referenced.filter(
      (n) => !skillNames.has(n) && !agentNames.has(n),
    )
    if (missing.length === 0) {
      return {
        status: 'pass',
        detail: `${referenced.length} reference(s) resolved`,
      }
    }
    return {
      status: 'fail',
      detail: `unknown name(s): ${missing.slice(0, 5).join(', ')}${
        missing.length > 5 ? ` …+${missing.length - 5}` : ''
      }`,
    }
  },
  { rowName: 'models.json registry references' as const },
)

function collectSkillReferences(modelsRaw: unknown): string[] {
  if (!modelsRaw || typeof modelsRaw !== 'object') return []
  const m = modelsRaw as Record<string, unknown>
  const refs = new Set<string>()
  const groups = m.groups
  if (groups && typeof groups === 'object' && !Array.isArray(groups)) {
    for (const g of Object.values(groups as Record<string, unknown>)) {
      if (g && typeof g === 'object') {
        const members = (g as Record<string, unknown>).members
        if (Array.isArray(members)) {
          for (const member of members) {
            if (typeof member === 'string') refs.add(member)
          }
        }
      }
    }
  }
  const overrides = m.overrides
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    for (const k of Object.keys(overrides as Record<string, unknown>))
      refs.add(k)
  }
  return [...refs]
}

/**
 * A5(a) + A5(b) — verify that every skill referenced from `models.json`
 * (groups members, overrides keys) exists in the skill registry, and
 * that no two registered skills share the same name across tiers.
 */
export async function pushSkillRegistryChecks(
  checks: Check[],
  cwd: string,
  anvilHome: string,
  pushSkillFixtureCoverageRow: (
    checks: Check[],
    cwd: string,
    userInvocableNames: string[],
  ) => void,
): Promise<{ userInvocableNames: string[] }> {
  // Load the live skill registry. Prefer cwd/skills (contributor mode);
  // fall back to anvilHome/skills (user-install mode). ANV-0186.
  const skillsRoot = resolveSkillsRoot(cwd, anvilHome)
  if (!skillsRoot) {
    checks.push({
      name: 'skill registry health',
      status: 'skip',
      detail: 'no skills/ directory found — skipped',
      expectedAbsence: true,
    })
    return { userInvocableNames: [] }
  }
  let skillNames: string[] = []
  let userInvocableCount = 0
  let hiddenCount = 0
  let userInvocableNames: string[] = []
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const allSkills = reg.getAll()
    skillNames = allSkills.map((s) => s.frontmatter.name)
    const invocable = allSkills.filter(
      (s) => s.frontmatter.userInvocable !== false,
    )
    userInvocableCount = invocable.length
    userInvocableNames = invocable.map((s) => s.frontmatter.name)
    hiddenCount = allSkills.length - userInvocableCount
  } catch (err) {
    checks.push({
      name: 'skill registry health',
      status: 'fail',
      detail: `failed to load skills: ${(err as Error).message}`,
    })
    return { userInvocableNames: [] }
  }

  // (b) duplicate names
  const counts = new Map<string, number>()
  for (const n of skillNames) counts.set(n, (counts.get(n) ?? 0) + 1)
  const dupes = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n)
  checks.push({
    name: 'skill name uniqueness',
    status: dupes.length === 0 ? 'pass' : 'fail',
    detail:
      dupes.length === 0
        ? `${skillNames.length} unique names`
        : `duplicate(s): ${dupes.join(', ')}`,
  })

  // (b2) slash-menu drift: warn when user-invocable count exceeds 15
  checks.push({
    name: 'slash-menu surface (user-invocable skills)',
    status: userInvocableCount <= 15 ? 'pass' : 'warn',
    detail:
      userInvocableCount <= 15
        ? `${userInvocableCount} user-invocable, ${hiddenCount} hidden`
        : `${userInvocableCount} user-invocable exceeds 15 — add \`user-invocable: false\` to utility skills`,
  })

  // (b3) ANV-0045 — fixture prompt coverage for --live eval.
  pushSkillFixtureCoverageRow(checks, cwd, userInvocableNames)

  // (a) every entry in models.json groups/overrides must resolve to a known
  // skill OR a known agent. Plan 42 D-01: pre-v0.10.5 row was named
  // "models.json skill references" and validated against skills only,
  // hard-failing on shipped presets that legitimately reference agents
  // (orchestrator, researcher, code-reviewer, etc.) as group members.
  // Resolve models.json from project first, then user.
  const candidatePaths = [
    join(cwd, '.claude', 'models.json'),
    join(anvilHome, 'models.json'),
  ]
  // v0.10.9 E-003: scan candidates with discriminated reader so we can
  // tell apart "no file" (warn — run `anvil init`) from "file present but
  // malformed" (fail — config is broken).
  let modelsRaw: unknown = null
  let firstError: { path: string; error: string } | null = null
  for (const p of candidatePaths) {
    const r = await readModelsJson(p)
    if (!r.present) continue
    if ('error' in r) {
      if (!firstError) firstError = { path: p, error: r.error }
      continue
    }
    modelsRaw = r.value
    break
  }
  if (modelsRaw === null) {
    if (firstError) {
      checks.push({
        name: 'models.json registry references',
        status: 'fail',
        detail: `${firstError.path} malformed: ${firstError.error}`,
      })
      return { userInvocableNames }
    }
    checks.push({
      name: 'models.json registry references',
      status: 'warn',
      detail: 'no models.json found — run `anvil init`',
    })
    return { userInvocableNames }
  }

  // Load agents alongside skills so group/override members can be either.
  // Prefer cwd/agents (contributor mode); fall back to anvilHome/agents (user-install mode).
  let agentNames: string[] = []
  const cwdAgentsRoot = join(cwd, 'agents')
  const homeAgentsRoot = join(anvilHome, 'agents')
  const agentsRoot = existsSync(cwdAgentsRoot)
    ? cwdAgentsRoot
    : existsSync(homeAgentsRoot)
      ? homeAgentsRoot
      : null
  if (agentsRoot !== null) {
    try {
      const { loadAllAgents } = await import('../../../agents/load-all.js')
      const reg = await loadAllAgents({ agentsRoot })
      agentNames = reg.getAll().map((a) => a.frontmatter.name)
    } catch {
      // Fall through — skill-only check still runs (keeps row useful even
      // when agents/ is malformed).
    }
  }

  const skillSet = new Set(skillNames)
  const agentSet = new Set(agentNames)
  const result = validateModelsJsonReferences(modelsRaw, skillSet, agentSet)
  checks.push({
    name: validateModelsJsonReferences.rowName,
    status: result.status,
    detail: result.detail,
  })
  return { userInvocableNames }
}

/**
 * Plan 30 G3 — compare declared skill versions against user-pinned minimums.
 */
export async function pushSkillVersionChecks(
  checks: Check[],
  cwd: string,
  anvilHome: string,
): Promise<void> {
  // Load config to read skill_versions pins.
  const candidatePaths = [
    join(cwd, '.anvil', 'models.json'),
    join(anvilHome, 'models.json'),
  ]
  let modelsRaw: unknown = null
  for (const p of candidatePaths) {
    modelsRaw = await tryReadJson(p)
    if (modelsRaw) break
  }

  const skillVersions =
    modelsRaw &&
    typeof modelsRaw === 'object' &&
    !Array.isArray(modelsRaw) &&
    'skill_versions' in modelsRaw &&
    typeof (modelsRaw as Record<string, unknown>).skill_versions === 'object' &&
    (modelsRaw as Record<string, unknown>).skill_versions !== null
      ? ((modelsRaw as Record<string, unknown>).skill_versions as Record<
          string,
          string
        >)
      : null

  if (!skillVersions || Object.keys(skillVersions).length === 0) {
    // No pins configured — skip the check entirely (not a warn).
    return
  }

  const skillsRoot = join(cwd, 'skills')
  if (!existsSync(skillsRoot)) return

  let allSkills: Array<{
    name: string
    version?: string
    replacement?: string
  }> = []
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    allSkills = reg.getAll().map((s) => ({
      name: s.frontmatter.name,
      version: s.frontmatter.version,
      replacement: s.frontmatter.replacement,
    }))
  } catch {
    // Can't load skills — skip gracefully.
    return
  }

  const skillByName = new Map(allSkills.map((s) => [s.name, s]))
  const warnings: string[] = []

  for (const [skillName, pinnedMin] of Object.entries(skillVersions)) {
    const skill = skillByName.get(skillName)
    if (!skill) continue // Skill not installed — not our concern here.
    if (!skill.version) continue // Skill doesn't declare version — skip.

    if (semverLt(skill.version, pinnedMin)) {
      const replacement = skill.replacement
        ? ` → replacement: ${skill.replacement}`
        : ''
      warnings.push(
        `${skillName}: ${skill.version} < pinned ${pinnedMin}${replacement}`,
      )
    }
  }

  if (warnings.length === 0) {
    checks.push({
      name: 'skill version pins',
      status: 'pass',
      detail: `${Object.keys(skillVersions).length} pin(s) satisfied`,
    })
  } else {
    const summary = warnings.slice(0, 3).join('; ')
    const more = warnings.length > 3 ? ` …+${warnings.length - 3}` : ''
    checks.push({
      name: 'skill version pins',
      status: 'warn',
      detail: `${warnings.length} skill(s) below pinned version: ${summary}${more}`,
    })
  }
}

/**
 * Plan 33 A6 — sub_skills graph health doctor row.
 */
export async function pushSubSkillsGraphCheck(
  checks: Check[],
  cwd: string,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!existsSync(skillsRoot)) {
    // No skills/ tree — skip, same as other skill checks
    return
  }

  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const allSkills = reg.getAll()

    const withSubSkills = allSkills.filter(
      (s) => s.frontmatter.sub_skills && s.frontmatter.sub_skills.length > 0,
    )
    const degraded = allSkills.filter((s) => s.defects.length > 0)

    const detail: string[] = [
      `${withSubSkills.length} skill(s) with sub_skills declared`,
    ]
    if (degraded.length > 0) {
      const names = degraded.map((s) => s.frontmatter.name).join(', ')
      detail.push(`${degraded.length} degraded: ${names}`)
    }

    checks.push({
      name: 'sub_skills graph health',
      status: degraded.length === 0 ? 'pass' : 'warn',
      detail: detail.join('; '),
    })
  } catch (err) {
    // SkillCycleError surfaces here — treat as fail with cycle path
    checks.push({
      name: 'sub_skills graph health',
      status: 'fail',
      detail: (err as Error).message,
    })
  }
}

/**
 * Plan 28 H4 — scan the loaded agent set for runtime preconditions.
 */
export async function pushAgentRuntimeChecks(
  checks: Check[],
  cwd: string,
): Promise<void> {
  const agentsRoot = join(cwd, 'agents')
  if (!existsSync(agentsRoot)) {
    checks.push({
      name: 'agent runtime preconditions',
      status: 'skip',
      detail: 'no agents/ tree in cwd — skipped',
      expectedAbsence: true,
    })
    return
  }

  let agentList: Array<{
    name: string
    isolation?: string
    memory?: string
  }> = []
  try {
    const { loadAllAgents } = await import('../../../agents/load-all.js')
    const reg = await loadAllAgents({ agentsRoot })
    agentList = reg.getAll().map((a) => ({
      name: a.frontmatter.name,
      isolation: a.frontmatter.isolation,
      memory: a.frontmatter.memory,
    }))
  } catch (err) {
    checks.push({
      name: 'agent runtime preconditions',
      status: 'fail',
      detail: `failed to load agents: ${(err as Error).message}`,
    })
    return
  }

  const insideGit = isInsideGitRepo(cwd)
  const memoryDir = join(cwd, '.claude', 'agent-memory')
  const memoryWritable = isWritableDir(memoryDir)

  const offenders: string[] = []
  for (const agent of agentList) {
    if (agent.isolation === 'worktree' && !insideGit) {
      offenders.push(`${agent.name} (isolation: worktree, not a git repo)`)
    }
    if (agent.memory === 'project' && !memoryWritable) {
      offenders.push(
        `${agent.name} (memory: project, .claude/agent-memory/ not writable)`,
      )
    }
  }

  if (agentList.length === 0) {
    checks.push({
      name: 'agent runtime preconditions',
      status: 'warn',
      detail: 'no agents loaded',
    })
    return
  }

  if (offenders.length === 0) {
    checks.push({
      name: 'agent runtime preconditions',
      status: 'pass',
      detail: `${agentList.length} agent(s) — preconditions satisfied`,
    })
  } else {
    const summary = offenders.slice(0, 5).join('; ')
    const more = offenders.length > 5 ? ` …+${offenders.length - 5}` : ''
    checks.push({
      name: 'agent runtime preconditions',
      status: 'warn',
      detail: `${offenders.length} issue(s): ${summary}${more}`,
    })
  }
}

/**
 * Plan 32 B6 — Skill loading mode row.
 * ANV-0186: accepts cwd so the skill-count fallback can use resolveSkillsRoot()
 * instead of hardcoding process.cwd(). Defaults to process.cwd() for callers
 * that have not been updated yet.
 */
export async function pushSkillLoadingModeCheck(
  checks: Check[],
  anvilHome: string,
  cwd: string = process.cwd(),
): Promise<void> {
  // Read models.json to determine the configured mode.
  const modelsPath = join(anvilHome, 'models.json')
  let lazyLoad = false
  if (existsSync(modelsPath)) {
    try {
      const raw = readFileSync(modelsPath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const skillsCfg = parsed.skills
      if (typeof skillsCfg === 'object' && skillsCfg !== null) {
        lazyLoad = (skillsCfg as Record<string, unknown>).lazy_load === true
      }
    } catch {
      // Unreadable — report eager (safe default)
    }
  }
  // Check --eager flag override: process.env.ANVIL_EAGER is set by the flag handler.
  if (process.env.ANVIL_EAGER === '1') {
    lazyLoad = false
  }

  const { getBodyFetchCount } = await import('../../../skills/body.js')
  const fetched = getBodyFetchCount()

  if (lazyLoad) {
    // Load the skill registry to get total count for the "n/total" label.
    // ANV-0186: use resolveSkillsRoot() so user installs (no cwd/skills)
    // correctly count from anvilHome/skills instead of reporting 0.
    const skillsRoot = resolveSkillsRoot(cwd, anvilHome)
    let total = 0
    if (skillsRoot) {
      try {
        const { loadAllSkills } = await import('../../../skills/load-all.js')
        const reg = await loadAllSkills({ skillsRoot, lazy: true })
        total = reg.getAll().length
      } catch {
        // best-effort
      }
    }
    const label =
      total > 0
        ? `lazy (${fetched}/${total} bodies fetched)`
        : `lazy (${fetched} bodies fetched)`
    checks.push({
      name: 'Skill loading mode (~/.anvil/models.json → skills.lazy_load)',
      status: 'pass',
      detail: label,
    })
  } else {
    checks.push({
      name: 'Skill loading mode (~/.anvil/models.json → skills.lazy_load)',
      status: 'pass',
      detail:
        'eager (default) — set skills.lazy_load: true to enable lazy mode',
    })
  }
}

/**
 * Plan 33 B5 — Output schema coverage row.
 */
export async function pushOutputSchemaCoverageCheck(
  checks: Check[],
  anvilHome: string,
): Promise<void> {
  const agentsDir = join(anvilHome, 'plugins', 'claude-code', 'agents')
  let schemaAgentCount = 0
  let schemaFailCount = 0

  // Count agents with output_schema declared in frontmatter.
  if (existsSync(agentsDir)) {
    try {
      const { readdirSync: rds, readFileSync: rfs } = await import('node:fs')
      const agentFiles = rds(agentsDir).filter((f) => f.endsWith('.md'))
      for (const file of agentFiles) {
        const raw = rfs(join(agentsDir, file), 'utf-8')
        if (/^output_schema:/m.test(raw)) schemaAgentCount++
      }
    } catch {
      // best-effort
    }
  }

  // Count SCHEMA_FAIL events in the notepad stash (best-effort).
  const stashDir = join(anvilHome, 'stash')
  if (existsSync(stashDir)) {
    try {
      const { readdirSync: rds, readFileSync: rfs } = await import('node:fs')
      const stashFiles = rds(stashDir).filter((f) => f.endsWith('.md'))
      for (const file of stashFiles) {
        const raw = rfs(join(stashDir, file), 'utf-8')
        const matches = raw.match(/SCHEMA_FAIL/g)
        if (matches) schemaFailCount += matches.length
      }
    } catch {
      // best-effort
    }
  }

  const failDetail =
    schemaFailCount > 0
      ? `${schemaFailCount} SCHEMA_FAIL event(s) logged in stash`
      : 'no SCHEMA_FAIL events in stash'

  checks.push({
    name: 'Output schema coverage',
    status: 'pass',
    detail: `${schemaAgentCount} agent(s) declare output_schema; ${failDetail}`,
  })
}

/**
 * ANV-0046 — Doctor row: report active per-tool token budgets.
 */
function pushToolBudgetsCheck(
  checks: Check[],
  configBudgets: Record<string, number> | undefined,
): void {
  const knownTools = ['webfetch', 'bash', 'read']
  const lines: string[] = []

  for (const tool of knownTools) {
    const effective = resolveToolBudget(tool, configBudgets)
    const envKey = `ANVIL_TOOL_BUDGET_${tool.toUpperCase()}`
    const source = process.env[envKey]
      ? `env ${envKey}`
      : configBudgets?.[tool] !== undefined
        ? 'config'
        : 'default'
    lines.push(`${tool}=${effective.toLocaleString()} (${source})`)
  }

  // Also surface any config-only overrides for non-standard tools
  if (configBudgets !== undefined) {
    for (const [tool, budget] of Object.entries(configBudgets)) {
      if (!knownTools.includes(tool.toLowerCase())) {
        lines.push(`${tool}=${budget.toLocaleString()} (config)`)
      }
    }
  }

  checks.push({
    name: 'Per-tool truncation budgets',
    status: 'pass',
    detail: lines.join(', '),
  })
}

/**
 * Plan 32 C7 — Compression hook row.
 */
export async function pushCompressionHookCheck(
  checks: Check[],
  anvilHome: string,
  cwd: string,
): Promise<void> {
  const modelsPath = join(anvilHome, 'models.json')
  let threshold = 5000
  let strategy = 'summary'
  let enabled = false
  let configToolBudgets: Record<string, number> | undefined

  if (existsSync(modelsPath)) {
    try {
      const raw = readFileSync(modelsPath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const compression = parsed.compression
      if (typeof compression === 'object' && compression !== null) {
        const c = compression as Record<string, unknown>
        if (typeof c.threshold_words === 'number') threshold = c.threshold_words
        if (typeof c.strategy === 'string') strategy = c.strategy
        // ANV-0046: read tool_budgets if present
        if (
          typeof c.tool_budgets === 'object' &&
          c.tool_budgets !== null &&
          !Array.isArray(c.tool_budgets)
        ) {
          configToolBudgets = c.tool_budgets as Record<string, number>
        }
      }
      // Check disabled hooks list — on-large-output must NOT be in disabled
      const disabled = parsed.disabled
      if (typeof disabled === 'object' && disabled !== null) {
        const d = disabled as Record<string, unknown>
        const disabledHooks = Array.isArray(d.hooks) ? d.hooks : []
        enabled = !disabledHooks.includes('on-large-output')
      }
    } catch {
      // Unreadable — report defaults
    }
  }

  // Measure stash dir size on disk
  let stashSize = 0
  let stashFiles = 0
  try {
    const { readdirSync: rds, statSync: sts } = await import('node:fs')
    const notepadsDir = join(cwd, '.anvil', 'notepads')
    if (existsSync(notepadsDir)) {
      const branches = rds(notepadsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
      for (const branch of branches) {
        const stashPath = join(notepadsDir, branch, 'large-outputs.md')
        if (existsSync(stashPath)) {
          stashFiles++
          stashSize += sts(stashPath).size
        }
      }
    }
  } catch {
    // best-effort
  }

  const stashLabel =
    stashFiles > 0
      ? `${stashFiles} stash file(s), ${(stashSize / 1024).toFixed(1)} KB on disk`
      : 'no stash files yet'

  // Plan 33 C5 — Detect subprocess runtime for summarization invocation
  const { spawnSync: spawnSyncDoctor } = await import('node:child_process')
  let subprocessRuntime: string | null = null
  for (const candidate of ['bun', 'node']) {
    const r = spawnSyncDoctor(candidate, ['--version'], {
      stdio: 'ignore',
      timeout: 2000,
    })
    if (r.status === 0) {
      subprocessRuntime = candidate
      break
    }
  }

  const runtimeLabel = subprocessRuntime
    ? `subprocess runtime: ${subprocessRuntime}`
    : 'no subprocess runtime found (bun/node) — summarization will use mechanical fallback'

  const hookStatus: Check['status'] =
    !subprocessRuntime && strategy === 'summary' ? 'warn' : 'pass'

  checks.push({
    name: 'Compression hook (on-large-output)',
    status: hookStatus,
    detail: enabled
      ? `enabled — threshold: ${threshold} words, strategy: ${strategy}, stash: ${stashLabel}, ${runtimeLabel}`
      : `disabled — enable by removing 'on-large-output' from disabled.hooks in ~/.anvil/models.json (threshold: ${threshold}, strategy: ${strategy}, stash: ${stashLabel}, ${runtimeLabel})`,
  })

  // ANV-0046 — Per-tool truncation budgets row
  pushToolBudgetsCheck(checks, configToolBudgets)
}

// ─── Plan 38 Phase F — Tier integrity ────────────────────────────────────────

/**
 * Aggregate tier-integrity check comprising 4 sub-checks.
 */
export async function pushTierIntegrityCheck(
  checks: Check[],
  cwd: string,
  anvilHome: string,
  inProject: boolean,
  skipDetail: string,
): Promise<void> {
  const agentsRoot = join(cwd, 'agents')
  if (!inProject || !existsSync(agentsRoot)) {
    checks.push({
      name: 'Tier integrity',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  const STATUS_ORDER: ReadonlyArray<'pass' | 'warn' | 'fail'> = [
    'pass',
    'warn',
    'fail',
  ]
  const worstStatus = (
    a: 'pass' | 'warn' | 'fail',
    b: 'pass' | 'warn' | 'fail',
  ): 'pass' | 'warn' | 'fail' => {
    return STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b
  }

  // Build AgentFrontmatterMap by parsing raw YAML frontmatter.
  const agentMap: AgentFrontmatterMap = new Map()
  try {
    const { readdirSync: rds } = await import('node:fs')
    const matter = (await import('gray-matter')).default
    const files = rds(agentsRoot).filter((f) => f.endsWith('.md'))
    for (const file of files) {
      const raw = readFileSync(join(agentsRoot, file), 'utf-8')
      const parsed = matter(raw)
      const fm = parsed.data as {
        name?: string
        tier?: string
        model?: string
        'x-anvil'?: Record<string, unknown>
      }
      // ANV-0206: tier may be at root (pre-migration) OR under x-anvil (post-migration).
      const xa = fm['x-anvil']
      const agentName =
        typeof fm.name === 'string' ? fm.name : file.replace(/\.md$/, '')
      agentMap.set(agentName, {
        tier:
          typeof fm.tier === 'string'
            ? fm.tier
            : typeof xa?.tier === 'string'
              ? (xa.tier as string)
              : undefined,
        model: typeof fm.model === 'string' ? fm.model : undefined,
      })
    }
  } catch {
    checks.push({
      name: 'Tier integrity',
      status: 'skip',
      detail: 'failed to read agents/ directory',
    })
    return
  }

  // Sub-check 1: tier-name validity
  const nameValidity = checkTierNameValidity(agentMap)

  // Sub-check 3: agent migration completeness
  let migrationCheck: { status: 'pass' | 'fail'; offenders: string[] } = {
    status: 'pass',
    offenders: [],
  }
  try {
    const { buildDefaultConfig } = await import(
      '../../../core/config/defaults.js'
    )
    const defaults = buildDefaultConfig()
    const defaultsAgentsBlock = (defaults.agents ?? {}) as Record<
      string,
      { tier?: string; model?: string }
    >
    migrationCheck = checkAgentMigrationCompleteness(
      agentMap,
      defaultsAgentsBlock,
    )
  } catch {
    // Tolerable: defaults not loadable in unusual environments
  }

  // Sub-check 2: effort×model compat (reads installed models.json or defaults)
  let effortCompat: { status: 'pass' | 'warn'; warnings: string[] } = {
    status: 'pass',
    warnings: [],
  }
  try {
    const installedModelsPath = join(anvilHome, 'models.json')
    const { buildDefaultConfig } = await import(
      '../../../core/config/defaults.js'
    )
    const defaults = buildDefaultConfig()
    type TierEntry = {
      model: string
      effort?: import('../../../core/types.js').EffortLevel
    }
    let tiersToCheck: Record<string, TierEntry> = {}
    if (existsSync(installedModelsPath)) {
      const raw = readFileSync(installedModelsPath, 'utf-8')
      const parsed = JSON.parse(raw) as { tiers?: Record<string, TierEntry> }
      tiersToCheck = parsed.tiers ?? {}
    } else if (defaults.tiers) {
      tiersToCheck = defaults.tiers as Record<string, TierEntry>
    }
    effortCompat = checkEffortModelCompat(tiersToCheck, defaults.model_aliases)
  } catch {
    // Tolerable: if config loading fails, sub-check 2 stays pass
  }

  // Sub-check 4: stale installed tier names in ~/.anvil/models.json
  let staleInstalled: { status: 'pass' | 'warn'; staleKeys: string[] } = {
    status: 'pass',
    staleKeys: [],
  }
  try {
    const installedModelsPath = join(anvilHome, 'models.json')
    if (existsSync(installedModelsPath)) {
      const raw = readFileSync(installedModelsPath, 'utf-8')
      const parsed = JSON.parse(raw) as { tiers?: Record<string, unknown> }
      staleInstalled = checkStaleInstalledTiers(parsed)
    } else {
      staleInstalled = checkStaleInstalledTiers(null)
    }
  } catch {
    // Tolerable
  }

  // Compute worst-of status across all 4 sub-checks
  let overallStatus: 'pass' | 'warn' | 'fail' = 'pass'
  for (const s of [
    nameValidity.status,
    effortCompat.status,
    migrationCheck.status,
    staleInstalled.status,
  ]) {
    overallStatus = worstStatus(overallStatus, s)
  }

  // Format sub-check summary inline
  const sub1Label =
    nameValidity.status === 'pass'
      ? 'name validity: pass'
      : `name validity: fail (${nameValidity.offenders.length} offender(s): ${nameValidity.offenders.join(', ')})`

  const sub2Label =
    effortCompat.status === 'pass'
      ? 'effort/model compat: pass'
      : `effort/model compat: warn (${effortCompat.warnings.length})`

  const sub3Label =
    migrationCheck.status === 'pass'
      ? 'migration: pass'
      : `migration: fail (${migrationCheck.offenders.length} offender(s): ${migrationCheck.offenders.join(', ')})`

  const sub4Label =
    staleInstalled.status === 'pass'
      ? 'stale install: pass'
      : `stale install: warn (${staleInstalled.staleKeys.join(', ')} — run \`anvil install --reinstall\`)`

  checks.push({
    name: 'Tier integrity',
    status: overallStatus,
    detail: `${sub1Label}; ${sub2Label}; ${sub3Label}; ${sub4Label}`,
  })
}

// ─── Plan 39 Phase B — CSO discipline ────────────────────────────────────────

const CSO_WORKFLOW_VERB_PREFIXES: readonly RegExp[] = [
  /^A skill that\b/i,
  /^This skill (?:is for|provides|helps|allows)\b/i,
  /^Provides\b/i,
  /^Helps\b/i,
  /^Allows\b/i,
  /^Reviews\b/,
  /^Writes\b/,
  /^Produces\b/,
  /^Drafts\b/,
  /^Identifies\b/,
  /^Maps\b/,
  /^Generates\b/,
  /^Removes\b/,
  /^Scaffolds\b/,
  /^Verifies\b/,
  /^Routes\b/,
  /^Traces\b/,
  /^Reads\b/,
  /^Scans\b/,
  /^Fans\b/,
  /^Summarizes\b/,
  /^Simplifies\b/,
  /^Audits\b/,
  /^Evaluates\b/,
  /^Captures\b/,
  /^Creates\b/,
  /^Analyzes\b/,
  /^Explores\b/,
  /^Breaks\b/,
  /^Completes\b/,
  /^Executes\b/,
  /^Orchestrates\b/,
  /^Prevents\b/,
  /^Picks\b/,
  /^Chooses\b/,
  /^Constructs\b/,
  /^Converts\b/,
] as const

const CSO_ACCEPTED_PREFIX =
  /^(Use (?:when|before|after|to|for) |Run when |Invoked? (?:when|before) |Activate when |Triggered when |Triggers on |MUST consult|When |Applies when |For )/

function walkCsoSkillFiles(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (name === 'CLAUDE.md' || name === 'AGENTS.md') continue
      const full = join(dir, name)
      let stat: { isDirectory: boolean; isFile: boolean }
      try {
        const s = statSync(full)
        stat = { isDirectory: s.isDirectory(), isFile: s.isFile() }
      } catch {
        continue
      }
      if (stat.isDirectory) {
        stack.push(full)
      } else if (stat.isFile && name.endsWith('.md')) {
        out.push(full)
      }
    }
  }
  return out
}

function extractCsoDescription(content: string): string | null {
  const match = content.match(/^description:\s*(.+)$/m)
  if (!match) return null
  return match[1].trim().replace(/^["']|["']$/g, '')
}

/**
 * Non-blocking lint: count skill descriptions that fail the CSO discipline.
 */
export function pushCsoDisciplineCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
): void {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'CSO discipline',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  const files = walkCsoSkillFiles(skillsRoot)
  const offenders: string[] = []
  for (const path of files) {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    const desc = extractCsoDescription(text)
    if (desc === null) continue

    const fails =
      !CSO_ACCEPTED_PREFIX.test(desc) ||
      CSO_WORKFLOW_VERB_PREFIXES.some((p) => p.test(desc))
    if (fails) offenders.push(path.replace(/^.*?skills\//, 'skills/'))
  }

  if (offenders.length === 0) {
    checks.push({
      name: 'CSO discipline',
      status: 'pass',
      detail: `${files.length} skill descriptions follow CSO discipline`,
    })
    return
  }

  const preview = offenders.slice(0, 3).join(', ')
  const more = offenders.length > 3 ? ` (+${offenders.length - 3} more)` : ''
  checks.push({
    name: 'CSO discipline',
    status: 'warn',
    detail: `${offenders.length} skill description(s) fail CSO discipline: ${preview}${more}`,
  })
}

// ─── ANV-0042 — Description budget lint ──────────────────────────────────

const DESC_WARN_THRESHOLD = 280
const DESC_HARD_LIMIT = 512

function extractDescriptionForBudget(content: string): string | null {
  // Only scan the frontmatter block (between leading --- and the next ---).
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const yaml = fmMatch ? fmMatch[1] : content
  const lines = yaml.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^description:\s*(.*)$/)
    if (!m) continue
    const rest = m[1]
    // Block scalar: collect indented continuation lines.
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const buf: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const ln = lines[j]
        if (/^\S/.test(ln) && ln.trim() !== '') break
        buf.push(ln.replace(/^\s+/, ''))
      }
      const sep = rest.startsWith('>') ? ' ' : '\n'
      return buf.join(sep).trim()
    }
    // Inline (possibly quoted).
    return rest.trim().replace(/^["']|["']$/g, '')
  }
  return null
}

export function pushDescriptionBudgetCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
): void {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'description budget',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  const files = walkCsoSkillFiles(skillsRoot)
  const overHard: Array<{ path: string; len: number }> = []
  const warnings: Array<{ path: string; len: number }> = []
  let scanned = 0

  for (const path of files) {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    const desc = extractDescriptionForBudget(text)
    if (desc === null) continue
    scanned++
    const len = desc.length
    const rel = path.replace(/^.*?skills\//, 'skills/')
    if (len > DESC_HARD_LIMIT) {
      overHard.push({ path: rel, len })
    } else if (len >= DESC_WARN_THRESHOLD) {
      warnings.push({ path: rel, len })
    }
  }

  if (overHard.length > 0) {
    const preview = overHard
      .slice(0, 3)
      .map((o) => `${o.path} (${o.len}c)`)
      .join(', ')
    const more = overHard.length > 3 ? ` (+${overHard.length - 3} more)` : ''
    checks.push({
      name: 'description budget',
      status: 'fail',
      detail: `${overHard.length} skill description(s) exceed ${DESC_HARD_LIMIT}-char hard limit: ${preview}${more}`,
    })
    return
  }

  if (warnings.length > 0) {
    const preview = warnings
      .slice(0, 3)
      .map((w) => `${w.path} (${w.len}c)`)
      .join(', ')
    const more = warnings.length > 3 ? ` (+${warnings.length - 3} more)` : ''
    checks.push({
      name: 'description budget',
      status: 'warn',
      detail: `${warnings.length} skill description(s) ≥${DESC_WARN_THRESHOLD} chars (may exceed selector budget): ${preview}${more}`,
    })
    return
  }

  checks.push({
    name: 'description budget',
    status: 'pass',
    detail: `${scanned} skill description(s) within ${DESC_WARN_THRESHOLD}-char comfort budget`,
  })
}

// ─── ANV-0058 review: Skill version coverage ─────────────────────────────────

export function computeSkillVersionCoverage(
  skills: ReadonlyArray<{ name: string; version?: string }>,
): { missing: string[]; total: number; coverage: number } {
  const missing = skills.filter((s) => !s.version).map((s) => s.name)
  const total = skills.length
  const coverage = total === 0 ? 1 : (total - missing.length) / total
  return { missing, total, coverage }
}

export async function pushSkillVersionCoverageCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  showMigration = false,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill version coverage',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const rows = reg.getAll().map((s) => ({
      name: s.frontmatter.name,
      version: s.frontmatter.version,
    }))
    const { missing, total, coverage } = computeSkillVersionCoverage(rows)
    if (missing.length === 0) {
      checks.push({
        name: 'Skill version coverage',
        status: 'pass',
        detail: `${total} skill(s) all declare version`,
      })
    } else {
      const missingRatio = total === 0 ? 0 : missing.length / total
      const threshold = getMigrationWindowThreshold()
      if (!showMigration && missingRatio >= threshold) {
        const roundedPct = Math.round(missingRatio * 100)
        checks.push({
          name: 'Skill version coverage',
          status: 'skip',
          detail: `~${roundedPct}% of skills haven't adopted \`version:\` yet — suppressed during migration window (pass --show-migration to see the warn during back-fill)`,
        })
      } else {
        const pct = (coverage * 100).toFixed(1)
        const preview = missing.slice(0, 5).join(', ')
        const more = missing.length > 5 ? ` …+${missing.length - 5} more` : ''
        checks.push({
          name: 'Skill version coverage',
          status: 'warn',
          detail: `${missing.length} of ${total} skill(s) missing version (${pct}% covered): ${preview}${more}`,
        })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push({
      name: 'Skill version coverage',
      status: 'skip',
      detail: `unable to load skills: ${msg}`,
    })
  }
}

// ─── ANV-0058 review: Skill version regression ───────────────────────────────

export function computeSkillVersionRegressions(
  skills: ReadonlyArray<{
    name: string
    currentVersion?: string
    priorVersion?: string
  }>,
): Array<{ name: string; current: string; prior: string }> {
  const regressions: Array<{ name: string; current: string; prior: string }> =
    []
  for (const s of skills) {
    if (!s.currentVersion || !s.priorVersion) continue
    if (semverLt(s.currentVersion, s.priorVersion)) {
      regressions.push({
        name: s.name,
        current: s.currentVersion,
        prior: s.priorVersion,
      })
    }
  }
  return regressions
}

export async function pushSkillVersionRegressionCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
): Promise<void> {
  const skillsRoot = join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill version regression',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const allSkills = reg.getAll()

    // Resolve a stable merge-base anchor instead of HEAD~1 to avoid
    // false regressions when running from a worktree branched off an older
    // commit. Candidate order: release branch first (most stable anchor for
    // in-flight work), then origin/main, then local main.
    // All-fail → skip (correct behaviour under a shallow/un-fetched clone).
    let mergeBase: string | undefined
    try {
      const pkgRoot = join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        '..',
      )
      const rawPkg = readFileSync(join(pkgRoot, 'package.json'), 'utf-8')
      const parsedPkg = JSON.parse(rawPkg) as { version?: unknown }
      const pkgVersion =
        typeof parsedPkg.version === 'string' ? parsedPkg.version : '0.0.0'
      const releaseBranch =
        process.env.ANVIL_RELEASE_BRANCH ?? deriveReleaseBranch(pkgVersion)
      const candidateRefs = [`origin/${releaseBranch}`, 'origin/main', 'main']
      for (const ref of candidateRefs) {
        const result = spawnSync('git', ['merge-base', 'HEAD', ref], {
          cwd,
          encoding: 'utf-8',
          stdio: 'pipe',
        })
        if (result.status === 0 && result.stdout.trim()) {
          mergeBase = result.stdout.trim()
          break
        }
      }
    } catch {
      // package.json unreadable — fall through to skip below
    }

    if (!mergeBase) {
      checks.push({
        name: 'Skill version regression',
        status: 'skip',
        detail: 'no merge-base with release branch available',
      })
      return
    }

    const triples: Array<{
      name: string
      currentVersion?: string
      priorVersion?: string
    }> = []

    for (const skill of allSkills) {
      const currentVersion = skill.frontmatter.version
      // Only bother checking git history if the skill has a current version.
      if (!currentVersion) continue

      // Compute relative path for `git show <merge-base>:<relpath>`.
      const relPath = skill.sourcePath.startsWith(cwd)
        ? skill.sourcePath.slice(cwd.length).replace(/^\//, '')
        : skill.sourcePath

      const gitShow = spawnSync('git', ['show', `${mergeBase}:${relPath}`], {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      if (gitShow.status !== 0) {
        // File may be new (added after merge-base) — not a regression.
        continue
      }
      const priorVersion = parseVersionFromRawFrontmatter(gitShow.stdout)
      triples.push({
        name: skill.frontmatter.name,
        currentVersion,
        priorVersion,
      })
    }

    const regressions = computeSkillVersionRegressions(triples)
    if (regressions.length === 0) {
      checks.push({
        name: 'Skill version regression',
        status: 'pass',
        detail: `${triples.length} versioned skill(s) checked — no regressions`,
      })
    } else {
      const summary = regressions
        .slice(0, 3)
        .map((r) => `${r.name}: ${r.current} < ${r.prior}`)
        .join('; ')
      const more = regressions.length > 3 ? ` …+${regressions.length - 3}` : ''
      checks.push({
        name: 'Skill version regression',
        status: 'fail',
        detail: `${regressions.length} version regression(s): ${summary}${more}`,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push({
      name: 'Skill version regression',
      status: 'skip',
      detail: `unable to load skills: ${msg}`,
    })
  }
}

// ─── ANV-0058 review: Skill provenance freshness ─────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function computeSkillProvenanceFreshness(
  skills: ReadonlyArray<{
    name: string
    hasProvenance: boolean
    lastModifiedMs: number
  }>,
  now: number = Date.now(),
): string[] {
  return skills
    .filter((s) => !s.hasProvenance && now - s.lastModifiedMs <= THIRTY_DAYS_MS)
    .map((s) => s.name)
}

export async function pushSkillProvenanceFreshnessCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  showMigration = false,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill provenance freshness',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const allSkills = reg.getAll()
    const total = allSkills.length
    const now = Date.now()

    const rows = allSkills.map((s) => {
      const hasProvenance = s.frontmatter.provenance !== undefined
      // Try git log first; fall back to mtime.
      let lastModifiedMs: number
      const relPath = s.sourcePath.startsWith(cwd)
        ? s.sourcePath.slice(cwd.length).replace(/^\//, '')
        : s.sourcePath
      const gitLog = spawnSync(
        'git',
        ['log', '-1', '--format=%ct', '--', relPath],
        { cwd, encoding: 'utf-8', stdio: 'pipe' },
      )
      const ts =
        gitLog.status === 0
          ? Number.parseInt(gitLog.stdout.trim(), 10)
          : Number.NaN
      if (!Number.isNaN(ts) && ts > 0) {
        lastModifiedMs = ts * 1000
      } else {
        try {
          lastModifiedMs = statSync(s.sourcePath).mtimeMs
        } catch {
          lastModifiedMs = 0
        }
      }
      return { name: s.frontmatter.name, hasProvenance, lastModifiedMs }
    })

    const stale = computeSkillProvenanceFreshness(rows, now)
    if (stale.length === 0) {
      const recent = rows.filter(
        (r) => now - r.lastModifiedMs <= THIRTY_DAYS_MS,
      ).length
      checks.push({
        name: 'Skill provenance freshness',
        status: 'pass',
        detail: `${recent} recently modified skill(s) all declare provenance`,
      })
    } else {
      const missingRatio = total === 0 ? 0 : stale.length / total
      const threshold = getMigrationWindowThreshold()
      if (!showMigration && missingRatio >= threshold) {
        const roundedPct = Math.round(missingRatio * 100)
        checks.push({
          name: 'Skill provenance freshness',
          status: 'skip',
          detail: `~${roundedPct}% of skills haven't adopted \`provenance:\` yet — suppressed during migration window (pass --show-migration to see the warn during back-fill)`,
        })
      } else {
        const preview = stale.slice(0, 5).join(', ')
        const more = stale.length > 5 ? ` …+${stale.length - 5} more` : ''
        checks.push({
          name: 'Skill provenance freshness',
          status: 'warn',
          detail: `${stale.length} recently modified skill(s) missing provenance: ${preview}${more}`,
        })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push({
      name: 'Skill provenance freshness',
      status: 'skip',
      detail: `unable to load skills: ${msg}`,
    })
  }
}

/**
 * Plan 43 Phase I — required_reading budget doctor row.
 */
export function pushRequiredReadingBudgetCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  agentsRootOverride?: string,
): void {
  const agentsRoot = agentsRootOverride ?? join(cwd, 'agents')
  if (!inProject || !existsSync(agentsRoot)) {
    checks.push({
      name: 'Required reading budget',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  const offenders: Array<{ name: string; bytes: number }> = []
  let totalAgents = 0

  // Lightweight frontmatter scan — avoid full agent loader to keep doctor fast.
  for (const name of readdirSync(agentsRoot)) {
    if (!name.endsWith('.md')) continue
    totalAgents++
    const full = join(agentsRoot, name)
    let src: string
    try {
      src = readFileSync(full, 'utf-8')
    } catch {
      continue
    }
    if (!src.startsWith('---\n')) continue
    const end = src.indexOf('\n---\n', 4)
    if (end === -1) continue
    const fm = src.slice(4, end)

    // Match `required_reading:` followed by `  - <path>` lines (YAML list).
    const blockMatch = fm.match(
      /^required_reading:\s*\n((?:\s+-\s+\S+\s*\n?)+)/m,
    )
    if (!blockMatch) continue
    const paths = Array.from(blockMatch[1].matchAll(/^\s+-\s+(\S+)\s*$/gm)).map(
      (m) => m[1],
    )

    let total = 0
    for (const p of paths) {
      const abs = join(cwd, p)
      if (!existsSync(abs)) continue
      try {
        total += readFileSync(abs, 'utf-8').length
      } catch {
        // skip
      }
    }
    if (total > REQUIRED_READING_BYTE_CAP) {
      offenders.push({ name, bytes: total })
    }
  }

  if (offenders.length === 0) {
    checks.push({
      name: 'Required reading budget',
      status: 'pass',
      detail: `${totalAgents} agent(s) within 8 KB required_reading budget`,
    })
    return
  }

  offenders.sort((a, b) => b.bytes - a.bytes)
  const list = offenders
    .slice(0, 3)
    .map((o) => `${o.name} (${(o.bytes / 1024).toFixed(1)} KB)`)
    .join(', ')
  const more = offenders.length > 3 ? ` …+${offenders.length - 3}` : ''
  checks.push({
    name: 'Required reading budget',
    status: 'warn',
    detail: `${offenders.length} agent(s) exceed 8 KB required_reading budget: ${list}${more} — dispatcher will truncate at runtime`,
  })
}

// ─── ANV-0092 — Composition overlay doctor row ───────────────────────────────

/**
 * Lists all active composition overlays (skills that declare strategy +
 * extends_skill) in the loaded registry.  Surfaces the strategy + core name
 * so operators can see which overlays are active at a glance.
 */
export async function pushCompositionOverlaysCheck(
  checks: Check[],
  cwd: string,
  anvilHome: string,
): Promise<void> {
  const skillsRoot = resolveSkillsRoot(cwd, anvilHome)
  if (!skillsRoot) {
    // No skills/ tree — skip silently (same as other skill checks).
    return
  }

  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const allSkills = reg.getAll()

    const overlays = allSkills
      .filter(
        (s) =>
          s.frontmatter.strategy !== undefined &&
          s.frontmatter.extends_skill !== undefined,
      )
      .map(
        (s) =>
          `${s.frontmatter.name} (${s.frontmatter.strategy} ← ${s.frontmatter.extends_skill})`,
      )

    if (overlays.length === 0) {
      checks.push({
        name: 'Composition overlays',
        status: 'pass',
        detail: 'no active composition overlays',
      })
    } else {
      const preview = overlays.slice(0, 5).join(', ')
      const more = overlays.length > 5 ? ` …+${overlays.length - 5}` : ''
      checks.push({
        name: 'Composition overlays',
        status: 'pass',
        detail: `${overlays.length} active overlay(s): ${preview}${more}`,
      })
    }
  } catch (err) {
    checks.push({
      name: 'Composition overlays',
      status: 'skip',
      detail: `unable to load skills: ${(err as Error).message}`,
    })
  }
}

/**
 * E-005 — Required reading paths resolve doctor row (D-03, D-10).
 */
export function pushRequiredReadingPathsResolveCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  agentsRootOverride?: string,
): void {
  const agentsRoot = agentsRootOverride ?? join(cwd, 'agents')
  if (!inProject || !existsSync(agentsRoot)) {
    checks.push({
      name: 'Required reading paths resolve',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  const missingPaths: Array<{ agent: string; path: string }> = []
  let totalAgents = 0

  for (const name of readdirSync(agentsRoot)) {
    if (!name.endsWith('.md')) continue
    totalAgents++
    const full = join(agentsRoot, name)
    let src: string
    try {
      src = readFileSync(full, 'utf-8')
    } catch {
      continue
    }
    if (!src.startsWith('---\n')) continue
    const end = src.indexOf('\n---\n', 4)
    if (end === -1) continue
    const fm = src.slice(4, end)

    // Use non-greedy horizontal whitespace to avoid consuming newlines in list.
    const blockMatch = fm.match(
      /^required_reading:[ \t]*\n((?:[ \t]+-[ \t]+\S+[ \t]*\n?)+)/m,
    )
    if (!blockMatch) continue
    const paths = Array.from(
      blockMatch[1].matchAll(/^[ \t]+-[ \t]+(\S+)[ \t]*$/gm),
    ).map((m) => m[1])

    for (const p of paths) {
      const abs = join(cwd, p)
      if (!existsSync(abs)) {
        missingPaths.push({ agent: name, path: p })
        continue
      }
      try {
        readFileSync(abs, 'utf-8')
      } catch {
        missingPaths.push({ agent: name, path: p })
      }
    }
  }

  if (missingPaths.length === 0) {
    checks.push({
      name: 'Required reading paths resolve',
      status: 'pass',
      detail: `${totalAgents} agent(s); all required_reading paths resolve`,
    })
    return
  }

  const offenderLabels = missingPaths
    .slice(0, 3)
    .map((o) => `${o.agent}:${o.path}`)
    .join(', ')
  const more =
    missingPaths.length > 3 ? ` …+${missingPaths.length - 3} more` : ''
  checks.push({
    name: 'Required reading paths resolve',
    status: 'warn',
    detail: `${missingPaths.length} unresolved path(s): ${offenderLabels}${more}`,
  })
}
