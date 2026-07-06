/**
 * ANV-0141 — Content category doctor checks.
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Keeps `function pushXyzCheck(checks: Check[])` signatures intact.
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * Plan 42 D-05 — un-versioned TODO/FIXME/XXX matcher.
 *
 * Anvil convention is `TODO(v0.10.X) ...` — bare markers without a
 * version tag are flagged.
 */
export function findUnversionedTodos(text: string): string[] {
  // A TODO/FIXME/XXX *marker* is followed by `:` or `(...)`. Bare prose
  // mentions like "TBD" or "TODO comments" are not markers and are
  // intentionally not flagged (false-positive prevention).
  const re = /\b(TODO|FIXME|XXX)(\s*[:\(])/g
  const out: string[] = []
  for (const m of text.matchAll(re)) {
    const sep = m[2].trim()
    if (sep.startsWith('(')) {
      // Look at the parenthesized payload — if it starts with `v\d+.\d+`,
      // the marker carries a version tag and is acceptable.
      const after = text.slice((m.index ?? 0) + m[1].length + sep.length)
      if (/^v\d+\.\d+/.test(after)) continue
    }
    out.push(m[0])
  }
  return out
}

/**
 * Plan 42 D-05 — broken plan-reference matcher.
 *
 * ANV-0131 (v0.12.2): plans moved from `docs/anvil/plans/` to
 * `.anvil/_archive/docs-anvil/plans/`. This function checks the old
 * path first, then falls back to the new archive path so refs written
 * before the migration still resolve.
 * TODO(v0.13.x): remove the old-path fallback once all cross-references
 * have been updated to the new archive path.
 */
export function findBrokenPlanRefs(text: string, cwd: string): string[] {
  const re = /docs\/anvil\/plans\/\d{4}-\d{2}-\d{2}-\d+-[^\s\)\]]+\.md/g
  const out: string[] = []
  for (const m of text.matchAll(re)) {
    const oldPath = m[0]
    const newPath = oldPath.replace(
      'docs/anvil/plans/',
      '.anvil/_archive/docs-anvil/plans/',
    )
    if (!existsSync(join(cwd, oldPath)) && !existsSync(join(cwd, newPath))) {
      out.push(oldPath)
    }
  }
  return out
}

const STENCIL_PHRASES: ReadonlyArray<string> = [
  'your skill name here',
  'todo: replace this',
  '<!-- placeholder -->',
  'lorem ipsum',
]

/**
 * Plan 42 D-05 — stencil-leakage matcher (case-insensitive).
 *
 * Skips matches inside backtick code spans — those are documentary
 * references to the phrase, not the phrase being used as content.
 */
export function findStencilLeakage(text: string): string[] {
  const out: string[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    // Strip backtick-spans before searching — `foo` and ``bar`` and ```block```
    // remove their contents so documentary mentions don't trip the match.
    const stripped = line.replace(/`+[^`\n]*`+/g, '')
    const lower = stripped.toLowerCase()
    for (const phrase of STENCIL_PHRASES) {
      if (lower.includes(phrase)) out.push(phrase)
    }
  }
  return out
}

/**
 * Plan 42 Item E — `Skill content lint` doctor row.
 *
 * Pattern-matches shipped `.md` bodies for un-versioned TODOs, broken
 * plan cross-references, and stencil leakage. Warn-only severity (FP risk).
 */
export function pushSkillContentLintCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
  agentsRootOverride?: string,
): void {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  const agentsRoot = agentsRootOverride ?? join(cwd, 'agents')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill content lint',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }

  const findings: Array<{ file: string; kind: string }> = []
  let scanned = 0
  for (const root of [skillsRoot, agentsRoot]) {
    for (const path of walkSlugFiles(root)) {
      scanned++
      let text: string
      try {
        text = readFileSync(path, 'utf-8')
      } catch {
        continue
      }
      const rel = path.startsWith(cwd) ? path.slice(cwd.length + 1) : path
      if (findUnversionedTodos(text).length > 0)
        findings.push({ file: rel, kind: 'un-versioned TODO/FIXME/XXX' })
      if (findBrokenPlanRefs(text, cwd).length > 0)
        findings.push({ file: rel, kind: 'broken plan ref' })
      if (findStencilLeakage(text).length > 0)
        findings.push({ file: rel, kind: 'stencil leakage' })
    }
  }

  if (findings.length === 0) {
    checks.push({
      name: 'Skill content lint',
      status: 'pass',
      detail: `${scanned} file(s) clean`,
    })
    return
  }
  const list = findings
    .slice(0, 5)
    .map((f) => `${f.file} (${f.kind})`)
    .join('; ')
  const more = findings.length > 5 ? ` …+${findings.length - 5}` : ''
  checks.push({
    name: 'Skill content lint',
    status: 'warn',
    detail: `${findings.length} finding(s): ${list}${more}`,
  })
}

/**
 * Plan 44 Phase D — `Skill provenance coverage` doctor row (Item 21).
 *
 * Pure scoring helper extracted for unit testing. Given a list of skills
 * (or skill-shaped rows with `sourceProvenance`), returns the declared
 * count, total count, coverage ratio, and the row status.
 *
 * Severity rules (per spec D-03):
 *   - skip when total === 0
 *   - pass when coverage >= 0.80
 *   - warn otherwise (never fails — provenance is editorial metadata)
 */
export function computeProvenanceCoverage(
  rows: Array<{ sourceProvenance?: string | undefined }>,
): {
  status: 'pass' | 'warn' | 'skip'
  declared: number
  total: number
  coverage: number
} {
  const total = rows.length
  if (total === 0) {
    return { status: 'skip', declared: 0, total: 0, coverage: 0 }
  }
  const declared = rows.filter(
    (r) => r.sourceProvenance !== undefined && r.sourceProvenance !== 'unknown',
  ).length
  const coverage = declared / total
  const status: 'pass' | 'warn' = coverage >= 0.8 ? 'pass' : 'warn'
  return { status, declared, total, coverage }
}

/**
 * Plan 44 Phase D — `Skill provenance coverage` doctor row (Item 21).
 *
 * Walks the skill registry; counts skills with a non-`unknown` source
 * (loader synthesizes `authored` for shipped universal/language skills,
 * so the threshold is met on a clean tree without any frontmatter sweep).
 */
export async function pushSkillProvenanceCoverageCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill provenance coverage',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const rows = reg
      .getAll()
      .map((s) => ({ sourceProvenance: s.frontmatter.sourceProvenance }))
    const r = computeProvenanceCoverage(rows)
    if (r.status === 'skip') {
      checks.push({
        name: 'Skill provenance coverage',
        status: 'skip',
        detail: 'no skills registered',
      })
      return
    }
    const pct = (r.coverage * 100).toFixed(1)
    checks.push({
      name: 'Skill provenance coverage',
      status: r.status,
      detail:
        r.status === 'pass'
          ? `${r.declared} of ${r.total} skills declare source (${pct}% ≥ 80% threshold)`
          : `${r.declared} of ${r.total} skills declare source (${pct}% < 80% threshold)`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push({
      name: 'Skill provenance coverage',
      status: 'skip',
      detail: `unable to load skills: ${msg}`,
    })
  }
}

/**
 * ANV-0072 — CC-native skill frontmatter fields adoption doctor row.
 *
 * Scans loaded skills and reports how many declare the new CC-native
 * fields introduced in ANV-0072: `context` ('inherit' | 'fork') and
 * `agent` (delegation slug). This is an informational/advisory row only:
 *   - pass  — ≥1 skill declares context: fork or agent (exemplar present)
 *   - warn  — no skills declare these fields yet (adoption not started)
 *   - skip  — not in a project or skills dir absent
 *
 * Unlike provenance coverage (which has a ≥80% threshold), adoption of
 * `context: fork` and `agent` is intentionally opt-in — most skills should
 * run inline (inherit). The row fires `warn` only if zero skills use them,
 * as a signal that the exemplar has not been ported yet.
 */
export function computeSkillCcFieldsAdoption(
  skills: ReadonlyArray<{
    frontmatter: { context?: 'inherit' | 'fork'; agent?: string }
  }>,
): { status: 'pass' | 'warn' | 'skip'; detail: string } {
  const total = skills.length
  if (total === 0) {
    return { status: 'skip', detail: 'no skills registered' }
  }
  let forkCount = 0
  let inheritCount = 0
  let agentCount = 0
  for (const s of skills) {
    if (s.frontmatter.context === 'fork') forkCount++
    else if (s.frontmatter.context === 'inherit') inheritCount++
    if (s.frontmatter.agent !== undefined) agentCount++
  }
  if (forkCount + inheritCount + agentCount === 0) {
    return {
      status: 'warn',
      detail:
        'no skills declare context: or agent: — port at least 1 skill to context: fork as exemplar',
    }
  }
  const parts: string[] = []
  if (forkCount > 0) parts.push(`${forkCount} use context: fork`)
  if (inheritCount > 0) parts.push(`${inheritCount} use context: inherit`)
  if (agentCount > 0) parts.push(`${agentCount} delegate via agent:`)
  return { status: 'pass', detail: parts.join('; ') }
}

export async function pushSkillCcFieldsCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill CC-native fields adoption (context/agent)',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    const { status, detail } = computeSkillCcFieldsAdoption(reg.getAll())
    checks.push({
      name: 'Skill CC-native fields adoption (context/agent)',
      status,
      detail,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push({
      name: 'Skill CC-native fields adoption (context/agent)',
      status: 'fail',
      detail: `failed to load skills: ${msg}`,
    })
  }
}

// ─── ANV-0058: Skill provenance object lint ──────────────────────────────────

/**
 * ANV-0058 — Compute lint results for the structured `provenance` object.
 *
 * Pure function extracted for unit testing.  Accepts skill-shaped rows and
 * returns an array of warning strings for each lint violation found:
 *
 *   1. `generatedBy` declared without `lastUpdated` — incomplete automation
 *      trail; `lastUpdated` is required to make `generatedBy` meaningful.
 *   2. Zero skills declare a `provenance` object at all — coverage advisory
 *      (only emitted when `warnOnZeroCoverage` is true so callers can tune
 *      per-context behaviour; the doctor push always passes true).
 *
 * Never raises — only warns.  Provenance metadata is editorial and its
 * absence must not block skill loading.
 */
export function computeSkillProvenanceObjectLint(
  skills: ReadonlyArray<{
    name: string
    provenance?: {
      generatedBy?: string
      lastUpdated?: string
    }
  }>,
  opts: { warnOnZeroCoverage?: boolean } = {},
): Array<{ skill: string; violation: string }> {
  const warnings: Array<{ skill: string; violation: string }> = []
  let provenanceCount = 0

  for (const s of skills) {
    if (!s.provenance) continue
    provenanceCount++
    if (s.provenance.generatedBy && !s.provenance.lastUpdated) {
      warnings.push({
        skill: s.name,
        violation: `generatedBy "${s.provenance.generatedBy}" declared without lastUpdated`,
      })
    }
  }

  if (opts.warnOnZeroCoverage && skills.length > 0 && provenanceCount === 0) {
    warnings.push({
      skill: '*',
      violation: `0 of ${skills.length} skills declare a provenance object`,
    })
  }

  return warnings
}

/**
 * ANV-0058 — `Skill provenance object` doctor row.
 *
 * Walks all skills and runs `computeSkillProvenanceObjectLint`.
 * Status:
 *   - skip — not in project / no skills dir
 *   - pass — no lint violations found
 *   - warn — ≥1 violations (details list first 3)
 */
export async function pushSkillProvenanceObjectCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!inProject || !existsSync(skillsRoot)) {
    checks.push({
      name: 'Skill provenance object',
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
      provenance: s.frontmatter.provenance,
    }))
    const violations = computeSkillProvenanceObjectLint(rows, {
      warnOnZeroCoverage: true,
    })
    if (violations.length === 0) {
      checks.push({
        name: 'Skill provenance object',
        status: 'pass',
        detail: 'no provenance object lint violations',
      })
    } else {
      const summary = violations
        .slice(0, 3)
        .map((v) =>
          v.skill === '*' ? v.violation : `${v.skill}: ${v.violation}`,
        )
        .join('; ')
      const more = violations.length > 3 ? ` …+${violations.length - 3}` : ''
      checks.push({
        name: 'Skill provenance object',
        status: 'warn',
        detail: `${violations.length} violation(s): ${summary}${more}`,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push({
      name: 'Skill provenance object',
      status: 'skip',
      detail: `unable to load skills: ${msg}`,
    })
  }
}

/**
 * ANV-0114 — expected_tokens coverage row.
 *
 * Surfaces the proportion of installed skills + agents that have not yet
 * adopted the `expected_tokens` frontmatter field. The aggregator counts
 * missing-field items in the "unknown" bucket so they still install; this
 * doctor row warns when a sufficient fraction of the bundle lacks the
 * declaration so authors notice the migration is incomplete.
 *
 * Status semantics:
 *   - pass — every skill + agent declares `expected_tokens` (or no items loaded)
 *   - warn — ≥1 skill/agent missing the field
 *   - skip — not in a project root or no skills/agents directory
 *
 * Warn-not-fail: the field is opt-in for gradual adoption. The row stays
 * warn even at 100% missing so existing installs see a yellow nudge but
 * never a red failure.
 */
export async function pushExpectedTokensCoverageCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  skillsRootOverride?: string,
  agentsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  const agentsRoot = agentsRootOverride ?? join(cwd, 'agents')
  if (!inProject || (!existsSync(skillsRoot) && !existsSync(agentsRoot))) {
    checks.push({
      name: 'expected_tokens coverage',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const { loadAllAgents } = await import('../../../agents/load-all.js')
    const { aggregateExpectedTokens, formatExpectedTokensSummary } =
      await import('../../../core/expected-tokens.js')
    const skillReg = existsSync(skillsRoot)
      ? await loadAllSkills({ skillsRoot })
      : null
    const agentReg = existsSync(agentsRoot)
      ? await loadAllAgents({ agentsRoot })
      : null
    const skills = skillReg?.getAll() ?? []
    const agents = agentReg?.getAll() ?? []
    const agg = aggregateExpectedTokens(skills, agents)

    const totalItems = agg.skillCount + agg.agentCount
    const unknown = agg.unknownSkillCount + agg.unknownAgentCount
    if (totalItems === 0) {
      checks.push({
        name: 'expected_tokens coverage',
        status: 'pass',
        detail: 'no skills/agents loaded — nothing to check',
      })
      return
    }
    if (unknown === 0) {
      checks.push({
        name: 'expected_tokens coverage',
        status: 'pass',
        detail: `every skill + agent declares expected_tokens — ${formatExpectedTokensSummary(agg)}`,
      })
      return
    }
    const pct = Math.round((unknown / totalItems) * 100)
    checks.push({
      name: 'expected_tokens coverage',
      status: 'warn',
      detail: `${unknown}/${totalItems} skill(s)/agent(s) (~${pct}%) missing expected_tokens — field is optional but recommended for install-budget telemetry`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push({
      name: 'expected_tokens coverage',
      status: 'skip',
      detail: `unable to load skills/agents: ${msg}`,
    })
  }
}
