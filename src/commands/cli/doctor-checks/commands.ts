/**
 * ANV-0141 — Commands category doctor checks.
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Keeps `function pushXyzCheck(checks: Check[])` signatures intact.
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../../core/io/project-scoped-paths.js'
import {
  ANVIL_ROUTING_RULES_CONTENT,
  ROUTING_INTENT_TABLE,
} from '../../../core/routing-rules-content.js'
import { INTENT_DEFINITIONS, INTENT_NAMES } from '../../../intent/intents.js'

// Local mirror of the Check interface from doctor.ts (same shape).
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * ROADMAP-doctor-bare — Surface CC `--bare` flag in anvil doctor.
 *
 * Status `pass` when `claude` is on PATH; `skip` otherwise.
 * Never `warn` or `fail` — purely informational (D-07).
 */
export function pushBareDiagnosticRow(checks: Check[]): void {
  const result = spawnSync('claude', ['--version'], {
    stdio: 'ignore',
    timeout: 2000,
  })
  const onPath = result.error === undefined && result.status !== null
  checks.push({
    name: 'Diagnostic: claude --bare available',
    status: onPath ? 'pass' : 'skip',
    detail: onPath
      ? 'run `claude --bare` to bypass all Anvil instrumentation when triaging issues'
      : 'claude not on PATH; install Claude Code to use --bare',
  })
}

/**
 * B6a: Check whether `.claude/rules/anvil-routing.md` exists and is canonical.
 */
export async function pushRoutingRulesCheck(
  checks: Check[],
  cwd: string,
): Promise<void> {
  const rulesPath = join(cwd, '.claude', 'rules', 'anvil-routing.md')
  if (!existsSync(rulesPath)) {
    checks.push({
      name: '.claude/rules/anvil-routing.md (standing instructions)',
      status: 'warn',
      detail:
        'missing — run `anvil init` to write standing routing instructions',
    })
    return
  }
  let content: string
  try {
    content = readFileSync(rulesPath, 'utf-8')
  } catch {
    checks.push({
      name: '.claude/rules/anvil-routing.md (standing instructions)',
      status: 'fail',
      detail: 'present but unreadable',
    })
    return
  }
  if (content === ANVIL_ROUTING_RULES_CONTENT) {
    checks.push({
      name: '.claude/rules/anvil-routing.md (standing instructions)',
      status: 'pass',
      detail: 'present and canonical',
    })
  } else {
    checks.push({
      name: '.claude/rules/anvil-routing.md (standing instructions)',
      status: 'warn',
      detail: 'present but divergent — re-run `anvil init --force` to sync',
    })
  }
}

/**
 * B6b: Check whether the per-project active-routing.json exists and echo its
 * last-write timestamp when present.
 */
export async function pushActiveRoutingCheck(
  checks: Check[],
  cwd: string,
): Promise<void> {
  await ensureProjectDir(cwd)
  const routingPath = await getProjectScopedPath(cwd, 'active-routing')
  if (!existsSync(routingPath)) {
    checks.push({
      name: 'active-routing.json (last routing decision)',
      status: 'warn',
      detail:
        'not yet written — routing injection activates on first directive prompt',
    })
    return
  }
  try {
    const raw = readFileSync(routingPath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const ts =
      typeof parsed.timestamp === 'string' ? parsed.timestamp : 'unknown'
    checks.push({
      name: 'active-routing.json (last routing decision)',
      status: 'pass',
      detail: `last written: ${ts}`,
    })
  } catch {
    checks.push({
      name: 'active-routing.json (last routing decision)',
      status: 'fail',
      detail: 'present but unreadable/malformed',
    })
  }
}

/**
 * ANV-0067 — routing-rules sync row.
 *
 * Verifies that `ROUTING_INTENT_TABLE` in `src/core/routing-rules-content.ts`
 * agrees with `INTENT_DEFINITIONS` in `src/intent/intents.ts`. A divergence
 * means the generated file was hand-edited after the last regeneration.
 *
 * Checks:
 *   - Every intent in INTENT_DEFINITIONS has a corresponding table entry.
 *   - Every table entry's agent, phrase, and skills match INTENT_DEFINITIONS.
 *   - No orphan entries (table entries with no matching INTENT_DEFINITIONS key).
 *
 * To fix: run `bun run generate:routing-rules`.
 *
 * Exported for unit tests.
 */
export function pushRoutingRulesSyncCheck(checks: Check[]): void {
  const drifts: string[] = []

  // Check every entry in the table matches INTENT_DEFINITIONS
  for (const entry of ROUTING_INTENT_TABLE) {
    const def =
      INTENT_DEFINITIONS[entry.intent as keyof typeof INTENT_DEFINITIONS]
    if (!def) {
      drifts.push(
        `orphan entry: intent "${entry.intent}" not in INTENT_DEFINITIONS`,
      )
      continue
    }
    if (entry.agent !== def.defaultAgent) {
      drifts.push(
        `intent "${entry.intent}": agent "${entry.agent}" ≠ INTENT_DEFINITIONS "${def.defaultAgent}"`,
      )
    }
    if (entry.phrase !== def.phrase) {
      drifts.push(
        `intent "${entry.intent}": phrase diverged from INTENT_DEFINITIONS`,
      )
    }
    // Skills must match exactly — same order, no extras, no missing
    const tableSkills = [...entry.skills]
    const defSkills = [...def.defaultSkills]
    if (
      tableSkills.length !== defSkills.length ||
      tableSkills.some((s, i) => s !== defSkills[i])
    ) {
      drifts.push(
        `intent "${entry.intent}": skills [${tableSkills.join(', ')}] ≠ INTENT_DEFINITIONS [${defSkills.join(', ')}]`,
      )
    }
  }

  // Check every intent in INTENT_DEFINITIONS has a table entry
  const tableIntents = new Set(ROUTING_INTENT_TABLE.map((e) => e.intent))
  for (const name of INTENT_NAMES) {
    if (!tableIntents.has(name)) {
      drifts.push(
        `missing entry: intent "${name}" absent from ROUTING_INTENT_TABLE`,
      )
    }
  }

  if (drifts.length === 0) {
    checks.push({
      name: 'routing-rules sync',
      status: 'pass',
      detail: 'ROUTING_INTENT_TABLE agrees with INTENT_DEFINITIONS',
    })
  } else {
    checks.push({
      name: 'routing-rules sync',
      status: 'fail',
      detail: `${drifts.length} drift(s) detected — run \`bun run generate:routing-rules\`: ${drifts[0]}`,
    })
  }
}

/**
 * ANV-0022 — Command safety metadata doctor row.
 *
 * Verifies that every registered Anvil CLI command declares the full
 * MCP-canonical 4-tuple: readOnlyHint, destructiveHint, idempotentHint,
 * openWorldHint. Also surfaces contradictory annotations (readOnly +
 * destructive both true) as a fail.
 */
export async function pushCommandSafetyCheck(checks: Check[]): Promise<void> {
  const { COMMAND_REGISTRY, computeCommandSafetyCoverage } = await import(
    '../common/command-registry.js'
  )

  const result = computeCommandSafetyCoverage(COMMAND_REGISTRY)

  if (result.status === 'skip') {
    checks.push({
      name: 'Command safety annotations',
      status: 'skip',
      detail: 'no commands registered',
    })
    return
  }

  if (result.contradictory.length > 0) {
    checks.push({
      name: 'Command safety annotations',
      status: 'fail',
      detail: `contradictory annotations (readOnly + destructive both true) on: ${result.contradictory.join(', ')} — a command cannot be both read-only and destructive`,
    })
    return
  }

  if (result.status === 'warn') {
    const missing = result.total - result.covered
    checks.push({
      name: 'Command safety annotations',
      status: 'warn',
      detail: `${missing} of ${result.total} commands missing MCP 4-tuple safety annotations — add readOnlyHint/destructiveHint/idempotentHint/openWorldHint to command-registry.ts`,
    })
    return
  }

  checks.push({
    name: 'Command safety annotations',
    status: 'pass',
    detail: `all ${result.total} commands annotated with MCP 4-tuple safety hints`,
  })
}
