/**
 * ANV-0185 — Contributor-only doctor script.
 *
 * Runs the 26 Anvil-ceremony + Anvil-bundle-internal checks that have no
 * value to end-users who installed Anvil. These were previously mixed into
 * `anvil doctor` and caused noise for non-contributors.
 *
 * Output shape (mirrors `anvil doctor --json`):
 *   { ok, checks: [{ name, status, detail }], pass, fail, warn, skip }
 *
 * Args:
 *   --json     (default) emit JSON to stdout
 *   --strict   warn rows become fail rows (preserves --strict semantics)
 *   --debug    write stderr
 *
 * Exit 0: no failures.
 * Exit 2: one or more fail rows.
 *
 * Invoked via:
 *   bun run scripts/dev/dev-doctor.ts
 *   npm run dev:doctor
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..', '..')

const DEBUG = process.argv.includes('--debug')
const STRICT = process.argv.includes('--strict')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DevCheck {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
}

interface DevDoctorOutput {
  ok: boolean
  checks: Array<{ name: string; status: string; detail: string }>
  pass: number
  fail: number
  warn: number
  skip: number
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const cwd = ROOT // dev-doctor always operates on the Anvil source tree
const home = homedir()
const anvilHome = join(home, '.anvil')
const inProject = true // we are always in the Anvil source tree
const SKIP_DETAIL =
  'not in a project root (no package.json / .git / etc.) — run from a project directory for project checks'

// Minimal DoctorCheckContext for checks that accept it
const ctx = {
  cwd,
  home,
  anvilHome,
  inProject,
  skipDetail: SKIP_DETAIL,
  installScope: 'both' as const,
}

// ---------------------------------------------------------------------------
// Import check runners
// ---------------------------------------------------------------------------

// We import from src/ — scripts/dev/ is allowed to import from src/ (the
// architecture rule is src/ cannot import from scripts/dev/).

// Hooks (bundle-internal)
const {
  pushOcHookRegistryCoverageCheck,
  pushHookKindCoverageCheck,
  pushCCHookCoverageCheck,
  pushContextObservabilityHooksWiredCheck,
} = await import('../../src/commands/cli/doctor-checks/hooks.js')

// Envelope (bundle-internal)
const { pushEnvelopeDryRunCheck } = await import(
  '../../src/commands/cli/doctor-checks/envelope.js'
)

// Skill checks (bundle-internal + ceremony)
const {
  pushTierIntegrityCheck,
  pushSkillVersionRegressionCheck,
  pushSkillRegistryChecks,
} = await import('../../src/commands/cli/doctor-checks/skill-checks.js')

// Capability (bundle-internal)
const {
  pushSnapshotIntegrityCheck,
  pushSnapshotFreshnessCheck,
  pushSkillFixtureCoverageRow,
} = await import('../../src/commands/cli/doctor-checks/capability.js')

// ANV-0221: pushModelsChecks removed — model-id-allowlist invariant is fully
// covered by tests/unit/core/models/concrete-id-allowlist.test.ts:70.

// Context manifest (bundle-internal)
const { pushContextManifestArtifactsCheck } = await import(
  '../../src/commands/cli/doctor-checks/context-manifest.js'
)

// Commands (bundle-internal)
const { pushCommandSafetyCheck, pushRoutingRulesSyncCheck } = await import(
  '../../src/commands/cli/doctor-checks/commands.js'
)

// Plugin (bundle-internal)
const { pushCrossContaminationCheck } = await import(
  '../../src/commands/cli/doctor-checks/plugin.js'
)

// Capability (bundle-internal)
const { pushGeneratedFileGuardCheck } = await import(
  '../../src/commands/cli/doctor-checks/capability.js'
)

// Templates (bundle-internal)
const { pushDecisionTemplateSkillsCheck } = await import(
  '../../src/commands/cli/doctor-checks/templates.js'
)

// Surfaces audit (ceremony)
const { pushSurfacesAuditDriftCheck } = await import(
  '../../src/commands/cli/doctor-checks/surfaces-audit.js'
)

// Docs (ceremony)
const { pushDocTestStructuralCheck, pushDocDriftCheck } = await import(
  '../../src/commands/cli/doctor-checks/docs.js'
)

// Release (ceremony)
const {
  pushSddOldPathMigrationCheck,
  pushRebaseBaseFreshnessCheck,
  pushPrePushParityCheck,
  pushCountDriftChecks,
} = await import('../../src/commands/cli/doctor-checks/release.js')

// Version sync (ceremony — inline in doctor.ts; re-implemented here)
const { checkVersionSync } = await import(
  '../../src/core/release/version-sync.js'
)

// Pre-compact handler (bundle-internal — inline in doctor.ts)
const { buildPreCompactHandlerWiredRow } = await import(
  '../../src/commands/cli/doctor.js'
)

// HookKind enum
const { HookKind } = await import('../../src/core/types.js')

// ---------------------------------------------------------------------------
// Run checks
// ---------------------------------------------------------------------------

const checks: DevCheck[] = []

// ── Anvil-bundle-internal checks ────────────────────────────────────────────

// OC hook registry coverage
await pushOcHookRegistryCoverageCheck(checks)

// Every HookKind has a registered handler
await pushHookKindCoverageCheck(checks, HookKind.options as string[])

// CC hook event coverage matrix (30 events)
await pushCCHookCoverageCheck(checks)

// Context-observability hooks wired
await pushContextObservabilityHooksWiredCheck(checks)

// Pre-compact handler wired
try {
  const loadAll = await import('../../src/hooks/load-all.js')
  const records = loadAll.getHookSafetyRecords()
  const hasHandler = records.some((r) => r.name === 'pre-compact-sidecar')
  checks.push(
    buildPreCompactHandlerWiredRow({
      hasHandler,
      env: process.env,
      config: undefined,
    }),
  )
} catch (err) {
  checks.push({
    name: 'Pre-compact handler wired (ANV-0126)',
    status: 'warn',
    detail: `failed to inspect hook registry — ${(err as Error).message}`,
  })
}

// Envelope dry-run
await pushEnvelopeDryRunCheck(checks, cwd)

// Tier integrity
await pushTierIntegrityCheck(checks, cwd, anvilHome, inProject, SKIP_DETAIL)

// Phase-manifest token resolution
pushContextManifestArtifactsCheck(checks, cwd)

// ANV-0221: Model id allowlist row removed — invariant covered by
// tests/unit/core/models/concrete-id-allowlist.test.ts:70.

// Capability snapshot integrity
{
  const rows: Array<{
    name: string
    status: 'pass' | 'warn' | 'fail' | 'skip'
    detail: string
  }> = []
  pushSnapshotIntegrityCheck(ctx, rows)
  for (const row of rows) {
    checks.push({ name: row.name, status: row.status, detail: row.detail })
  }
}

// Capability snapshot freshness
{
  const rows: Array<{
    name: string
    status: 'pass' | 'warn' | 'fail' | 'skip'
    detail: string
  }> = []
  pushSnapshotFreshnessCheck(ctx, rows)
  for (const row of rows) {
    checks.push({ name: row.name, status: row.status, detail: row.detail })
  }
}

// Decision-template skills (info row)
pushDecisionTemplateSkillsCheck(checks, cwd)

// Adapter cross-contamination
pushCrossContaminationCheck(checks)

// Command safety annotations
await pushCommandSafetyCheck(checks)

// Generated-file guard coverage
await pushGeneratedFileGuardCheck(checks)

// Routing-rules sync
pushRoutingRulesSyncCheck(checks)

// ── Skill-triggering fixture coverage (ceremony) ─────────────────────────────

// Load skill registry to get userInvocableNames for fixture coverage check
{
  const fixtureChecks: DevCheck[] = []
  await pushSkillRegistryChecks(
    fixtureChecks,
    cwd,
    anvilHome,
    // no-op: skill name uniqueness / models.json refs stay in the dev run but
    // we only want the fixture-coverage row here. We push the no-op result.
    (innerChecks, innerCwd, userInvocableNames) => {
      pushSkillFixtureCoverageRow(innerChecks, innerCwd, userInvocableNames)
    },
  )
  // Only keep the fixture coverage row (discard skill name uniqueness + models.json refs
  // which are user-meaningful and will remain in `anvil doctor`)
  const fixtureCoverageRow = fixtureChecks.find(
    (c) => c.name === 'skill-triggering fixture coverage',
  )
  if (fixtureCoverageRow) {
    checks.push(fixtureCoverageRow)
  }
}

// ── Anvil-ceremony checks ───────────────────────────────────────────────────

// Surfaces-audit dimension drift
pushSurfacesAuditDriftCheck(checks, cwd)

// Skill version regression
await pushSkillVersionRegressionCheck(checks, cwd, inProject, SKIP_DETAIL)

// Doc tests structural
pushDocTestStructuralCheck(checks, cwd, inProject, SKIP_DETAIL)

// Doc drift
await pushDocDriftCheck(checks, cwd, inProject, SKIP_DETAIL)

// SDD old-path migration
pushSddOldPathMigrationCheck(checks, cwd)

// Version sync (package.json / marketplace.json / CHANGELOG)
{
  const hasAnvilFiles = (root: string): boolean =>
    existsSync(join(root, 'package.json')) &&
    existsSync(join(root, 'marketplace.json'))
  const syncRoot = hasAnvilFiles(cwd) ? cwd : null

  if (syncRoot === null) {
    checks.push({
      name: 'Version sync (package.json / marketplace.json / CHANGELOG)',
      status: 'skip',
      detail: 'not running from the Anvil source repo',
    })
  } else {
    try {
      const sync = checkVersionSync(syncRoot)
      checks.push({
        name: 'Version sync (package.json / marketplace.json / CHANGELOG)',
        status: sync.inSync ? 'pass' : 'fail',
        detail: sync.inSync
          ? `all at v${sync.packageVersion}`
          : sync.mismatches.join('; '),
      })
    } catch {
      checks.push({
        name: 'Version sync (package.json / marketplace.json / CHANGELOG)',
        status: 'warn',
        detail: 'could not read version files — run from the Anvil repo root',
      })
    }
  }
}

// Worktree base freshness
await pushRebaseBaseFreshnessCheck(checks, STRICT)

// Pre-push parity
pushPrePushParityCheck(checks, cwd)

// Count drift: README + self-audit staleness
// count drift needs userInvocableNames — derive from skill registry
{
  const tmpChecks: DevCheck[] = []
  const { userInvocableNames } = await pushSkillRegistryChecks(
    tmpChecks,
    cwd,
    anvilHome,
    (_c, _cwd, _names) => {}, // no-op fixture callback
  )
  pushCountDriftChecks(checks, cwd, userInvocableNames.length, STRICT)
}

// ---------------------------------------------------------------------------
// Apply --strict: promote warn → fail
// ---------------------------------------------------------------------------

if (STRICT) {
  for (const check of checks) {
    if (check.status === 'warn') {
      check.status = 'fail'
    }
  }
}

// ---------------------------------------------------------------------------
// Compute summary
// ---------------------------------------------------------------------------

const pass = checks.filter((c) => c.status === 'pass').length
const fail = checks.filter((c) => c.status === 'fail').length
const warn = checks.filter((c) => c.status === 'warn').length
const skip = checks.filter((c) => c.status === 'skip').length
const ok = fail === 0

const output: DevDoctorOutput = {
  ok,
  checks: checks.map((c) => ({
    name: c.name,
    status: c.status,
    detail: c.detail,
  })),
  pass,
  fail,
  warn,
  skip,
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

process.stdout.write(`${JSON.stringify(output)}\n`)

if (DEBUG) {
  process.stderr.write(
    `dev-doctor: ${checks.length} checks — ${pass} pass, ${fail} fail, ${warn} warn, ${skip} skip\n`,
  )
}

process.exit(ok ? 0 : 2)
