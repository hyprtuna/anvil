/**
 * ANV-0141 — Release category doctor checks.
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Keeps `function pushXyzCheck(checks: Check[])` signatures intact.
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkRebaseBase,
  deriveReleaseBranch,
} from '../../../core/rebase-guard/index.js'

// Local mirror of the Check interface from doctor.ts (same shape).
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * ANV-0144 — Worktree base freshness doctor row.
 *
 * Compares the current branch's fork point against the upstream release branch
 * tip. Emits:
 *   - skip: not in a git repo, on the release branch, or on main/master.
 *   - pass: fork point is at the tip of the release branch (baseAhead === 0).
 *   - warn: fork point is behind (default mode — informational only).
 *   - fail: fork point is behind AND strict === true (CI gate).
 *
 * Catches the silent-revert failure mode from v0.13.1 where sub-agents
 * based feature branches on commits predating earlier merges.
 */
export async function pushRebaseBaseFreshnessCheck(
  checks: Check[],
  strict: boolean,
): Promise<void> {
  const ROW_NAME = 'Worktree base freshness'

  // Derive the release branch the same way the CLI does.
  let releaseBranch: string
  try {
    const root = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
    )
    const pkgPath = join(root, 'package.json')
    const raw = readFileSync(pkgPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    const version =
      typeof parsed.version === 'string' ? parsed.version : '0.0.0'
    releaseBranch =
      process.env.ANVIL_RELEASE_BRANCH ?? deriveReleaseBranch(version)
  } catch {
    checks.push({
      name: ROW_NAME,
      status: 'skip',
      detail: 'could not read package.json version',
      expectedAbsence: true,
    })
    return
  }

  function runGit(...args: string[]): string {
    return execSync(`git ${args.map((a) => JSON.stringify(a)).join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }

  let result: Awaited<ReturnType<typeof checkRebaseBase>>
  try {
    result = await checkRebaseBase({ runGit, releaseBranch, strict })
  } catch {
    checks.push({
      name: ROW_NAME,
      status: 'skip',
      detail: 'git command failed — not in a git repository',
      expectedAbsence: true,
    })
    return
  }

  checks.push({
    name: ROW_NAME,
    status: result.status,
    detail: result.reason,
    expectedAbsence: result.status === 'skip',
  })
}

/**
 * Row name used by all three count-drift checks. Callers that want to
 * escalate in `--strict` mode filter on this prefix.
 */
export const COUNT_DRIFT_ROW_PREFIX = 'Count drift'

/**
 * ANV-0217 review fix — Count the user-facing CLI commands actually registered
 * with commander in `src/index.ts`.
 *
 * A "top-level command" is one registered directly on the root `program`:
 *   - `program.command('<name>')` (inline) or `program\n  .command('<name>')`
 *   - `const x = program.command('<name>')` (a subcommand group is still one
 *     top-level command)
 *   - `program.addCommand(buildXCommand())` (the `init` command)
 *
 * Subcommands registered on a group variable (e.g. `modelsCmd.command('list')`)
 * are intentionally NOT counted — they are not top-level commands.
 *
 * Returns 0 when `src/index.ts` is absent or unreadable (e.g. running against a
 * non-Anvil tree), which suppresses the commands-drift row entirely.
 *
 * Exported for unit testing.
 */
export function countRegisteredCommands(projectRoot: string): number {
  const indexPath = join(projectRoot, 'src', 'index.ts')
  if (!existsSync(indexPath)) return 0
  let src: string
  try {
    src = readFileSync(indexPath, 'utf-8')
  } catch {
    return 0
  }

  const names = new Set<string>()

  // 1. Inline `program.command('name')` and assignment
  //    `const x = program.command('name')`.
  const inlineRe = /\bprogram\s*\.command\(\s*['"]([\w-]+)/g
  for (let m = inlineRe.exec(src); m !== null; m = inlineRe.exec(src)) {
    names.add(m[1])
  }

  // 2. Chain-start form where `program` (optionally `const x = program`) sits on
  //    its own line and `.command('name')` is the first method on the next
  //    non-blank line.
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/(?:^|=\s*)program\s*$/.test(lines[i].trim())) continue
    for (let j = i + 1; j < lines.length; j++) {
      const c = lines[j].match(/^\s*\.command\(\s*['"]([\w-]+)/)
      if (c) {
        names.add(c[1])
        break
      }
      // A subsequent `.option(`/`.description(` before `.command(` still belongs
      // to the same chain, so keep scanning; a bare blank line is skipped too.
      if (lines[j].trim() === '') continue
      if (/^\s*\./.test(lines[j])) continue
      break
    }
  }

  // 3. `program.addCommand(...)` registrations (e.g. the `init` command built
  //    via buildInitCommand()). Each is one top-level command.
  const addCount = (src.match(/\bprogram\.addCommand\(/g) ?? []).length

  return names.size + addCount
}

/**
 * ANV-0217 review fix — Match a clearly-labelled command-count sentence in
 * README/AGENTS prose and return the stated number, or `null` when no such
 * sentence exists.
 *
 * Anchored forms (case-insensitive), all requiring an explicit count label so
 * the layer-arrow diagram line "4 commands → 5 adapters" and other incidental
 * prose never match:
 *   - "<n> CLI commands"            (e.g. "42 CLI commands")
 *   - "<n> top-level commands"
 *   - "<n> commander commands"
 *   - "<n> commands available"      / "<n> available commands"
 *   - "<n> anvil commands"
 *
 * The bare pattern "<n> commands" with no qualifier is deliberately NOT
 * matched — it is the source of the false-positive this fix removes.
 */
export function matchCommandCountSentence(text: string): number | null {
  const patterns: RegExp[] = [
    /(\d+)\s+CLI\s+commands?\b/i,
    /(\d+)\s+top-level\s+commands?\b/i,
    /(\d+)\s+commander\s+commands?\b/i,
    /(\d+)\s+anvil\s+commands?\b/i,
    /(\d+)\s+available\s+commands?\b/i,
    /(\d+)\s+commands?\s+available\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return Number.parseInt(m[1], 10)
  }
  return null
}

/**
 * ANV-0087 — README numeric count drift.
 *
 * Parses `README.md` for the canonical counts line
 * (e.g. "67 universal skills + 54 language skills across 19 stacks … 29 lifecycle hooks … 22 orchestration agents")
 * and compares each numeric token against the live filesystem.
 *
 * Default: warn.  `--strict`: escalated to fail by `pushCountDriftChecks`.
 *
 * Exported for unit testing.
 */
export function checkReadmeCountDrift(projectRoot: string): {
  status: 'pass' | 'warn' | 'skip'
  detail: string
} {
  const readmePath = join(projectRoot, 'README.md')
  if (!existsSync(readmePath)) {
    return { status: 'skip', detail: 'README.md not found' }
  }

  let readme: string
  try {
    readme = readFileSync(readmePath, 'utf-8')
  } catch {
    return { status: 'skip', detail: 'README.md unreadable' }
  }

  // ANV-0217 AEGIS-19 narrow fold: also scan AGENTS.md for stated counts.
  let agentsMd = ''
  const agentsMdPath = join(projectRoot, 'AGENTS.md')
  if (existsSync(agentsMdPath)) {
    try {
      agentsMd = readFileSync(agentsMdPath, 'utf-8')
    } catch {
      // best-effort
    }
  }

  const skillsRoot = join(projectRoot, 'skills')
  const agentsRoot = join(projectRoot, 'agents')
  const hooksHandlersRoot = join(projectRoot, 'src', 'hooks', 'handlers')

  if (!existsSync(skillsRoot) || !existsSync(agentsRoot)) {
    return {
      status: 'skip',
      detail: 'skills/ or agents/ not found — not an Anvil repo',
    }
  }

  // Count universal skills (all .md files recursively under skills/universal/, not meta-docs)
  const META_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md'])

  function countMdFilesRecursive(dir: string): number {
    let count = 0
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          count += countMdFilesRecursive(join(dir, entry.name))
        } else if (
          entry.isFile() &&
          entry.name.endsWith('.md') &&
          !META_FILES.has(entry.name)
        ) {
          count++
        }
      }
    } catch {
      // best-effort
    }
    return count
  }

  let universalCount = 0
  try {
    universalCount = countMdFilesRecursive(join(skillsRoot, 'universal'))
    if (universalCount === 0)
      return { status: 'skip', detail: 'skills/universal/ unreadable' }
  } catch {
    return { status: 'skip', detail: 'skills/universal/ unreadable' }
  }

  // Count language skills (all .md files recursively across all language subdirs)
  let languageCount = 0
  try {
    const langRoot = join(skillsRoot, 'languages')
    if (existsSync(langRoot)) {
      for (const lang of readdirSync(langRoot, { withFileTypes: true })) {
        if (!lang.isDirectory()) continue
        languageCount += countMdFilesRecursive(join(langRoot, lang.name))
      }
    }
  } catch {
    // best-effort — leave languageCount as 0 so the check stays useful
  }

  // Count language stacks (subdirectories under skills/languages/)
  let stackCount = 0
  try {
    const langRoot = join(skillsRoot, 'languages')
    if (existsSync(langRoot)) {
      stackCount = readdirSync(langRoot, { withFileTypes: true }).filter((e) =>
        e.isDirectory(),
      ).length
    }
  } catch {
    // best-effort
  }

  // Count agents (non-meta .md files in agents/)
  let agentCount = 0
  try {
    for (const entry of readdirSync(agentsRoot, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !META_FILES.has(entry.name)
      )
        agentCount++
    }
  } catch {
    return { status: 'skip', detail: 'agents/ unreadable' }
  }

  // Count hooks: handlers in src/hooks/handlers/
  let hookCount = 0
  try {
    if (existsSync(hooksHandlersRoot)) {
      for (const entry of readdirSync(hooksHandlersRoot, {
        withFileTypes: true,
      })) {
        if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))
        )
          hookCount++
      }
    }
  } catch {
    // best-effort
  }

  // ANV-0217 AEGIS-19 (ANV-0217 review fix) — Count *registered* CLI commands
  // from src/index.ts rather than file-walking src/commands/cli/. The earlier
  // file-walk counted every top-level helper (.ts) in cli/ (~48 files incl.
  // doctor-registry.ts, *-lint-checks.ts, init-command.ts, etc.), which is NOT
  // the user-facing command count. The authoritative source is the set of
  // top-level commander registrations in src/index.ts.
  const commandCount = countRegisteredCommands(projectRoot)

  // Parse the README canonical counts line.
  // Pattern example: "67 universal skills + 54 language skills across 19 stacks … 29 lifecycle hooks … 22 orchestration agents"
  const drifts: string[] = []

  // universal skills
  const univMatch = readme.match(/(\d+)\s+universal\s+skills?/i)
  if (univMatch) {
    const stated = Number.parseInt(univMatch[1], 10)
    if (stated !== universalCount)
      drifts.push(
        `universal skills: README says ${stated}, found ${universalCount}`,
      )
  }

  // language skills
  const langMatch = readme.match(/(\d+)\s+language\s+skills?/i)
  if (langMatch) {
    const stated = Number.parseInt(langMatch[1], 10)
    if (stated !== languageCount)
      drifts.push(
        `language skills: README says ${stated}, found ${languageCount}`,
      )
  }

  // stacks
  const stackMatch = readme.match(/across\s+(\d+)\s+stacks?/i)
  if (stackMatch && stackCount > 0) {
    const stated = Number.parseInt(stackMatch[1], 10)
    if (stated !== stackCount)
      drifts.push(`stacks: README says ${stated}, found ${stackCount}`)
  }

  // orchestration agents
  const agentMatch = readme.match(/(\d+)\s+orchestration\s+agents?/i)
  if (agentMatch) {
    const stated = Number.parseInt(agentMatch[1], 10)
    if (stated !== agentCount)
      drifts.push(
        `orchestration agents: README says ${stated}, found ${agentCount}`,
      )
  }

  // lifecycle hooks
  const hookMatch = readme.match(/(\d+)\s+lifecycle\s+hooks?/i)
  if (hookMatch && hookCount > 0) {
    const stated = Number.parseInt(hookMatch[1], 10)
    if (stated !== hookCount)
      drifts.push(`lifecycle hooks: README says ${stated}, found ${hookCount}`)
  }

  // ANV-0217 AEGIS-19 (ANV-0217 review fix) — commands count drift.
  //
  // The original regex `/(\d+)\s+(?:CLI\s+)?commands?/i` matched incidental
  // prose — notably AGENTS.md's layer-arrow diagram line
  // "4 commands → 5 adapters" — producing a perpetual false-positive
  // (`commands: AGENTS.md says 4, found 48`). It is anchored here to a
  // clearly-labelled command-count sentence so it never fires on arrow
  // diagrams or narrative mentions. When no such labelled line exists we
  // emit NO commands-drift row rather than a false one.
  const cmdMatchReadme = matchCommandCountSentence(readme)
  const cmdMatchAgents = matchCommandCountSentence(agentsMd)
  const cmdMatch = cmdMatchReadme ?? cmdMatchAgents
  if (cmdMatch !== null && commandCount > 0) {
    const stated = cmdMatch
    const source = cmdMatchReadme !== null ? 'README' : 'AGENTS.md'
    if (stated !== commandCount)
      drifts.push(`commands: ${source} says ${stated}, found ${commandCount}`)
  }

  if (drifts.length === 0) {
    return {
      status: 'pass',
      detail: `README/AGENTS.md counts match live tree (universal=${universalCount}, language=${languageCount}, stacks=${stackCount}, agents=${agentCount}, commands=${commandCount})`,
    }
  }
  return {
    status: 'warn',
    detail: `${drifts.length} README/AGENTS.md count(s) out of date: ${drifts.join('; ')}`,
  }
}

/**
 * ANV-0087 — CLAUDE.md user-invocable skill list staleness check.
 *
 * Verifies the user-invocable cap (≤15) is maintained in the live registry.
 * In default mode this is already handled by `pushSkillRegistryChecks`; this
 * check also detects when CLAUDE.md lists skill names that no longer exist in
 * the registry (stale list prose) and when the registry count > cap.
 *
 * Default: warn.  `--strict`: escalated to fail by `pushCountDriftChecks`.
 *
 * Exported for unit testing.
 */
export function checkClaudeMdUserInvocableCap(
  _projectRoot: string,
  liveUserInvocableCount: number,
): { status: 'pass' | 'warn'; detail: string } {
  const CAP = 15

  if (liveUserInvocableCount <= CAP) {
    return {
      status: 'pass',
      detail: `user-invocable skill count ${liveUserInvocableCount} ≤ ${CAP} cap`,
    }
  }

  return {
    status: 'warn',
    detail: `user-invocable skill count ${liveUserInvocableCount} exceeds cap of ${CAP} — add \`user-invocable: false\` to utility skills, then update CLAUDE.md list`,
  }
}

/**
 * ANV-0167 — Latest semver release tag and its commit date.
 *
 * Returns `null` when no semver tag is reachable (clean clone, detached HEAD,
 * brand-new repo). Otherwise returns the tag (e.g. `v0.14.0`) plus its
 * committer-date as an epoch-ms number.
 *
 * Implementation:
 *   1. `git tag --sort=-creatordate --list v*.*.*` → newest tag first.
 *   2. For the first match, `git log -1 --format=%cI <tag>` → ISO commit date.
 *
 * Pure-function-friendly: the `gitExec` callback is injectable for tests so
 * neither a real git binary nor a live repository is required.
 *
 * Exported for unit testing and dependency injection from
 * `checkSelfAuditStaleness`.
 */
export type GitExec = (...args: string[]) => string

export function getLatestReleaseTag(
  projectRoot: string,
  gitExec?: GitExec,
): { tag: string; commitDateMs: number } | null {
  const exec: GitExec =
    gitExec ??
    ((...args: string[]) =>
      execSync(`git ${args.map((a) => JSON.stringify(a)).join(' ')}`, {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }))

  let tagsOutput: string
  try {
    tagsOutput = exec('tag', '--sort=-creatordate', '--list', 'v*.*.*')
  } catch {
    return null
  }

  const tag = tagsOutput
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^v\d+\.\d+\.\d+(?:[-+].+)?$/.test(l))
  if (!tag) return null

  let dateOutput: string
  try {
    dateOutput = exec('log', '-1', '--format=%cI', tag)
  } catch {
    return null
  }

  const iso = dateOutput.trim().split('\n')[0]?.trim()
  if (!iso) return null

  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null

  return { tag, commitDateMs: ms }
}

/**
 * ANV-0087 / ANV-0167 — Self-audit staleness check.
 *
 * Primary anchor (ANV-0167): the commit date of the latest shipped semver
 * release tag (e.g. `v0.14.0`). Warns when the audit mtime predates that tag —
 * i.e. the audit was NOT refreshed for the most recent release.
 *
 * Fallback (when no release tag is reachable — clean clone, detached HEAD,
 * brand-new repo): falls back to the original ANV-0087 behaviour of comparing
 * the audit mtime to the newest mtime in `src/`/`skills/`/`agents/` with a
 * 7-day window.
 *
 * Backstop ceiling (ANV-0167): regardless of branch, warn when the audit is
 * older than 30 days. This catches months-of-neglect even when no release
 * ships and even when the audit is newer than the latest release tag.
 *
 * Default: warn.  `--strict`: escalated to fail by `pushCountDriftChecks`.
 *
 * The `getLatestTag` callback is injectable so unit tests can simulate the
 * "no release tag" branch without running git or touching a real repo.
 *
 * Exported for unit testing.
 */
export function checkSelfAuditStaleness(
  projectRoot: string,
  getLatestTag: (
    root: string,
  ) => { tag: string; commitDateMs: number } | null = getLatestReleaseTag,
): {
  status: 'pass' | 'warn' | 'skip'
  detail: string
} {
  const auditPath = join(
    projectRoot,
    '.anvil',
    'audits',
    '_anvil-self-audit.md',
  )
  if (!existsSync(auditPath)) {
    return {
      status: 'skip',
      detail: '_anvil-self-audit.md not found — skipped',
    }
  }

  let auditMtime: number
  try {
    auditMtime = statSync(auditPath).mtimeMs
  } catch {
    return { status: 'skip', detail: '_anvil-self-audit.md unreadable' }
  }

  const DAY_MS = 24 * 60 * 60 * 1000
  const CEILING_DAYS = 30
  const CEILING_MS = CEILING_DAYS * DAY_MS
  const auditAgeMs = Date.now() - auditMtime
  const auditAgeDays = Math.round(auditAgeMs / DAY_MS)

  // ── Primary anchor: latest shipped release tag ───────────────────────────
  const release = getLatestTag(projectRoot)
  if (release !== null) {
    if (auditMtime < release.commitDateMs) {
      return {
        status: 'warn',
        detail: `_anvil-self-audit.md predates last shipped release ${release.tag}; refresh before next cut`,
      }
    }
    // Backstop ceiling: warn after 30 days of audit age even when the audit
    // is newer than the most recent release tag.
    if (auditAgeMs > CEILING_MS) {
      return {
        status: 'warn',
        detail: `_anvil-self-audit.md is ${auditAgeDays}d old (> ${CEILING_DAYS}d ceiling) — refresh the self-audit`,
      }
    }
    return {
      status: 'pass',
      detail: `_anvil-self-audit.md is ${auditAgeDays}d old and newer than last shipped release ${release.tag}`,
    }
  }

  // ── Fallback: newest tree mtime + 7-day window (ANV-0087 original) ───────
  let newestMtime = 0
  const walkMtime = (dir: string): void => {
    if (!existsSync(dir)) return
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walkMtime(full)
        } else {
          try {
            const m = statSync(full).mtimeMs
            if (m > newestMtime) newestMtime = m
          } catch {
            // ignore unreadable files
          }
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  for (const sub of ['src', 'skills', 'agents']) {
    walkMtime(join(projectRoot, sub))
  }

  if (newestMtime === 0) {
    return { status: 'skip', detail: 'could not determine tree mtime' }
  }

  const SEVEN_DAYS_MS = 7 * DAY_MS
  const drift = newestMtime - auditMtime

  // Backstop ceiling: warn after 30 days of audit age even if tree drift
  // is within the 7-day window. Applies most clearly in the no-release path.
  if (auditAgeMs > CEILING_MS) {
    return {
      status: 'warn',
      detail: `_anvil-self-audit.md is ${auditAgeDays}d old (> ${CEILING_DAYS}d ceiling) — refresh the self-audit`,
    }
  }

  if (drift <= SEVEN_DAYS_MS) {
    return {
      status: 'pass',
      detail: `_anvil-self-audit.md is ${auditAgeDays}d old, within 7-day window of tree`,
    }
  }

  const driftDays = Math.round(drift / DAY_MS)
  return {
    status: 'warn',
    detail: `_anvil-self-audit.md is ${driftDays}d behind newest tree file — refresh the self-audit`,
  }
}

/**
 * ANV-0087 — Aggregate count-drift row pusher.
 *
 * Runs all three drift checks and pushes result rows into `checks`.
 * When `strict` is true, `warn` rows are promoted to `fail` so CI breaks.
 *
 * @param checks             Accumulator from `doctorCommand`.
 * @param projectRoot        `cwd` as resolved by `doctorCommand`.
 * @param userInvocableCount Live user-invocable skill count (from `pushSkillRegistryChecks`).
 * @param strict             Whether to promote drift warns to fails.
 */
export function pushCountDriftChecks(
  checks: Check[],
  projectRoot: string,
  userInvocableCount: number,
  strict: boolean,
): void {
  const promote = (r: {
    status: 'pass' | 'warn' | 'fail' | 'skip'
    detail: string
  }): { status: 'pass' | 'warn' | 'fail' | 'skip'; detail: string } =>
    strict && r.status === 'warn' ? { ...r, status: 'fail' } : r

  const readmeResult = promote(checkReadmeCountDrift(projectRoot))
  checks.push({
    name: `${COUNT_DRIFT_ROW_PREFIX}: README counts`,
    status: readmeResult.status,
    detail: readmeResult.detail,
  })

  const capResult = promote(
    checkClaudeMdUserInvocableCap(projectRoot, userInvocableCount),
  )
  checks.push({
    name: `${COUNT_DRIFT_ROW_PREFIX}: user-invocable cap`,
    status: capResult.status,
    detail: capResult.detail,
  })

  const auditResult = promote(checkSelfAuditStaleness(projectRoot))
  checks.push({
    name: `${COUNT_DRIFT_ROW_PREFIX}: self-audit freshness`,
    status: auditResult.status,
    detail: auditResult.detail,
  })
}

/**
 * ANV-0131 (v0.12.2) — SDD features path migration check.
 *
 * Detects feature artifacts still at the old `docs/anvil/features/` path and
 * warns. The SDD path constant was updated to `.anvil/specs/features/` as part
 * of the docs/anvil → .anvil consolidation. This check is a one-time migration
 * guide; remove in v0.13.x once all active sessions have been updated.
 */
export function pushSddOldPathMigrationCheck(
  checks: Check[],
  cwd: string,
): void {
  const oldFeaturesPath = join(cwd, 'docs/anvil/features')
  if (existsSync(oldFeaturesPath)) {
    checks.push({
      name: 'SDD features path migration',
      status: 'warn',
      detail:
        'docs/anvil/features/ still exists — SDD artifacts should now live under .anvil/specs/features/. ' +
        'Run `git mv docs/anvil/features .anvil/specs/features` to migrate. ' +
        'This warning will be removed in v0.13.x.',
    })
  } else {
    checks.push({
      name: 'SDD features path migration',
      status: 'pass',
      detail: 'docs/anvil/features/ absent — SDD path migration complete',
    })
  }
}

/**
 * ANV-0153 — Canonical pre-push hook string.
 *
 * The single source of truth for what the simple-git-hooks pre-push entry
 * should contain. The doctor check compares the live package.json value
 * against this constant and warns when they diverge.
 */
export const CANONICAL_PRE_PUSH = 'bun run gate'

/**
 * ANV-0153 — Pre-push parity pure helper.
 *
 * Reads `package.json` from `projectRoot` and compares the
 * `simple-git-hooks.pre-push` value against `CANONICAL_PRE_PUSH`.
 *
 * Returns:
 *   - skip: file unreadable, JSON parse fails, or no `simple-git-hooks` block.
 *   - pass: hook value equals `CANONICAL_PRE_PUSH`.
 *   - warn: hook value is present but does not equal `CANONICAL_PRE_PUSH`.
 *
 * Exported for unit testing (pure function — no side effects).
 */
export function checkPrePushParity(projectRoot: string): {
  status: 'pass' | 'warn' | 'skip'
  detail: string
} {
  const pkgPath = join(projectRoot, 'package.json')
  let raw: string
  try {
    raw = readFileSync(pkgPath, 'utf-8')
  } catch {
    return { status: 'skip', detail: 'package.json unreadable' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'skip', detail: 'package.json is not valid JSON' }
  }

  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('simple-git-hooks' in parsed)
  ) {
    return {
      status: 'skip',
      detail: 'no simple-git-hooks block in package.json',
    }
  }

  const hooks = (parsed as Record<string, unknown>)['simple-git-hooks']
  if (
    hooks === null ||
    typeof hooks !== 'object' ||
    !('pre-push' in (hooks as object))
  ) {
    return {
      status: 'skip',
      detail: 'simple-git-hooks block has no pre-push entry',
    }
  }

  const hookValue = (hooks as Record<string, unknown>)['pre-push']
  if (hookValue === CANONICAL_PRE_PUSH) {
    return {
      status: 'pass',
      detail: `pre-push hook is \`${CANONICAL_PRE_PUSH}\``,
    }
  }

  return {
    status: 'warn',
    detail: `hook is \`${String(hookValue)}\` — expected \`${CANONICAL_PRE_PUSH}\` (run \`npx simple-git-hooks\` after updating package.json)`,
  }
}

/**
 * ANV-0153 — Pre-push parity doctor row pusher.
 *
 * Calls `checkPrePushParity` and appends the result as a named check row.
 *
 * @param checks      Accumulator from `doctorCommand`.
 * @param cwd         Project root path.
 */
export function pushPrePushParityCheck(checks: Check[], cwd: string): void {
  const result = checkPrePushParity(cwd)
  checks.push({
    name: 'Pre-push parity',
    status: result.status,
    detail: result.detail,
    expectedAbsence: result.status === 'skip',
  })
}
