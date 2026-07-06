/**
 * ANV-0003 — Agent permission taxonomy doctor row.
 *
 * For every agent in `agents/`, look up its permission class from the slug
 * suffix (`classifyAgentSuffix`) and compare its declared `tools:` (minus
 * `disallowedTools:`) against the class's `forbiddenTools` set in
 * `AGENT_PERMISSION_TAXONOMY`.
 *
 * Status semantics:
 *   pass — every classified agent's tools match its class scope.
 *   warn — one or more classified read-only agents carry write tools.
 *   skip — agents/ tree missing OR no classified agents found.
 *
 * The row never fails. Drift is a soft signal; per the ticket, fixing
 * each flagged agent is a follow-up. The doctor row only surfaces the drift.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  type AgentPermissionInput,
  computeAgentPermissionCoverage,
} from '../common/agent-permission-check.js'
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckRow,
} from '../doctor-registry.js'

const ROW_NAME = 'Agent permission taxonomy'

async function loadAgentInputs(
  agentsRoot: string,
): Promise<AgentPermissionInput[] | null> {
  try {
    const { loadAllAgents } = await import('../../../agents/load-all.js')
    const reg = await loadAllAgents({ agentsRoot })
    return reg.getAll().map((a) => ({
      name: a.frontmatter.name,
      tools: a.frontmatter.tools,
      disallowedTools: a.frontmatter.disallowedTools,
    }))
  } catch {
    return null
  }
}

async function runAgentPermissionCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
  agentsRootOverride?: string,
): Promise<void> {
  const agentsRoot = agentsRootOverride ?? join(ctx.cwd, 'agents')
  if (!existsSync(agentsRoot)) {
    rows.push({
      name: ROW_NAME,
      status: 'skip',
      detail: ctx.skipDetail,
    })
    return
  }

  const inputs = await loadAgentInputs(agentsRoot)
  if (inputs === null) {
    rows.push({
      name: ROW_NAME,
      status: 'skip',
      detail:
        'failed to load agents/ — slug-namespace check will flag root cause',
    })
    return
  }

  const result = computeAgentPermissionCoverage(inputs)

  if (result.status === 'skip') {
    rows.push({
      name: ROW_NAME,
      status: 'skip',
      detail: 'no classified agents (slug-namespace row will flag the cause)',
    })
    return
  }

  if (result.status === 'pass') {
    rows.push({
      name: ROW_NAME,
      status: 'pass',
      detail: `${result.clean}/${result.total} agents within their class scope`,
    })
    return
  }

  // warn: format a single-line summary plus up to 3 violation previews.
  const previews = result.violations
    .slice(0, 3)
    .map(
      (v) =>
        `${v.name} (${v.class}): has ${v.unexpectedTools.join(',')} — expected ${v.expectedTools.join('/')}`,
    )
    .join('; ')
  const more =
    result.violations.length > 3
      ? ` (+${result.violations.length - 3} more)`
      : ''

  rows.push({
    name: ROW_NAME,
    status: 'warn',
    detail: `${result.violations.length}/${result.total} agents drift from class scope — ${previews}${more}`,
  })
}

export const agentPermissionCheck: DoctorCheck = {
  id: 'agent-permission/class-scope',
  label: ROW_NAME,
  category: 'agent-permission',
  silentOnPass: true,
  runner: runAgentPermissionCheck,
}

/**
 * Bridge into the `Check[]`-style dispatcher used by `doctor.ts`. Mirrors the
 * pattern used by other extracted checks (e.g., `pushAgentSafetyAnnotationsCheck`).
 */
export async function pushAgentPermissionCheck(
  checks: {
    push(row: {
      name: string
      status: 'pass' | 'warn' | 'fail' | 'skip'
      detail: string
      expectedAbsence?: boolean
    }): void
  },
  cwd: string,
  skipDetail: string,
): Promise<void> {
  const rows: DoctorCheckRow[] = []
  await agentPermissionCheck.runner(
    {
      cwd,
      home: '',
      anvilHome: '',
      inProject: true,
      skipDetail,
      installScope: 'unknown',
    },
    rows,
  )
  for (const r of rows) {
    checks.push({
      name: r.name,
      status: r.status,
      detail: r.detail,
      // skip rows for absent agents/ — suppress in quiet mode.
      expectedAbsence: r.status === 'skip',
    })
  }
}

/**
 * ANV-0184 — Lint-command variant: runs the agent permission check against
 * an arbitrary agentsRoot directory instead of the doctor's cwd-relative path.
 */
export async function runAgentPermissionCheckForRoot(
  agentsRoot: string,
): Promise<
  Array<{
    name: string
    status: 'pass' | 'warn' | 'fail' | 'skip'
    detail: string
  }>
> {
  const rows: DoctorCheckRow[] = []
  await runAgentPermissionCheck(
    {
      cwd: '',
      home: '',
      anvilHome: '',
      inProject: true,
      skipDetail: 'no agents/ directory',
      installScope: 'unknown',
    },
    rows,
    agentsRoot,
  )
  return rows.map((r) => ({ name: r.name, status: r.status, detail: r.detail }))
}

export const AGENT_PERMISSION_CHECKS: readonly DoctorCheck[] = [
  agentPermissionCheck,
]
