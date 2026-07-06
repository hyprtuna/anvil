/**
 * ANV-0103 — Bootstrap content version-skew check (DoctorCheck registry entry).
 *
 * Wraps the `pushBootstrapSkewCheck` logic from capability.ts into the
 * DoctorCheck interface so it can be registered in DOCTOR_REGISTRY and
 * dispatched by the standard runner.
 *
 * Check id: bootstrap/anvil-slug-references
 * Category: content
 *
 * Status semantics:
 *   pass  — all anvil:<slug> references in skills/using-anvil/SKILL.md resolve
 *            in the loaded skill/agent registry.
 *   warn  — one or more dangling references detected, OR bootstrap file not found
 *            (ANV-0001 will have already reported the missing file).
 *   skip  — no skills/ tree at cwd (not an Anvil project root) or bootstrap
 *            file absent (pass-with-skip so users without OC bootstrap aren't blocked).
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { lintBootstrapSkew } from '../../../core/bootstrap-skew/index.js'
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckRow,
} from '../doctor-registry.js'

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runBootstrapSlugReferences(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): Promise<void> {
  const rowName = 'Bootstrap slug references (version-skew)'

  // Candidate bootstrap paths in priority order (project-local first, global last).
  const projectSourceBootstrap = join(
    ctx.cwd,
    'skills',
    'using-anvil',
    'SKILL.md',
  )
  const projectPluginBootstrap = join(
    ctx.cwd,
    '.claude-plugin',
    'skills',
    'using-anvil',
    'SKILL.md',
  )
  const globalBootstrap = join(
    ctx.anvilHome,
    'skills',
    'using-anvil',
    'SKILL.md',
  )

  // Resolve the bootstrap path and matching registry root together.
  let bootstrapPath: string | undefined
  let skillsRoot: string | undefined
  let agentsRoot: string | undefined

  for (const candidate of [
    projectSourceBootstrap,
    projectPluginBootstrap,
    globalBootstrap,
  ]) {
    if (existsSync(candidate)) {
      bootstrapPath = candidate
      const isGlobal = candidate === globalBootstrap
      skillsRoot = isGlobal
        ? join(ctx.anvilHome, 'skills')
        : join(ctx.cwd, 'skills')
      agentsRoot = isGlobal
        ? join(ctx.anvilHome, 'agents')
        : join(ctx.cwd, 'agents')
      break
    }
  }

  // No skills/ tree at all → skip (not an Anvil project root).
  const localSkillsRoot = join(ctx.cwd, 'skills')
  const globalSkillsRoot = join(ctx.anvilHome, 'skills')
  if (!existsSync(localSkillsRoot) && !existsSync(globalSkillsRoot)) {
    rows.push({
      name: rowName,
      status: 'skip',
      detail: 'no skills/ tree found — not an Anvil project root',
    })
    return
  }

  // Bootstrap file absent → skip so OC-less users aren't blocked.
  // (ANV-0001 already surfaces the missing file as a separate row.)
  if (!bootstrapPath || !skillsRoot) {
    rows.push({
      name: rowName,
      status: 'skip',
      detail:
        'bootstrap skill (using-anvil/SKILL.md) not found — run `anvil init` to restage; skipping skew check',
    })
    return
  }

  // Read bootstrap text.
  let bootstrapText: string
  try {
    bootstrapText = await readFile(bootstrapPath, 'utf-8')
  } catch (err) {
    rows.push({
      name: rowName,
      status: 'warn',
      detail: `could not read bootstrap file at ${bootstrapPath}: ${(err as Error).message}`,
    })
    return
  }

  // Load skill registry.
  let skillNames: Set<string>
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const skillReg = await loadAllSkills({ skillsRoot })
    skillNames = new Set(skillReg.getAll().map((s) => s.frontmatter.name))
  } catch (err) {
    rows.push({
      name: rowName,
      status: 'warn',
      detail: `could not load skill registry: ${(err as Error).message}`,
    })
    return
  }

  // Load agent registry (non-fatal failure).
  let agentNames: Set<string>
  try {
    const { loadAllAgents } = await import('../../../agents/load-all.js')
    const agentReg = await loadAllAgents({
      agentsRoot: agentsRoot ?? join(ctx.cwd, 'agents'),
    })
    agentNames = new Set(agentReg.getAll().map((a) => a.frontmatter.name))
  } catch {
    // Non-fatal: agent registry failure means agent refs in bootstrap will be
    // flagged as dangling, but skill refs are still correctly linted.
    agentNames = new Set<string>()
  }

  // Run the lint.
  const result = lintBootstrapSkew(bootstrapText, skillNames, agentNames)

  if (result.violations.length === 0) {
    rows.push({
      name: rowName,
      status: 'pass',
      detail: `${result.refsFound} anvil: reference(s) checked — all resolve`,
    })
    return
  }

  // Dangling references → warn (advisory; auto-fix is out of scope per ANV-0103).
  const slugList = result.violations.map((v) => v.ref).join(', ')
  const firstHint = result.violations[0]?.hint ?? ''
  rows.push({
    name: rowName,
    status: 'warn',
    detail:
      `${result.violations.length} dangling reference(s): ${slugList}. ` +
      `${firstHint}`,
  })
}

// ---------------------------------------------------------------------------
// DoctorCheck entry
// ---------------------------------------------------------------------------

/**
 * ANV-0103 — Bootstrap slug references version-skew check.
 *
 * Extracts all `anvil:<slug>` mentions from skills/using-anvil/SKILL.md and
 * verifies each slug exists in the loaded skill / agent registry.
 * Emits `warn` for dangling references with a clear remediation hint.
 * Skips gracefully when no skills/ tree exists or bootstrap file is absent
 * (so users without OC bootstrap aren't blocked).
 */
export const bootstrapSlugReferencesCheck: DoctorCheck = {
  id: 'bootstrap/anvil-slug-references',
  label: 'Bootstrap slug references (version-skew)',
  category: 'content',
  fixHint:
    'Update skills/using-anvil/SKILL.md to fix dangling slugs, then run `anvil init`',
  runner: runBootstrapSlugReferences,
}

/**
 * All bootstrap checks in declaration order.
 * Import this array to register the category with the dispatcher.
 */
export const BOOTSTRAP_CHECKS: readonly DoctorCheck[] = [
  bootstrapSlugReferencesCheck,
]
