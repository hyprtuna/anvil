/**
 * ANV-0184 — Skill lint checks.
 *
 * Runs the 14 user-meaningful skill checks that were migrated from
 * `anvil doctor` to `anvil skill lint`. Each check accepts an explicit
 * `skillsRoot` path rather than hardcoding `join(cwd, 'skills')`.
 *
 * The 14 skill-targeted checks:
 *   1.  slug-namespace integrity
 *   2.  skill name uniqueness
 *   3.  sub_skills graph health
 *   4.  Skill providers
 *   5.  activation adoption
 *   6.  skill-shadow
 *   7.  CSO discipline
 *   8.  description budget
 *   9.  desc: CSO prefix        (description-shape)
 *   10. desc: no step list      (description-shape)
 *   11. desc: third-person voice (description-shape)
 *   12. desc: length sweet spot  (description-shape)
 *   13. desc: no body dupe      (description-shape)
 *   14. Skill catalog
 *   15. Skill content lint
 *   16. Skill provenance coverage
 *   17. Skill provenance object
 *   18. Skill provenance freshness
 *   19. Skill CC-native fields adoption
 *   20. expected_tokens coverage
 *   21. Skill version coverage
 */

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LintCheckResult } from './common/lint-check.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Minimal buffer type shared by all push* adapters
type CheckBuf = {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

function toResult(c: CheckBuf): LintCheckResult {
  return { name: c.name, status: c.status, detail: c.detail }
}

const SKIP = 'no skills directory found — skipped'

/**
 * Run all skill-targeted lint checks against a given skill root directory.
 *
 * @param root - Path to the skills directory to lint (e.g. ~/.anvil/skills)
 * @param cwd  - Project working directory (used by checks that resolve relative
 *               file paths, e.g. provenance freshness git-log and plan-ref checks)
 */
export async function runSkillLintChecks(
  root: string,
  cwd: string,
): Promise<LintCheckResult[]> {
  const results: LintCheckResult[] = []

  // Derive sibling agents root for cross-surface checks.
  // Convention: agents/ is a sibling of skills/ at the same parent level.
  const { join, dirname: dn } = await import('node:path')
  const parentDir = dn(root)
  const agentsRoot = join(parentDir, 'agents')

  // ── 1. Slug-namespace integrity ───────────────────────────────────────────
  // Requires both skills/ and agents/. Skip agents-side rule when agents/ absent.
  {
    const { pushSlugNamespaceCheck } = await import(
      './doctor-checks/architecture.js'
    )
    const buf: CheckBuf[] = []
    pushSlugNamespaceCheck(buf, cwd, true, SKIP, root, agentsRoot)
    results.push(...buf.map(toResult))
  }

  // ── 2. Skill name uniqueness ───────────────────────────────────────────────
  {
    const { existsSync } = await import('node:fs')
    if (existsSync(root)) {
      const { loadAllSkills } = await import('../../skills/load-all.js')
      try {
        const reg = await loadAllSkills({ skillsRoot: root })
        const allSkills = reg.getAll()
        const skillNames = allSkills.map((s) => s.frontmatter.name)
        const counts = new Map<string, number>()
        for (const n of skillNames) counts.set(n, (counts.get(n) ?? 0) + 1)
        const dupes = [...counts.entries()]
          .filter(([, c]) => c > 1)
          .map(([n]) => n)
        results.push({
          name: 'skill name uniqueness',
          status: dupes.length === 0 ? 'pass' : 'fail',
          detail:
            dupes.length === 0
              ? `${skillNames.length} unique names`
              : `duplicate(s): ${dupes.join(', ')}`,
        })
      } catch (err) {
        results.push({
          name: 'skill name uniqueness',
          status: 'fail',
          detail: `failed to load skills: ${(err as Error).message}`,
        })
      }
    } else {
      results.push({
        name: 'skill name uniqueness',
        status: 'skip',
        detail: `skills directory not found: ${root}`,
      })
    }
  }

  // ── 3. sub_skills graph health ────────────────────────────────────────────
  {
    const { pushSubSkillsGraphCheck } = await import(
      './doctor-checks/skill-checks.js'
    )
    const buf: CheckBuf[] = []
    await pushSubSkillsGraphCheck(buf, cwd, root)
    results.push(...buf.map(toResult))
  }

  // ── 4-6. Skill providers, activation adoption, skill-shadow ───────────────
  {
    const { pushSkillProvidersCheck } = await import(
      './doctor-checks/plugin.js'
    )
    const buf: CheckBuf[] = []
    await pushSkillProvidersCheck(buf, cwd, root)
    results.push(...buf.map(toResult))
  }

  // ── 7. CSO discipline ─────────────────────────────────────────────────────
  {
    const { pushCsoDisciplineCheck } = await import(
      './doctor-checks/skill-checks.js'
    )
    const buf: CheckBuf[] = []
    pushCsoDisciplineCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 8. Description budget ─────────────────────────────────────────────────
  {
    const { pushDescriptionBudgetCheck } = await import(
      './doctor-checks/skill-checks.js'
    )
    const buf: CheckBuf[] = []
    pushDescriptionBudgetCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 9-13. 5× description-shape rows ──────────────────────────────────────
  {
    const { runDescriptionShapeChecksForRoot } = await import(
      './doctor-checks/description-shape.js'
    )
    const descResults = runDescriptionShapeChecksForRoot(root)
    results.push(...descResults.map(toResult))
  }

  // ── 14. Skill catalog ─────────────────────────────────────────────────────
  {
    const { pushSkillBehaviorValidationChecks } = await import(
      './doctor-checks/capability.js'
    )
    const buf: CheckBuf[] = []
    await pushSkillBehaviorValidationChecks(
      buf,
      cwd,
      true,
      SKIP,
      __dirname,
      root,
    )
    results.push(...buf.map(toResult))
  }

  // ── 15. Skill content lint ────────────────────────────────────────────────
  {
    const { pushSkillContentLintCheck } = await import(
      './doctor-checks/content.js'
    )
    const buf: CheckBuf[] = []
    pushSkillContentLintCheck(buf, cwd, true, SKIP, root, agentsRoot)
    results.push(...buf.map(toResult))
  }

  // ── 16. Skill provenance coverage ─────────────────────────────────────────
  {
    const { pushSkillProvenanceCoverageCheck } = await import(
      './doctor-checks/content.js'
    )
    const buf: CheckBuf[] = []
    await pushSkillProvenanceCoverageCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 17. Skill provenance object ───────────────────────────────────────────
  {
    const { pushSkillProvenanceObjectCheck } = await import(
      './doctor-checks/content.js'
    )
    const buf: CheckBuf[] = []
    await pushSkillProvenanceObjectCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 18. Skill provenance freshness ────────────────────────────────────────
  {
    const { pushSkillProvenanceFreshnessCheck } = await import(
      './doctor-checks/skill-checks.js'
    )
    const buf: CheckBuf[] = []
    await pushSkillProvenanceFreshnessCheck(buf, cwd, true, SKIP, false, root)
    results.push(...buf.map(toResult))
  }

  // ── 19. Skill CC-native fields adoption ───────────────────────────────────
  {
    const { pushSkillCcFieldsCheck } = await import(
      './doctor-checks/content.js'
    )
    const buf: CheckBuf[] = []
    await pushSkillCcFieldsCheck(buf, cwd, true, SKIP, root)
    results.push(...buf.map(toResult))
  }

  // ── 20. expected_tokens coverage ─────────────────────────────────────────
  {
    const { pushExpectedTokensCoverageCheck } = await import(
      './doctor-checks/content.js'
    )
    const buf: CheckBuf[] = []
    await pushExpectedTokensCoverageCheck(
      buf,
      cwd,
      true,
      SKIP,
      root,
      agentsRoot,
    )
    results.push(...buf.map(toResult))
  }

  // ── 21. Skill version coverage ────────────────────────────────────────────
  {
    const { pushSkillVersionCoverageCheck } = await import(
      './doctor-checks/skill-checks.js'
    )
    const buf: CheckBuf[] = []
    await pushSkillVersionCoverageCheck(buf, cwd, true, SKIP, false, root)
    results.push(...buf.map(toResult))
  }

  return results
}
