import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { getUserHome } from '../../core/io/home.js'
import { DEFAULT_PIN_CAP, loadPins } from '../../core/pins/store.js'
import { isProjectRoot } from '../../core/project/is-root.js'
import { auditCliSlashParity } from './common/cli-parity.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { CliOptions } from './common/json-mode.js'
import {
  type CheckRow,
  type CheckStatus,
  printCheckList,
} from './common/report.js'
// ANV-0184: pushDescriptionShapeChecks migrated to `anvil skill lint`
// ANV-0185: pushCCHookCoverageCheck, pushContextObservabilityHooksWiredCheck,
//           pushHookKindCoverageCheck, pushOcHookRegistryCoverageCheck migrated
//           to `npm run dev:doctor`
import {
  pushHookLatencyBudgetCheck as _pushHookLatencyBudgetCheck,
  pushHookOutputValidationCheck as _pushHookOutputValidationCheck,
  pushHookProfilesCheck as _pushHookProfilesCheck,
  pushSessionStartBudgetCheck as _pushSessionStartBudgetCheck,
} from './doctor-checks/hooks.js'
export {
  buildCCHookCoverageRow,
  buildHookProfilesRow,
  countHandlerLoc,
  pushCCHookCoverageCheck,
  pushContextObservabilityHooksWiredCheck,
  pushHookHandlerSizeCheck,
  pushHookKindCoverageCheck,
  pushHookProfilesCheck,
  pushSessionStartBudgetCheck,
} from './doctor-checks/hooks.js'
// ANV-0185: pushDocDriftCheck, pushDocTestStructuralCheck migrated to `npm run dev:doctor`
// ANV-0279: pushProseAiTellCheck runs in anvil doctor at standard+ tier.
import { pushProseAiTellCheck as _pushProseAiTellCheck } from './doctor-checks/docs.js'
export {
  pushDocDriftCheck,
  pushDocTestStructuralCheck,
  pushProseAiTellCheck,
  scanDocTestsForValuePinning,
} from './doctor-checks/docs.js'
// ANV-0185: pushContextManifestArtifactsCheck migrated to `npm run dev:doctor`
export { pushContextManifestArtifactsCheck } from './doctor-checks/context-manifest.js'
// ANV-0221: pushModelIdAllowlistCheck removed — src/+presets covered by
//           concrete-id-allowlist.test.ts:70. The user-config advisory was lost
//           and is restored as pushUserModelAliasAdvisoryCheck (user-config path).
import { pushUserModelAliasAdvisoryCheck as _pushUserModelAliasAdvisoryCheck } from './doctor-checks/architecture.js'
export {
  collectUserConfigConcreteModelIds,
  pushSlugNamespaceCheck,
  pushUserModelAliasAdvisoryCheck,
  slugFromMdPath,
  walkSlugFiles,
} from './doctor-checks/architecture.js'
// ANV-0185: pushSurfacesAuditDriftCheck migrated to `npm run dev:doctor`
// ANV-0137 — templates doctor checks (user-override visibility + embedded lint).
// ANV-0136 — ANV-0185: pushDecisionTemplateSkillsCheck migrated to `npm run dev:doctor`
import { pushTemplateUserOverridesCheck as _pushTemplateUserOverridesCheck } from './doctor-checks/templates.js'
export {
  computeProvenanceCoverage,
  computeSkillCcFieldsAdoption,
  computeSkillProvenanceObjectLint,
  findBrokenPlanRefs,
  findStencilLeakage,
  findUnversionedTodos,
  pushExpectedTokensCoverageCheck,
  pushSkillCcFieldsCheck,
  pushSkillContentLintCheck,
  pushSkillProvenanceCoverageCheck,
  pushSkillProvenanceObjectCheck,
} from './doctor-checks/content.js'
// ANV-0141: commands category
// ANV-0185: pushCommandSafetyCheck, pushRoutingRulesSyncCheck migrated to `npm run dev:doctor`
import {
  pushActiveRoutingCheck as _pushActiveRoutingCheck,
  pushBareDiagnosticRow as _pushBareDiagnosticRow,
  pushRoutingRulesCheck as _pushRoutingRulesCheck,
} from './doctor-checks/commands.js'
import { pushInstallerChecks } from './doctor-checks/installer.js'
import { pushSkillMcpProvidersCheck as _pushSkillMcpProvidersCheck } from './doctor-checks/skill-mcp-providers.js'
export {
  pushBareDiagnosticRow,
  pushRoutingRulesCheck,
  pushActiveRoutingCheck,
  pushRoutingRulesSyncCheck,
  pushCommandSafetyCheck,
} from './doctor-checks/commands.js'
// ANV-0033: capability snapshot checks
// ANV-0185: pushSnapshotIntegrityCheck, pushSnapshotFreshnessCheck migrated to `npm run dev:doctor`
import {
  pushFallbackChainCoverageCheck as _pushFallbackChainCoverageCheck,
  pushModelProvenanceCheck as _pushModelProvenanceCheck,
} from './doctor-checks/capability.js'
// ANV-0141: capability category
// ANV-0185: pushGeneratedFileGuardCheck, pushSkillFixtureCoverageRow migrated to `npm run dev:doctor`
import {
  pushAdapterBootstrapCheck as _pushAdapterBootstrapCheck,
  pushBootstrapSkewCheck as _pushBootstrapSkewCheck,
} from './doctor-checks/capability.js'
export {
  pushAdapterBootstrapCheck,
  pushBootstrapSkewCheck,
  pushGeneratedFileGuardCheck,
  pushAgentSafetyAnnotationsCheck,
  pushSkillFixtureCoverageRow,
} from './doctor-checks/capability.js'
export { pushAgentPermissionCheck } from './doctor-checks/agent-permission.js'
// ANV-0203 (P6) — Extensions doctor row.
import { pushExtensionsCheck as _pushExtensionsCheck } from './doctor-checks/extensions.js'
export {
  buildExtensionsDoctorRow,
  pushExtensionsCheck,
} from './doctor-checks/extensions.js'
// ANV-0246 — Catalog doctor rows moved to experimental build.
// Dynamic import used so the default build never pulls in src/experimental/*.
// If the experimental build is absent the catalog checks are silently skipped.
// ANV-0245 — Experimental features doctor rows.
import { pushExperimentalChecks as _pushExperimentalChecks } from './doctor-checks/experimental.js'
export {
  buildExperimentalDoctorRows,
  pushExperimentalChecks,
} from './doctor-checks/experimental.js'
// ANV-0141: plugin category
// ANV-0185: pushCrossContaminationCheck migrated to `npm run dev:doctor`
import {
  pushExternalPluginConflictCheck as _pushExternalPluginConflictCheck,
  pushOcDisableFlagsCheck as _pushOcDisableFlagsCheck,
  pushOcPluginAgentsCheck as _pushOcPluginAgentsCheck,
  pushOcStandingInstructionsCheck as _pushOcStandingInstructionsCheck,
  pushOpenCodeConfigKnownKeysCheck as _pushOpenCodeConfigKnownKeysCheck,
  pushOpenCodePluginReachableRow as _pushOpenCodePluginReachableRow,
  pushRecommendedIntegrationsCheck as _pushRecommendedIntegrationsCheck,
} from './doctor-checks/plugin.js'
export {
  pushExternalPluginConflictCheck,
  pushRecommendedIntegrationsCheck,
  pushCrossContaminationCheck,
  pushOcPluginAgentsCheck,
  pushOcDisableFlagsCheck,
  pushOpenCodeConfigKnownKeysCheck,
  pushOpenCodePluginReachableRow,
  pushOcStandingInstructionsCheck,
} from './doctor-checks/plugin.js'
// ANV-0141: release category
// ANV-0185: pushCountDriftChecks, pushPrePushParityCheck, pushRebaseBaseFreshnessCheck,
//           pushSddOldPathMigrationCheck migrated to `npm run dev:doctor`
export {
  CANONICAL_PRE_PUSH,
  COUNT_DRIFT_ROW_PREFIX,
  checkClaudeMdUserInvocableCap,
  checkPrePushParity,
  checkReadmeCountDrift,
  checkSelfAuditStaleness,
  pushCountDriftChecks,
  pushPrePushParityCheck,
  pushRebaseBaseFreshnessCheck,
  pushSddOldPathMigrationCheck,
} from './doctor-checks/release.js'
// ANV-0141: skill-checks category
// ANV-0185: pushSkillVersionRegressionCheck, pushTierIntegrityCheck migrated to `npm run dev:doctor`
import {
  pushAgentRuntimeChecks as _pushAgentRuntimeChecks,
  pushCompositionOverlaysCheck as _pushCompositionOverlaysCheck,
  pushCompressionHookCheck as _pushCompressionHookCheck,
  pushOutputSchemaCoverageCheck as _pushOutputSchemaCoverageCheck,
  pushSkillLoadingModeCheck as _pushSkillLoadingModeCheck,
  pushSkillRegistryChecks as _pushSkillRegistryChecks,
  pushSkillVersionChecks as _pushSkillVersionChecks,
} from './doctor-checks/skill-checks.js'
export {
  validateModelsJsonReferences,
  computeSkillVersionCoverage,
  computeSkillVersionRegressions,
  computeSkillProvenanceFreshness,
  isInsideGitRepo,
  readModelsJson,
  getMigrationWindowThreshold,
  MIGRATION_WINDOW_THRESHOLD,
  pushRequiredReadingBudgetCheck,
  pushRequiredReadingPathsResolveCheck,
} from './doctor-checks/skill-checks.js'
// ANV-0209 — Frontmatter portability row (standard+ tier).
import { pushFrontmatterPortabilityCheck as _pushFrontmatterPortabilityCheck } from './doctor-checks/frontmatter-portability.js'
export {
  buildFrontmatterPortabilityRow,
  pushFrontmatterPortabilityCheck,
} from './doctor-checks/frontmatter-portability.js'
import {
  classifyStatuslineCommand,
  inspectGlobalStatuslineWiring,
  inspectStatuslineWiring,
  inspectSubagentStatuslineWiring,
} from './doctor-checks/statusline.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
  InstallScope,
} from './doctor-registry.js'
import { resolveTemplate } from './statusline-template.js'
import { resolveTier } from './statusline-tier.js'
export { runLiveSkillEval } from './doctor-checks/live-eval.js'
import { runLiveSkillEval } from './doctor-checks/live-eval.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  /**
   * ANV-0140 — structured predicate-driven filter flag.
   * When true, the renderer suppresses this row in quiet mode if status is
   * 'pass' or 'skip'. Equivalent to DoctorCheck.expectedWhen returning true
   * for inline checks that haven't been migrated to the registry yet.
   * Used for expected-absence skips (e.g. "no skills/ tree in cwd") where
   * the check is meaningless outside a project root or Anvil source tree.
   */
  expectedAbsence?: boolean
  /**
   * ANV-0146 — Always show this row in quiet mode, even if status is 'pass'.
   * Used for informational summary rows (e.g. "Install scope") that users
   * benefit from seeing without needing --verbose.
   */
  alwaysVisible?: boolean
}

interface DoctorOptions extends CliOptions {
  fix?: boolean
  dryRun?: boolean
  /** ANV-0045 — run live skill-triggering eval (requires ANVIL_LIVE_EVAL=1) */
  live?: boolean
  /** ANV-0087 — fail on count-drift (README counts, user-invocable cap, stale self-audit) */
  strict?: boolean
  /** ANV-0140 — show all rows (pass + expected skips); default is quiet mode */
  verbose?: boolean
  /**
   * ANV-0146 — override auto-detected install scope.
   * 'auto' (default) uses detectInstallScope(); 'global'|'project'|'both' forces it.
   */
  scope?: string
  /** ANV-0149 — disable migration-window suppression; always show warn rows */
  showMigration?: boolean
  /**
   * ANV-0091 — restrict output to catalog rows only (catalog-quarantine-state +
   * catalog-cache-health). All other rows are skipped. Exit code reflects only
   * catalog row severities.
   */
  catalog?: boolean
  /**
   * ANV-0217 — run level: quick | standard (default) | deep | diagnostic-dump.
   * Controls which checks are dispatched and the SLA budget applied.
   */
  tier?: string
  /**
   * ANV-0217 — alias for --tier quick: run only pure in-memory checks (<2s budget).
   */
  smoke?: boolean
}

/**
 * Plan 42 D-03 — table of doctor warns that `--fix` knows how to repair.
 *
 * Keys are exact row names (must match the strings used in `pushXxx`
 * helpers throughout this file). Values are the remediation command
 * `--fix` runs (or prints, with `--dry-run`).
 *
 * `--fix` NEVER auto-repairs a `fail` row — operator investigates the
 * root cause. Unknown warn rows are left to the user (the row's detail
 * message contains the hint).
 */
export const FIXABLE_WARNS: Readonly<Record<string, string>> = Object.freeze({
  'CC project wiring (.claude/settings.json)': 'anvil init --scope project',
  'CC statusline wiring (.claude/settings.json → statusLine)':
    'anvil statusline install --scope project',
  'CC settings template (.claude/settings.json)': 'anvil init --scope project',
  'OC project wiring (.opencode/opencode.json)':
    'anvil init --target opencode --scope project',
  '.claude/rules/anvil-routing.md (standing instructions)':
    'anvil init --scope project',
})

interface DoctorFixPlanItem {
  rowName: string
  command: string
}

/**
 * Plan 42 D-03 — pure planner for `--fix`. Inspects checks; returns the
 * remediation plan (one entry per fixable warn row). Deduplicates by
 * command so the same `anvil init` doesn't run twice when two warns
 * resolve to it.
 */
export function planDoctorFixes(
  checks: ReadonlyArray<{
    name: string
    status: 'pass' | 'warn' | 'fail' | 'skip'
  }>,
): DoctorFixPlanItem[] {
  const seen = new Set<string>()
  const out: DoctorFixPlanItem[] = []
  for (const check of checks) {
    if (check.status !== 'warn') continue
    const command = FIXABLE_WARNS[check.name]
    if (!command) continue
    if (seen.has(command)) continue
    seen.add(command)
    out.push({ rowName: check.name, command })
  }
  return out
}

/**
 * `--fix` creates `~/.anvil/` if missing. It does NOT fabricate plugin
 * manifests — those must come from `anvil init`.
 */
export function repairMissingDirs(_cwd: string): string[] {
  const repairs: string[] = []
  const anvilHome = join(getUserHome(), '.anvil')
  if (!existsSync(anvilHome)) {
    mkdirSync(anvilHome, { recursive: true })
    repairs.push(`created ${anvilHome}`)
  }
  return repairs
}

/**
 * ANV-0146 / ANV-0157 — Detect install scope from filesystem evidence.
 *
 * Rules (in priority order):
 *   - project: .claude/settings.json OR .opencode/opencode.json exists in CWD
 *   - global:  any of the three signals below are true AND no project files
 *   - both:    project files AND global evidence present
 *   - unknown: none of the above
 *
 * Global-evidence signals (ANV-0157 — priority order):
 *   1. ~/.anvil/installed_plugins.json exists, OR
 *   2. ~/.anvil/version exists, OR
 *   3. ~/.anvil/ directory exists AND at least one of models.json, skills/,
 *      agents/, plugins/ is present inside it.
 *
 * Exported for unit tests.
 */
export function detectInstallScope(cwd: string, home: string): InstallScope {
  const hasProjectCc = existsSync(join(cwd, '.claude', 'settings.json'))
  const hasProjectOc = existsSync(join(cwd, '.opencode', 'opencode.json'))
  const hasProjectFiles = hasProjectCc || hasProjectOc

  const anvilDir = join(home, '.anvil')
  const hasGlobalEvidence = _hasAnvilGlobalEvidence(anvilDir)

  if (hasProjectFiles && hasGlobalEvidence) return 'both'
  if (hasProjectFiles) return 'project'
  if (hasGlobalEvidence) return 'global'
  return 'unknown'
}

/**
 * Returns true when the ~/.anvil directory contains recognisable global-install
 * evidence (ANV-0157 three-signal predicate). Extracted for testability.
 *
 * Exported for unit tests.
 */
export function _hasAnvilGlobalEvidence(anvilDir: string): boolean {
  // Signal 1: installed_plugins.json (original ANV-0146 check)
  if (existsSync(join(anvilDir, 'installed_plugins.json'))) return true
  // Signal 2: version file (dev-clone / npm-link installs write this)
  if (existsSync(join(anvilDir, 'version'))) return true
  // Signal 3: directory exists AND has at least one known sub-entry
  if (!existsSync(anvilDir)) return false
  const KNOWN_ENTRIES = new Set(['models.json', 'skills', 'agents', 'plugins'])
  try {
    const entries = readdirSync(anvilDir)
    return entries.some((e) => KNOWN_ENTRIES.has(e))
  } catch {
    return false
  }
}

async function tryReadJson(filePath: string): Promise<unknown | null> {
  if (!existsSync(filePath)) return null
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Returns true when the CC installed_plugins.json v2 schema contains an
 * `anvil@anvil` entry with `scope === "user"`.
 *
 * The v2 schema looks like:
 *   { "version": 2, "plugins": { "anvil@anvil": [{ "scope": "user", ... }] } }
 *
 * A `scope: "project"` entry is considered project wiring, not user wiring,
 * so this function returns false for project-only entries.
 *
 * Exported for unit testing.
 */
export function isCcUserWired(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj))
    return false
  const record = obj as Record<string, unknown>
  const plugins = record.plugins
  if (plugins === null || typeof plugins !== 'object' || Array.isArray(plugins))
    return false
  const entry = (plugins as Record<string, unknown>)['anvil@anvil']
  if (!Array.isArray(entry)) return false
  return entry.some(
    (e): boolean =>
      typeof e === 'object' &&
      e !== null &&
      (e as Record<string, unknown>).scope === 'user',
  )
}

/**
 * Plan 28 G4. Inspect `.claude/settings.json` for the Anvil-emitted
 * template and report:
 *   - pass: file present + parses + has a `permissions` block
 *     (statusLine is reported separately by `inspectStatuslineWiring`)
 *   - warn: file missing OR no permissions block (run `anvil init`)
 *   - fail: file present but malformed JSON (bubbles up as
 *     `projectSettings === null` from the upstream parser)
 */
export function inspectSettingsTemplate(projectSettings: unknown): {
  status: 'pass' | 'warn' | 'fail'
  detail: string
} {
  if (projectSettings === null) {
    // tryReadJson returns null both for "not present" and "malformed".
    // Without the upstream signal we can't distinguish; warn and tell
    // the user how to fix.
    return {
      status: 'warn',
      detail: 'missing or unparseable — run `anvil init`',
    }
  }
  if (typeof projectSettings !== 'object' || Array.isArray(projectSettings)) {
    return {
      status: 'fail',
      detail: '.claude/settings.json is not a JSON object',
    }
  }
  const obj = projectSettings as Record<string, unknown>
  const perms = obj.permissions
  if (perms === undefined || perms === null) {
    return {
      status: 'warn',
      detail: 'no `permissions` block — run `anvil init`',
    }
  }
  if (typeof perms !== 'object' || Array.isArray(perms)) {
    return { status: 'fail', detail: '`permissions` is not an object' }
  }
  const mode = (perms as Record<string, unknown>).defaultMode
  const modeLabel = typeof mode === 'string' ? mode : '<unset>'
  return {
    status: 'pass',
    detail: `permissions present (defaultMode=${modeLabel})`,
  }
}

/**
 * ANV-0090 — Pure helper used by the doctor pin-count row. Returns the
 * row payload (name/status/detail) for the given home directory.
 *
 * Exported for unit tests since `getUserHome()` is cached on first call and
 * cannot be overridden via `process.env.HOME` once Node has booted —
 * tests pass a tmpdir to the helper directly instead of monkey-patching
 * the global home.
 */
export async function buildPinnedSkillsRow(home: string): Promise<{
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}> {
  const name = 'Pinned skills (~/.anvil/pins.json)'
  try {
    const pins = await loadPins({ home })
    const over = pins.length > DEFAULT_PIN_CAP
    return {
      name,
      status: over ? 'warn' : 'pass',
      detail: over
        ? `${pins.length}/${DEFAULT_PIN_CAP} pinned — cap exceeded; unpin with \`anvil skill unpin <slug>\``
        : `${pins.length}/${DEFAULT_PIN_CAP} pinned`,
    }
  } catch (err) {
    return {
      name,
      status: 'warn',
      detail: `failed to parse pins.json — ${(err as Error).message}`,
    }
  }
}

/**
 * ANV-0126 — Doctor row reporting whether the pre-compact runtime sidecar
 * handler is wired and disabled state. Pure helper exported for unit tests.
 *
 * @param opts.loadHooks  Lazy hook-registry loader (injected so tests don't
 *                        need to spin the whole hook registry).
 * @param opts.env        Environment map (test-friendly).
 * @param opts.config     The resolved ModelsConfig (carries pre_compact.*).
 */
export function buildPreCompactHandlerWiredRow(opts: {
  hasHandler: boolean
  env: Record<string, string | undefined>
  config: { pre_compact?: { disable?: boolean } } | undefined
}): { name: string; status: 'pass' | 'warn' | 'fail'; detail: string } {
  const name = 'Pre-compact handler wired (ANV-0126)'
  if (!opts.hasHandler) {
    return {
      name,
      status: 'fail',
      detail:
        'pre-compact-sidecar handler not registered — sessionStart will never receive a restore digest',
    }
  }
  if (opts.env.ANVIL_DISABLE_PRE_COMPACT === '1') {
    return {
      name,
      status: 'warn',
      detail: 'wired but disabled by env (ANVIL_DISABLE_PRE_COMPACT=1)',
    }
  }
  if (opts.config?.pre_compact?.disable === true) {
    return {
      name,
      status: 'warn',
      detail: 'wired but disabled by config (pre_compact.disable=true)',
    }
  }
  return {
    name,
    status: 'pass',
    detail: 'wired; sidecar writes to .anvil/runtime/ on pre-compact',
  }
}

// Statusline check functions extracted to doctor-checks/statusline.ts (ANV-0141).

/**
 * ANV-0217 follow-up — decide whether the live skill-triggering eval should
 * run, and detect the degraded `--live` at quick-tier case.
 *
 * The eval needs the skill registry, which is only loaded at standard+ tiers.
 * At the quick tier `userInvocableNames` is empty, so running the eval is a
 * silent no-op against zero skills. This helper centralises the decision so it
 * is unit-testable without invoking the whole `doctorCommand` (which calls
 * `process.exit`).
 *
 * Returns:
 *   - `{ run: false, degradedLive: true }` — `--live` requested at quick tier;
 *     caller should warn and skip (NOT run against an empty list).
 *   - `{ run: true,  degradedLive: false }` — eval should run.
 *   - `{ run: false, degradedLive: false }` — eval not requested.
 */
export function decideLiveEval(opts: {
  live: boolean
  runLevel: 'quick' | 'standard' | 'deep' | 'diagnostic-dump'
}): { run: boolean; degradedLive: boolean } {
  if (opts.live && opts.runLevel === 'quick') {
    return { run: false, degradedLive: true }
  }
  const requested =
    opts.live || opts.runLevel === 'deep' || opts.runLevel === 'diagnostic-dump'
  return { run: requested, degradedLive: false }
}

export async function doctorCommand(opts: DoctorOptions): Promise<void> {
  // ANV-0091 — catalog-only fast-path: collect only catalog rows and exit.
  // All other checks are skipped; exit code reflects only catalog row severities.
  // ANV-0246 — catalog checks moved to experimental; dynamic import with fallback.
  if (opts.catalog) {
    const catalogChecks: Check[] = []
    const home = getUserHome()
    const anvilHome = join(home, '.anvil')
    try {
      const expCatalogPath = '../../experimental/' + 'catalog/doctor-checks.js'
      const { pushCatalogChecks } = (await import(
        /* @vite-ignore */
        expCatalogPath
      )) as {
        pushCatalogChecks: (checks: Check[], anvilHome: string) => Promise<void>
      }
      await pushCatalogChecks(catalogChecks, anvilHome)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
        process.stderr.write(
          `[anvil:doctor] warn: experimental load failed: ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
      // Experimental build not available — catalog checks unavailable.
      process.stderr.write(
        'Catalog is experimental — run `npm i -g anvil@experimental` or `anvil --experimental catalog …`\n',
      )
      return
    }

    if (maybeEmitJson(catalogChecks, opts)) return

    const allRows: CheckRow[] = catalogChecks.map((c) => ({
      status: c.status,
      label: c.name,
      detail: c.detail,
    }))
    printCheckList(allRows, allRows)

    if (catalogChecks.some((c) => c.status === 'fail')) process.exit(1)
    return
  }

  // ANV-0217 — Doctor run level (tier dispatch).
  const DOCTOR_TIERS = ['quick', 'standard', 'deep', 'diagnostic-dump'] as const
  type DoctorRunLevel = (typeof DOCTOR_TIERS)[number]

  const doctorRunLevel: DoctorRunLevel = (() => {
    if (opts.smoke) return 'quick'
    const t = opts.tier
    if (t && (DOCTOR_TIERS as readonly string[]).includes(t))
      return t as DoctorRunLevel
    return 'standard'
  })()

  // ANV-0217 — diagnostic-dump tier forces verbose output.
  if (doctorRunLevel === 'diagnostic-dump') {
    opts.verbose = true
  }

  // ANV-0217 — wall-clock SLA timing.
  const runStart = performance.now()

  const checks: Check[] = []
  const cwd = process.cwd()
  const home = getUserHome()
  const anvilHome = join(home, '.anvil')
  const inProject = isProjectRoot(cwd)
  const SKIP_DETAIL =
    'not in a project root (no package.json / .git / etc.) — run from a project directory for project checks'

  // ANV-0146 — Resolve install scope (auto-detect or CLI override).
  const rawScope = opts.scope
  let installScope: InstallScope
  if (
    rawScope === 'global' ||
    rawScope === 'project' ||
    rawScope === 'both' ||
    rawScope === 'unknown'
  ) {
    installScope = rawScope
  } else {
    // 'auto' or undefined — use filesystem-derived detection.
    installScope = detectInstallScope(cwd, home)
  }

  // ANV-0146 — Add Install scope row (always visible, always pass).
  checks.push({
    name: 'Install scope',
    status: 'pass',
    detail: `scope: ${installScope}`,
    alwaysVisible: true,
  })

  // ANV-0090 — Pinned skills row. Reports the current pin count vs. the
  // configured cap. A parse failure on `~/.anvil/pins.json` warns; an
  // over-cap state (only reachable by hand-editing the file) also warns.
  // `alwaysVisible: true` so users see their pin count without --verbose.
  checks.push({ ...(await buildPinnedSkillsRow(home)), alwaysVisible: true })

  if (opts.fix) {
    const repairs = repairMissingDirs(cwd)
    if (repairs.length === 0) {
      process.stdout.write(
        chalk.green('✓ Nothing to repair — all directories present\n'),
      )
    } else {
      for (const r of repairs) {
        process.stdout.write(chalk.cyan(`  fixed: ${r}\n`))
      }
    }
  }

  // 1–3. Installer checks (ANV-0009): Node.js version, ~/.anvil/version,
  //      and plugin.json — extracted to doctor-checks/installer.ts.
  {
    const installerCtx: DoctorCheckContext = {
      cwd,
      home,
      anvilHome,
      inProject,
      skipDetail: SKIP_DETAIL,
      installScope,
    }
    const installerRows: DoctorCheckRow[] = []
    await pushInstallerChecks(installerCtx, installerRows)
    for (const row of installerRows) {
      checks.push({ name: row.name, status: row.status, detail: row.detail })
    }
  }

  // 4. CC user wiring: ~/.claude/plugins/installed_plugins.json contains anvil@anvil
  const installedPluginsPath = join(
    home,
    '.claude',
    'plugins',
    'installed_plugins.json',
  )
  const installedPlugins = await tryReadJson(installedPluginsPath)
  const ccUserWired = isCcUserWired(installedPlugins)
  checks.push({
    name: 'CC user wiring (~/.claude/plugins/installed_plugins.json)',
    status: ccUserWired ? 'pass' : 'warn',
    detail: ccUserWired
      ? 'anvil@anvil present'
      : 'not wired — run `anvil init`',
  })

  // 4b. ANV-0048 — External plugin conflict detector.
  //     Scans installed CC plugins against KNOWN_CONFLICTS and warns per hit.
  //     OpenCode adapter scan is deferred: no OC plugin inventory format is
  //     stable yet and the KNOWN_CONFLICTS['opencode'] registry is empty.
  //     ANVIL_CONFLICT_SEVERITY=fail promotes conflicts to hard failures (CI use).
  const conflictSeverity =
    process.env.ANVIL_CONFLICT_SEVERITY === 'fail' ? 'fail' : 'warn'
  _pushExternalPluginConflictCheck(checks, installedPlugins, conflictSeverity)

  // 4b-ii. ANV-0151 — Recommended integrations (complement plugins).
  //     Surfaces categories where no recommended plugin is installed.
  //     Emits 'skip' (informational) rows — never warns or fails.
  _pushRecommendedIntegrationsCheck(checks, installedPlugins)

  // 4c. ROADMAP-doctor-bare: surface CC --bare flag availability.
  _pushBareDiagnosticRow(checks)

  // 5. CC project wiring: $CWD/.claude/settings.json contains _anvilOwned entries
  // Plan 33 H2: skip when cwd is not a project root.
  // ANV-0146: on global-only installs, project-wiring absence is expected —
  //   emit 'skip' + expectedAbsence instead of 'warn' so quiet mode silences it.
  //   Migration debt: these inline checks should be moved to the DoctorCheck
  //   registry (doctor-registry.ts) using expectedWhen(ctx) once ANV-0141
  //   (Wave 4 migration) is complete.
  const projectSettingsPath = join(cwd, '.claude', 'settings.json')
  const projectSettings = inProject
    ? await tryReadJson(projectSettingsPath)
    : null
  if (!inProject) {
    checks.push({
      name: 'CC project wiring (.claude/settings.json)',
      status: 'skip',
      detail: SKIP_DETAIL,
    })
  } else {
    let ccProjectWired = false
    if (
      projectSettings !== null &&
      typeof projectSettings === 'object' &&
      !Array.isArray(projectSettings)
    ) {
      const hooks = (projectSettings as Record<string, unknown>).hooks
      if (
        hooks !== null &&
        typeof hooks === 'object' &&
        !Array.isArray(hooks)
      ) {
        ccProjectWired = Object.values(hooks as Record<string, unknown[]>)
          .flat()
          .some(
            (e) =>
              typeof e === 'object' &&
              e !== null &&
              (e as Record<string, unknown>)._anvilOwned === true,
          )
      }
    }
    // ANV-0146: expected absence — global-only install has no project settings.
    // When ccWiringExpected is true the row gets status='skip' + expectedAbsence=true
    // so the quiet-mode filter suppresses it (filter only reads expectedAbsence on
    // status==='skip' rows — setting it on 'warn' rows is dead code and was the
    // latent bug reverted in the ANV-0157 follow-up commit).
    const ccWiringExpected = !ccProjectWired && installScope === 'global'
    checks.push({
      name: 'CC project wiring (.claude/settings.json)',
      status: ccProjectWired ? 'pass' : ccWiringExpected ? 'skip' : 'warn',
      detail: ccProjectWired
        ? '_anvilOwned hooks present'
        : ccWiringExpected
          ? 'not wired (global-only install — expected)'
          : 'not wired — run `anvil init --scope project`',
      expectedAbsence: ccWiringExpected,
    })
  }

  // 5b. Statusline wiring (Plan 28 C9): $CWD/.claude/settings.json →
  // statusLine.command points to either `anvil statusline` or a shell
  // script in `.claude/`. Warn when missing or when it points at neither.
  // Plan 33 H2: skip when cwd is not a project root.
  // ANV-0146: on global-only installs, project statusline absence is expected.
  //   Migration debt: move to DoctorCheck registry with expectedWhen(ctx) — ANV-0141.
  if (!inProject) {
    checks.push({
      name: 'CC statusline wiring (.claude/settings.json → statusLine)',
      status: 'skip',
      detail: SKIP_DETAIL,
    })
  } else {
    const statuslineCheck = inspectStatuslineWiring(projectSettings)
    // ANV-0146: expected absence — global-only install.
    // When statuslineExpected is true, emit status='skip' + expectedAbsence=true
    // so the quiet-mode filter suppresses the row (filter only reads expectedAbsence
    // on status==='skip'; setting it on 'warn' rows is dead code).
    const statuslineExpected =
      statuslineCheck.status === 'warn' && installScope === 'global'
    checks.push({
      name: 'CC statusline wiring (.claude/settings.json → statusLine)',
      status: statuslineExpected ? 'skip' : statuslineCheck.status,
      detail: statuslineExpected
        ? 'not wired (global-only install — expected)'
        : statuslineCheck.detail,
      expectedAbsence: statuslineExpected,
    })
  }

  // 5b-global. Plan 33 E4: Global statusline drift detection.
  // Checks ~/.claude/settings.json → statusLine for non-anvil commands.
  const globalStatuslineCheck = inspectGlobalStatuslineWiring()
  if (globalStatuslineCheck !== null) {
    checks.push({
      name: 'Global statusline wiring (~/.claude/settings.json → statusLine)',
      status: globalStatuslineCheck.status,
      detail: globalStatuslineCheck.detail,
    })
  }

  // 5b2. Subagent statusline (Plan 29 F1): when models.json →
  // statusline.show_subagent_panel is true, warn if subagentStatusLine is
  // missing from .claude/settings.json.
  const subagentPanelCheck = inspectSubagentStatuslineWiring(
    projectSettings,
    anvilHome,
  )
  if (subagentPanelCheck !== null) {
    checks.push({
      name: 'CC subagentStatusLine wiring (.claude/settings.json → subagentStatusLine)',
      status: subagentPanelCheck.status,
      detail: subagentPanelCheck.detail,
    })
  }

  // 5b3. Statusline tier (Plan 32 A6): report the active tier so users can
  // see their current setting without hand-reading models.json.
  // Plan 34 A6: also show the active template inline.
  const { tier: activeTier, source: tierSource } = await resolveTier()
  const { template: activeTemplate } = await resolveTemplate()
  checks.push({
    name: 'Statusline tier (~/.anvil/models.json → statusline.tier)',
    status: 'pass',
    detail: `${activeTier} (source: ${tierSource}, template: ${activeTemplate}) — change with \`anvil statusline tier <minimal|default|maximal>\` or \`anvil statusline template <simple|rich>\``,
  })

  // 5c. Settings template (Plan 28 G4): $CWD/.claude/settings.json
  // present + parses + has `permissions` block. Warn when missing or
  // when the permissions block is absent — `anvil init` should have
  // emitted both. statusLine wiring is reported separately by 5b so
  // we just note its presence here.
  // Plan 33 H2: skip when cwd is not a project root.
  // ANV-0146: on global-only installs, settings template absence is expected.
  //   Migration debt: move to DoctorCheck registry with expectedWhen(ctx) — ANV-0141.
  if (!inProject) {
    checks.push({
      name: 'CC settings template (.claude/settings.json)',
      status: 'skip',
      detail: SKIP_DETAIL,
    })
  } else {
    const settingsTemplateCheck = inspectSettingsTemplate(projectSettings)
    // ANV-0146: expected absence — global-only install.
    // When templateExpected is true, emit status='skip' + expectedAbsence=true
    // so the quiet-mode filter suppresses the row (filter only reads expectedAbsence
    // on status==='skip'; setting it on 'warn' rows is dead code).
    const templateExpected =
      settingsTemplateCheck.status === 'warn' && installScope === 'global'
    checks.push({
      name: 'CC settings template (.claude/settings.json)',
      status: templateExpected ? 'skip' : settingsTemplateCheck.status,
      detail: templateExpected
        ? 'missing (global-only install — expected)'
        : settingsTemplateCheck.detail,
      expectedAbsence: templateExpected,
    })
  }

  // 6. OC user wiring: ~/.config/opencode/opencode.json contains file://...anvil...
  const ocUserConfigPath = join(home, '.config', 'opencode', 'opencode.json')
  const ocUserConfig = await tryReadJson(ocUserConfigPath)
  const ocUserWired =
    ocUserConfig !== null &&
    typeof ocUserConfig === 'object' &&
    !Array.isArray(ocUserConfig) &&
    Array.isArray((ocUserConfig as Record<string, unknown>).plugin) &&
    ((ocUserConfig as Record<string, unknown[]>).plugin as string[]).some(
      (p) => typeof p === 'string' && p.includes('anvil'),
    )
  checks.push({
    name: 'OC user wiring (~/.config/opencode/opencode.json)',
    status: ocUserWired ? 'pass' : 'warn',
    detail: ocUserWired
      ? 'anvil plugin entry present'
      : 'not wired — run `anvil init --target opencode`',
  })

  // 7. OC project wiring: $CWD/.opencode/opencode.json contains file://...anvil...
  // ANV-0146: on global-only installs, OC project wiring absence is expected.
  //   Migration debt: move to DoctorCheck registry with expectedWhen(ctx) — ANV-0141.
  if (!inProject) {
    checks.push({
      name: 'OC project wiring (.opencode/opencode.json)',
      status: 'skip',
      detail: SKIP_DETAIL,
    })
  } else {
    const ocProjectConfigPath = join(cwd, '.opencode', 'opencode.json')
    const ocProjectConfig = await tryReadJson(ocProjectConfigPath)
    const ocProjectWired =
      ocProjectConfig !== null &&
      typeof ocProjectConfig === 'object' &&
      !Array.isArray(ocProjectConfig) &&
      Array.isArray((ocProjectConfig as Record<string, unknown>).plugin) &&
      ((ocProjectConfig as Record<string, unknown[]>).plugin as string[]).some(
        (p) => typeof p === 'string' && p.includes('anvil'),
      )
    // ANV-0146: expected absence — global-only install.
    // When ocWiringExpected is true, emit status='skip' + expectedAbsence=true
    // so the quiet-mode filter suppresses the row (filter only reads expectedAbsence
    // on status==='skip'; setting it on 'warn' rows is dead code).
    const ocWiringExpected = !ocProjectWired && installScope === 'global'
    checks.push({
      name: 'OC project wiring (.opencode/opencode.json)',
      status: ocProjectWired ? 'pass' : ocWiringExpected ? 'skip' : 'warn',
      detail: ocProjectWired
        ? 'anvil plugin entry present'
        : ocWiringExpected
          ? 'not wired (global-only install — expected)'
          : 'not wired — run `anvil init --target opencode --scope project`',
      expectedAbsence: ocWiringExpected,
    })
  }

  // 7b. ANV-0074 — OC disable-flags: OPENCODE_DISABLE_* env vars silently break Anvil.
  _pushOcDisableFlagsCheck(checks)

  // 8. CLI ↔ slash parity check
  // Try the installed path first (~/.anvil/commands/); fall back to the repo
  // source path so the check works when running Anvil from source.
  //
  // Path resolution:
  //   installed bundle: __dirname = ~/.anvil/runtime/dist/ (bundle CJS dir)
  //                     repoRoot = __dirname/../../../ = ~/  (NOT the repo)
  //                     → repoCliDir won't exist; fall back to runtimeCliDir
  //   compiled:  __dirname = <repo>/dist/commands/cli/ → repoRoot/../../../ = repo
  //   tsx/bun:   __dirname = <repo>/src/commands/cli/  → repoRoot/../../../ = repo
  //
  // CLI dir candidates (first one that exists wins):
  //   1. <repoRoot>/src/commands/cli  — dev / compiled from repo (.ts files)
  //   2. ~/.anvil/runtime/dist/commands/cli — installed bundle (.js files)
  const installedSlashDir = join(anvilHome, 'commands')
  const repoRoot = join(__dirname, '..', '..', '..')
  const repoSlashDir = join(repoRoot, 'src', 'commands', 'slash')
  const repoCliDir = join(repoRoot, 'src', 'commands', 'cli')
  // Fallback for when running from the installed bundle where repoCliDir won't
  // resolve to the repo (bundle is 3 levels above home, not the repo root).
  const runtimeCliDir = join(anvilHome, 'runtime', 'dist', 'commands', 'cli')
  const resolvedCliDir = existsSync(repoCliDir) ? repoCliDir : runtimeCliDir

  const hasInstalled = existsSync(installedSlashDir)
  const hasRepo = existsSync(repoSlashDir)
  const slashDirToCheck = hasInstalled
    ? installedSlashDir
    : hasRepo
      ? repoSlashDir
      : null
  const source: 'installed' | 'dev' | null = hasInstalled
    ? 'installed'
    : hasRepo
      ? 'dev'
      : null

  if (slashDirToCheck === null) {
    checks.push({
      name: 'CLI ↔ slash parity',
      status: 'warn',
      detail: 'slash commands dir not found — run `anvil init` to install',
    })
  } else {
    const parityReport = await auditCliSlashParity({
      slashDir: slashDirToCheck,
      cliDir: resolvedCliDir,
    })

    if (parityReport.checkedSlashCount === 0) {
      checks.push({
        name: 'CLI ↔ slash parity',
        status: 'warn',
        detail: 'no slash commands found to check',
      })
    } else if (parityReport.issues.length === 0) {
      // When the installed dir is missing we fell back to the repo's dev source.
      // That still validates the code, but it is not the installed state —
      // surface a warn so the user knows to re-run `anvil init`.
      const status: CheckStatus = source === 'installed' ? 'pass' : 'warn'
      const srcLabel =
        source === 'installed'
          ? 'installed'
          : 'dev source (re-run `anvil init`)'
      checks.push({
        name: 'CLI ↔ slash parity',
        status,
        detail: `${parityReport.checkedSlashCount} slashes checked against ${srcLabel}`,
      })
    } else {
      const first = parityReport.issues[0]
      checks.push({
        name: 'CLI ↔ slash parity',
        status: 'fail',
        detail: `${parityReport.issues.length} issue(s) — ${first.detail}`,
      })
    }
  }

  // ANV-0217 — Quick tier skips expensive checks (subprocess-heavy, filesystem walks).
  // Standard+ tiers run all checks. The `userInvocableNames` variable is needed by
  // opts.live; declare it at scope level with a fallback for the quick path.
  let userInvocableNames: string[] = []

  if (doctorRunLevel !== 'quick') {
    // 9. Skill registry health: declared in models.json must exist in skills/;
    //    no duplicate skill names across tiers.
    // ANV-0185: skill-triggering fixture coverage migrated to `npm run dev:doctor`
    //           (no-op callback passed — fixture check runs only in dev-doctor)
    const registryResult = await _pushSkillRegistryChecks(
      checks,
      cwd,
      anvilHome,
      (_c, _cwd, _names) => {}, // fixture coverage → dev:doctor
    )
    userInvocableNames = registryResult.userInvocableNames

    // 9b. Skill version pins (Plan 30 G3): compare installed skill versions
    //     against user-pinned minimums in models.json → skill_versions.
    await _pushSkillVersionChecks(checks, cwd, anvilHome)

    // [ANV-0184] sub_skills graph health — migrated to `anvil skill lint`
    // [ANV-0184] skill providers / activation / skill-shadow — migrated to `anvil skill lint`

    // 9c. Agent runtime preconditions (Plan 28 H4): scan loaded agents for
    //     fields whose runtime requirements aren't met (worktree isolation
    //     outside a git repo; project memory without a writable
    //     .claude/agent-memory/ directory).
    await _pushAgentRuntimeChecks(checks, cwd)

    // ANV-0209 — Frontmatter portability (standard+ tier).
    // Asserts agents/ and skills/ use only v0.16 allowlist keys.
    // Unknown root key → fail. Deprecated transitional key → warn.
    // Unknown x-anvil sub-key → warn.
    _pushFrontmatterPortabilityCheck(checks, cwd, inProject, SKIP_DETAIL)

    // ANV-0279 — Prose AI-tell denylist (standard+ tier, warn-only).
    // Scans skills/, agents/, docs/ for banned filler terms.
    _pushProseAiTellCheck(checks, cwd, inProject, SKIP_DETAIL)

    // 9d. Plan 32 B6 — skill loading mode (eager vs lazy) + bodies fetched.
    await _pushSkillLoadingModeCheck(checks, anvilHome, cwd)

    // 9e. Plan 32 C7 — compression hook (on-large-output) status.
    await _pushCompressionHookCheck(checks, anvilHome, cwd)

    // ANV-0092 — composition overlay inventory.
    await _pushCompositionOverlaysCheck(checks, cwd, anvilHome)

    // 9f. Plan 33 B5 — output schema coverage: agents declaring output_schema.
    await _pushOutputSchemaCoverageCheck(checks, anvilHome)

    // 9g. ANV-0037 — Skill MCP providers availability (additive row).
    await _pushSkillMcpProvidersCheck(checks, cwd)

    // [ANV-0184] hook exit-code contract — migrated to `anvil hook lint`
    // [ANV-0185] OC hook registry coverage — migrated to `npm run dev:doctor`

    // 10b. Plan 33 J5 — Hook output validation guard.
    //      Confirms the dispatcher boundary guard (validateOrFallback) is
    //      active by dry-running HookResult.parse() on a canonical shape.
    //      This detects schema drift early; a fail here means the guard
    //      would catch every handler invocation at runtime.
    await _pushHookOutputValidationCheck(checks)

    // 10c. Plan 34 C5 — Hook latency budget (reads ~/.anvil/logs/hook-timings.jsonl).
    await _pushHookLatencyBudgetCheck(checks)

    // 10c2. ANV-0056 — SessionStart context budget (reads ~/.anvil/logs/session-start-overruns.jsonl).
    await _pushSessionStartBudgetCheck(checks)

    // 10c3. ANV-0128 — Hook profiles row.
    //       Surfaces the active profile (resolved from
    //       config.hooks.<name>.profile + manifest.defaultProfile) for every
    //       handler that declares a profile manifest. Currently:
    //       memory-validator, prompt-guard. The row reflects what the
    //       dispatcher would apply at runtime.
    {
      const { loadConfig } = await import('../../core/config/load.js')
      try {
        const cfg = await loadConfig({ scope: 'project', cwd, home })
        await _pushHookProfilesCheck(checks, cfg)
      } catch {
        // If project config cannot be loaded (not in a project / parse error),
        // fall back to defaults so the row still surfaces the handler set.
        const { buildDefaultConfig } = await import(
          '../../core/config/defaults.js'
        )
        await _pushHookProfilesCheck(checks, buildDefaultConfig())
      }
    }

    // [ANV-0185] Every HookKind has a registered handler — migrated to `npm run dev:doctor`
    // [ANV-0185] CC hook event coverage matrix — migrated to `npm run dev:doctor`
    // [ANV-0185] context-observability/hooks-wired — migrated to `npm run dev:doctor`
    // [ANV-0185] Pre-compact handler wired — migrated to `npm run dev:doctor`

    // 11. Plan 31 B6: systemInsert path checks.
    //   11a. .claude/rules/anvil-routing.md present + canonical?
    if (!inProject) {
      checks.push({
        name: '.claude/rules/anvil-routing.md (standing instructions)',
        status: 'skip',
        detail: SKIP_DETAIL,
      })
    } else {
      await _pushRoutingRulesCheck(checks, cwd)
    }
    //   11b. active-routing.json last-write timestamp (per-project path).
    if (!inProject) {
      checks.push({
        name: 'active-routing.json (last routing decision)',
        status: 'skip',
        detail: SKIP_DETAIL,
      })
    } else {
      await _pushActiveRoutingCheck(checks, cwd)
    }
    //   11c. [ANV-0185] Dry-run envelope generation — migrated to `npm run dev:doctor`

    // 12. Plan 32 F5: OpenCode standing instructions (AGENTS.md routing block).
    await _pushOcStandingInstructionsCheck(checks, cwd, anvilHome)

    // 13. [ANV-0185] Tier integrity — migrated to `npm run dev:doctor`
    // 14. [ANV-0184] CSO discipline — migrated to `anvil skill lint`
    // 14a. [ANV-0184] description-budget — migrated to `anvil skill lint`
    // 14b. [ANV-0184] skill behavior validation (catalog) — migrated to `anvil skill lint`
    // 15.  [ANV-0184] slug-namespace integrity — migrated to `anvil skill lint`

    // [ANV-0185] Phase-manifest token resolution — migrated to `npm run dev:doctor`
    // [ANV-0185] Model id allowlist — migrated to `npm run dev:doctor`

    // [ANV-0184] 5 description-shape lints — migrated to `anvil skill lint`
    // ANV-0033 — capability snapshot (provenance + fallback-chain remain; integrity/freshness → dev:doctor)
    {
      const capCtx: DoctorCheckContext = {
        cwd,
        home,
        anvilHome,
        inProject,
        skipDetail: SKIP_DETAIL,
        installScope,
      }
      const capRows: DoctorCheckRow[] = []
      // [ANV-0185] _pushSnapshotIntegrityCheck — migrated to `npm run dev:doctor`
      // [ANV-0185] _pushSnapshotFreshnessCheck — migrated to `npm run dev:doctor`
      _pushModelProvenanceCheck(capCtx, capRows)
      _pushFallbackChainCoverageCheck(capCtx, capRows)
      for (const row of capRows) {
        checks.push({ name: row.name, status: row.status, detail: row.detail })
      }
    }
    // ANV-0221 follow-up — user-config model-alias advisory (warn-only).
    // Restores the lost WARN for concrete model IDs pinned in the user's
    // ~/.anvil/models.json (the unit test can't read a user's home dir).
    _pushUserModelAliasAdvisoryCheck(checks, anvilHome)
    // [ANV-0184] hook handler size — migrated to `anvil hook lint`
    // [ANV-0184] skill content lint — migrated to `anvil skill lint`
    // ANV-0137 — templates: user-override visibility (still in doctor — user-meaningful)
    _pushTemplateUserOverridesCheck(checks, join(home, '.anvil'))
    // [ANV-0184] template embedded-prose lint — migrated to `anvil hook lint`
    // [ANV-0185] decision-template/skills-using-it info row — migrated to `npm run dev:doctor`
    // [ANV-0185] surfaces-audit/dimension-drift — migrated to `npm run dev:doctor`
    // [ANV-0184] required-reading budget + paths — migrated to `anvil agent lint`
    _pushOpenCodeConfigKnownKeysCheck(checks, cwd, inProject, SKIP_DETAIL)
    await _pushOcPluginAgentsCheck(checks, anvilHome)
    // v0.11.2 Bundle E — shallow file-existence + config-URL check for the
    // compiled plugin at ~/.anvil/plugins/opencode/index.js.
    _pushOpenCodePluginReachableRow(checks, anvilHome, [
      join(home, '.config', 'opencode', 'opencode.json'),
      join(cwd, '.opencode', 'opencode.json'),
    ])
    // ANV-0001 — per-adapter bootstrap status. Exits non-zero when bootstrap
    // content cannot be located. Gate must run after OpenCode reachability so
    // the user sees a clear remediation path in the right order.
    _pushAdapterBootstrapCheck(checks, cwd, anvilHome)
    // [ANV-0185] cross-contamination guard — migrated to `npm run dev:doctor`
    // ANV-0103 — bootstrap content version-skew check. Runs after ANV-0001 so
    // we can assume bootstrap content is expected to exist when we get here.
    await _pushBootstrapSkewCheck(checks, cwd, anvilHome)
    // ANV-0028 (P5) — Catalog doctor rows. When --catalog is active, these are the
    // ONLY rows that run (all other checks above are skipped in catalog-only mode).
    // In normal mode they run as additional rows after extensions.
    //
    // NOTE: When opts.catalog is true, doctorCommand exits early after collecting
    // only catalog rows — see the catalog-only fast-path below.
    if (!opts.catalog) {
      // ANV-0203 (P6) — Extensions doctor row. Checks _registry.json for installed
      // extensions, re-validates manifests, detects collisions, and flags version
      // compat failures. Pass four empty bundled sets until ANV-0028 P5 supplies
      // the catalog inventory — Tier 1 (installed-extension shadow) is still useful
      // without Tier 2/3 bundled data.
      await _pushExtensionsCheck(checks, anvilHome, {
        // TODO(ANV-0028): replace with real bundled slug inventories from the catalog.
        skill: new Set<string>(),
        agent: new Set<string>(),
        hook: new Set<string>(),
        command: new Set<string>(),
      })
    }
  } // end doctorRunLevel !== 'quick'

  if (doctorRunLevel !== 'quick') {
    // ANV-0246 — Catalog rows moved to experimental. Dynamic import with fallback.
    // If experimental build absent, silently skip (no catalog rows in default build).
    try {
      const expCatalogPath = '../../experimental/' + 'catalog/doctor-checks.js'
      const { pushCatalogChecks: _pushCatalogChecksExp } = (await import(
        /* @vite-ignore */
        expCatalogPath
      )) as {
        pushCatalogChecks: (checks: Check[], anvilHome: string) => Promise<void>
      }
      await _pushCatalogChecksExp(checks, anvilHome)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
        process.stderr.write(
          `[anvil:doctor-checks] warn: experimental load failed: ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
      // Expected default-build path: module absent → silent.
    }

    // ANV-0245 — Experimental features rows. One row per feature in the registry.
    // Runs after catalog so experimental status is grouped near the end of the output.
    _pushExperimentalChecks(checks)
  }

  // [ANV-0184] skill provenance coverage — migrated to `anvil skill lint`
  // [ANV-0184] CC-native fields adoption — migrated to `anvil skill lint`
  // [ANV-0184] skill provenance object — migrated to `anvil skill lint`
  // [ANV-0184] expected_tokens coverage — migrated to `anvil skill lint`
  // [ANV-0184] skill version coverage + provenance freshness — migrated to `anvil skill lint`
  // [ANV-0185] skill version regression — migrated to `npm run dev:doctor`
  // [ANV-0185] doc tests structural — migrated to `npm run dev:doctor`
  // [ANV-0185] doc drift — migrated to `npm run dev:doctor`
  // [ANV-0185] SDD old-path migration — migrated to `npm run dev:doctor`
  // [ANV-0185] command safety annotations — migrated to `npm run dev:doctor`

  // [ANV-0184] agent + hook safety annotations — migrated to `anvil agent lint`
  // [ANV-0184] agent permission taxonomy — migrated to `anvil agent lint`

  // [ANV-0185] Generated-file guard — migrated to `npm run dev:doctor`
  // [ANV-0185] Version sync — migrated to `npm run dev:doctor`
  // [ANV-0185] routing-rules sync — migrated to `npm run dev:doctor`
  // [ANV-0185] Worktree base freshness — migrated to `npm run dev:doctor`
  // [ANV-0185] Pre-push parity — migrated to `npm run dev:doctor`
  // [ANV-0185] Count drift (README + self-audit) — migrated to `npm run dev:doctor`

  // ANV-0217 — SLA timing summary row (always visible).
  const elapsedMs = Math.round(performance.now() - runStart)
  const SLA_BUDGETS: Record<DoctorRunLevel, number | null> = {
    quick: 2000,
    standard: 5000,
    deep: null,
    'diagnostic-dump': null,
  }
  const budget = SLA_BUDGETS[doctorRunLevel]
  const slaStatus =
    budget === null ? 'pass' : elapsedMs <= budget ? 'pass' : 'warn'
  checks.push({
    name: `Doctor run (${doctorRunLevel})`,
    status: slaStatus,
    detail:
      budget === null
        ? `elapsed: ${elapsedMs}ms (no SLA budget for ${doctorRunLevel})`
        : `elapsed: ${elapsedMs}ms${slaStatus === 'warn' ? ` — exceeded ${budget}ms budget` : ` ≤ ${budget}ms budget`}`,
    alwaysVisible: true,
  })

  if (maybeEmitJson(checks, opts)) return

  // Convert Check[] → CheckRow[] for printCheckList
  const allRows: CheckRow[] = checks.map((c) => ({
    status: c.status,
    label: c.name,
    detail: c.detail,
  }))

  // ANV-0140 — Quiet-by-default output mode.
  // In verbose mode, show every row exactly as before.
  // In quiet mode (default), hide:
  //   - pass rows (unless alwaysVisible is set — ANV-0146)
  //   - expected-absence skips (rows skipped because we are not in a project
  //     root, or because the CWD lacks an agents/ or skills/ tree — these are
  //     informational and not actionable outside an Anvil source tree).
  // Warns and fails always show so actionable signal is never suppressed.
  // Footer tally is always computed from the full unfiltered set.
  //
  // Suppression is predicate-driven via `Check.expectedAbsence` (structured
  // approach mirroring DoctorCheck.expectedWhen for inline checks). The
  // string-equality SKIP_DETAIL fallback covers project-root checks that
  // haven't been individually flagged yet.
  const displayRows = opts.verbose
    ? allRows
    : checks
        .filter((c) => {
          // alwaysVisible rows are never suppressed (ANV-0146: Install scope row).
          if (c.alwaysVisible) return true
          // Fails and warns are always shown (never suppressed).
          if (c.status === 'fail' || c.status === 'warn') return true
          // Suppress expected-absence skips: both the structured flag
          // (expectedAbsence) and the string-equality fallback (SKIP_DETAIL).
          if (c.status === 'skip') {
            if (c.expectedAbsence) return false
            if (c.detail === SKIP_DETAIL) return false
          }
          // Suppress pass rows.
          if (c.status === 'pass') return false
          return true
        })
        .map((c) => ({ status: c.status, label: c.name, detail: c.detail }))

  if (!opts.verbose && displayRows.length === 0) {
    // All checks passed — print a single-line "all good" summary.
    console.log(chalk.green('  ✓ All checks passed'))
  }

  printCheckList(displayRows, allRows)

  // Plan 42 Item C — `--fix` runs documented remediations for known warns.
  // `--dry-run` prints the plan without executing. Fail rows are NEVER
  // auto-fixed (operator must investigate root cause).
  if (opts.fix) {
    await runDoctorFixes(checks, { dryRun: opts.dryRun === true })
  }

  // ANV-0045 / ANV-0217 — live skill-triggering eval.
  // Runs when --live flag is set OR when doctorRunLevel is 'deep' or 'diagnostic-dump'.
  //
  // ANV-0217 follow-up: at the quick tier the skill-registry checks are skipped,
  // so `userInvocableNames` is empty. Running the eval against an empty list is
  // a silent no-op. When --live is requested at quick tier, warn that --live
  // needs standard+ and skip the eval rather than evaluating zero skills.
  const liveDecision = decideLiveEval({
    live: opts.live === true,
    runLevel: doctorRunLevel,
  })
  if (liveDecision.degradedLive) {
    process.stdout.write(
      chalk.yellow(
        '\n  ⚠ --live requires standard tier or higher (skill registry is not loaded at the quick tier); skipping live skill-triggering eval. Re-run with `--tier standard` (or drop `--smoke`).\n',
      ),
    )
  } else if (liveDecision.run) {
    const fixturesDir = join(cwd, 'tests', 'skill-triggering', 'fixtures')
    await runLiveSkillEval(userInvocableNames, fixturesDir)
  }

  if (checks.some((c) => c.status === 'fail')) process.exit(1)
}

/**
 * Plan 42 Item C — execute (or dry-run) the remediation plan for fixable warns.
 *
 * Commands run via spawnSync with stdio inherited so the user sees the
 * remediation's own output. Dry-run prints the plan and returns.
 */
async function runDoctorFixes(
  checks: Check[],
  opts: { dryRun: boolean },
): Promise<void> {
  const plan = planDoctorFixes(checks)
  if (plan.length === 0) {
    process.stdout.write(
      chalk.cyan('\n  No fixable warns — nothing to repair.\n'),
    )
    return
  }
  process.stdout.write(
    chalk.bold(
      opts.dryRun
        ? `\n  Dry-run: ${plan.length} remediation(s) would run:\n`
        : `\n  Running ${plan.length} remediation(s):\n`,
    ),
  )
  for (const item of plan) {
    process.stdout.write(`    • ${item.rowName}: ${chalk.cyan(item.command)}\n`)
  }
  if (opts.dryRun) {
    process.stdout.write(chalk.dim('\n  (dry-run — no commands executed)\n'))
    return
  }
  const { spawnSync } = await import('node:child_process')
  for (const item of plan) {
    const [bin, ...args] = item.command.split(/\s+/)
    process.stdout.write(chalk.bold(`\n  → ${item.command}\n`))
    const result = spawnSync(bin, args, { stdio: 'inherit' })
    if (result.status !== 0) {
      process.stdout.write(
        chalk.yellow(
          `  remediation exited ${result.status}; re-run \`anvil doctor\` to verify state\n`,
        ),
      )
    }
  }
  process.stdout.write(
    chalk.dim('\n  Re-run `anvil doctor` to verify the warns are resolved.\n'),
  )
}

// pushEnvelopeDryRunCheck extracted to doctor-checks/envelope.ts (ANV-0141).
// runLiveSkillEval extracted to doctor-checks/live-eval.ts (ANV-0141).

// Test helpers (exported only for testing — not part of the public API)
// ---------------------------------------------------------------------------

/**
 * Plan 33 E6 — test helper that exposes `classifyStatuslineCommand` for
 * drift-detection unit tests. The private function is intentionally not
 * re-exported by name to keep the API surface clean; callers import this
 * wrapper instead.
 *
 * @internal
 */
export function classifyStatuslineCommandForTest(settings: unknown): {
  kind: 'anvil' | 'anvil-shell' | 'custom' | 'missing'
  command: string
} {
  return classifyStatuslineCommand(settings)
}

/**
 * Plan 33 E6 — test helper that exposes `inspectStatuslineWiring` for
 * drift-detection tests.
 *
 * @internal
 */
export function inspectStatuslineWiringForTest(projectSettings: unknown): {
  status: 'pass' | 'warn'
  detail: string
} {
  return inspectStatuslineWiring(projectSettings)
}
