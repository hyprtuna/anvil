/**
 * ANV-0141 — Plugin category doctor checks.
 *
 * Extracted from `doctor.ts` (previously inline push helpers).
 * Keeps `function pushXyzCheck(checks: Check[])` signatures intact.
 * The dispatcher in `doctor.ts` re-exports these via named re-exports.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractCcInstalledSlugs,
  scanForConflicts,
} from '../../../core/conflicts/scan.js'
import { findIntegrationGaps } from '../../../core/integrations/scan.js'
import { OpenCodeConfig } from '../../../core/manifest-schema/opencode-config.js'
import {
  ANVIL_OC_ROUTING_CONTENT,
  OC_ROUTING_MARKER_CLOSE,
  OC_ROUTING_MARKER_OPEN,
} from '../../../core/routing-rules-content.js'
import { checkAdapterCrossContamination } from '../../../installer/cross-contamination-check.js'
import { readAnvilManifestTarget } from '../../../installer/install.js'
import { SkillProvider } from '../../../skills/providers.js'

// Local mirror of the Check interface from doctor.ts (same shape).
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * ANV-0048 — External-plugin conflict detector.
 *
 * Scans installed CC plugins (~/.claude/plugins/installed_plugins.json) against
 * KNOWN_CONFLICTS and surfaces one warn row per hit. A clean scan produces a
 * single pass row. The check is purely advisory — it never auto-disables plugins.
 *
 * Severity is configurable per the ticket spec: default is `warn`. Passing
 * `severity: 'fail'` promotes every hit to a hard fail (useful in CI).
 *
 * @param checks      Doctor check accumulator.
 * @param ccInstalledPluginsPayload  Parsed JSON from installed_plugins.json
 *                                   (pass `null` when the file is absent).
 * @param severity    Row status to use when a conflict is detected. Default: 'warn'.
 */
export function pushExternalPluginConflictCheck(
  checks: Check[],
  ccInstalledPluginsPayload: unknown,
  severity: 'warn' | 'fail' = 'warn',
): void {
  const installedSlugs = extractCcInstalledSlugs(ccInstalledPluginsPayload)

  // If we couldn't read the manifest at all (null payload) we skip — the
  // CC user wiring check already surfaces the absent file.
  if (ccInstalledPluginsPayload === null) {
    checks.push({
      name: 'External plugin conflicts',
      status: 'skip',
      detail: 'installed_plugins.json absent — skipping conflict scan',
      expectedAbsence: true,
    })
    return
  }

  const hits = scanForConflicts('claude-code', installedSlugs)

  if (hits.length === 0) {
    checks.push({
      name: 'External plugin conflicts',
      status: 'pass',
      detail: `${installedSlugs.length} installed plugin(s) checked — no conflicts detected`,
    })
    return
  }

  for (const hit of hits) {
    checks.push({
      name: 'External plugin conflicts',
      status: severity,
      detail: `conflict: ${hit.slug} — ${hit.reason}`,
    })
  }
}

/**
 * ANV-0151 — Recommended integrations doctor row.
 *
 * Emits informational 'skip' rows for capability categories where none of the
 * recommended complement plugins are installed.  This is advisory only — it
 * never produces 'warn' or 'fail' rows, so it is silent in quiet mode and
 * only visible with -v.
 *
 * States:
 *   - payload is null  → skip with 'installed_plugins.json absent — skipping integration scan'
 *   - all categories covered → pass with 'all recommended integrations present'
 *   - 1+ gap           → one skip row per gap with recommendation detail
 */
export function pushRecommendedIntegrationsCheck(
  checks: Check[],
  ccInstalledPluginsPayload: unknown,
): void {
  const ROW_NAME = 'Recommended integrations'

  if (ccInstalledPluginsPayload === null) {
    checks.push({
      name: ROW_NAME,
      status: 'skip',
      detail: 'installed_plugins.json absent — skipping integration scan',
      expectedAbsence: true,
    })
    return
  }

  const installedSlugs = extractCcInstalledSlugs(ccInstalledPluginsPayload)
  const gaps = findIntegrationGaps('claude-code', installedSlugs)

  if (gaps.length === 0) {
    checks.push({
      name: ROW_NAME,
      status: 'pass',
      detail: 'all recommended integrations present',
    })
    return
  }

  for (const gap of gaps) {
    const recommendations = gap.recommended
      .map((r) => {
        const parts = [`${r.slug} (${gap.category})`, `— ${r.reason}`]
        if (r.docUrl !== undefined) parts.push(`; see ${r.docUrl}`)
        return parts.join(' ')
      })
      .join(', ')
    checks.push({
      name: ROW_NAME,
      status: 'skip',
      detail: `recommend: ${recommendations}`,
    })
  }
}

/**
 * ANV-0060 — Cross-contamination guard doctor row.
 *
 * Verifies that neither registered adapter's `ownedPathPrefixes` overlap with
 * another adapter's territory. A violation here indicates an adapter
 * misconfiguration (or an upstream bug) that would cause the installer to
 * corrupt one adapter's configuration tree when wiring the other.
 *
 * Severity: warn — the overlap is a configuration inconsistency, not
 * necessarily active corruption (the guard in `applyTargets` would have
 * already blocked the install-time write).
 */
export function pushCrossContaminationCheck(checks: Check[]): void {
  const { ok, messages } = checkAdapterCrossContamination()

  if (ok) {
    checks.push({
      name: 'Adapter cross-contamination guard',
      status: 'pass',
      detail: 'claude-code and opencode ownedPathPrefixes are disjoint',
    })
  } else {
    for (const msg of messages) {
      checks.push({
        name: 'Adapter cross-contamination guard',
        status: 'warn',
        detail: msg,
      })
    }
  }
}

/**
 * v0.11.2 Bundle C — OpenCode plugin agent count doctor row (D-10).
 *
 * Reports how many Anvil agents are installed at `~/.anvil/agents/*.md`.
 *   - green  (pass): ≥1 agents loaded successfully
 *   - yellow (warn):  0 agents (dir missing or empty)
 *   - red    (fail):  agents dir readable but all files fail to parse
 *
 * Does not import from src/opencode-plugin/ to respect the layer boundary
 * (commands layer 4 cannot import from the plugin which sits at layer 5).
 * Uses a minimal inline frontmatter detector — just checks for valid `name:`
 * in a `---` block — which is sufficient for a count health-check.
 */
export async function pushOcPluginAgentsCheck(
  checks: Check[],
  anvilHome: string,
): Promise<void> {
  const agentsDir = join(anvilHome, 'agents')
  let entries: string[]

  try {
    const dirents = readdirSync(agentsDir)
    entries = dirents.filter((f) => f.endsWith('.md'))
  } catch {
    // Directory missing or unreadable → yellow (zero agents loaded, D-10).
    checks.push({
      name: 'OC plugin agents loaded',
      status: 'warn',
      detail: 'no agents directory at ~/.anvil/agents — run `anvil init`',
    })
    return
  }

  if (entries.length === 0) {
    checks.push({
      name: 'OC plugin agents loaded',
      status: 'warn',
      detail: '0 agents found in ~/.anvil/agents',
    })
    return
  }

  let loaded = 0
  let parseErrors = 0

  for (const filename of entries) {
    const filePath = join(agentsDir, filename)
    try {
      const content = readFileSync(filePath, 'utf-8')
      // Minimal validity check: must have frontmatter with a `name:` field
      // matching the slug grammar [a-z][a-z0-9-]*.
      const fm = content.startsWith('---\n')
        ? content.slice(4, content.indexOf('\n---\n', 4))
        : null
      if (fm !== null && /^name:\s+[a-z][a-z0-9-]*\s*$/m.test(fm)) {
        loaded++
      } else {
        parseErrors++
      }
    } catch {
      parseErrors++
    }
  }

  if (loaded === 0) {
    checks.push({
      name: 'OC plugin agents loaded',
      status: 'fail',
      detail: `0 of ${entries.length} agent file(s) have valid frontmatter`,
    })
  } else {
    const detail =
      parseErrors > 0
        ? `${loaded} agent(s) loaded (${parseErrors} file(s) skipped — invalid frontmatter)`
        : `${loaded} agent(s) loaded`
    checks.push({
      name: 'OC plugin agents loaded',
      status: 'pass',
      detail,
    })
  }
}

/**
 * ANV-0074 — Detect OpenCode disable-flag env vars that silently break Anvil.
 *
 * Scans `process.env` for `OPENCODE_DISABLE_EXTERNAL_SKILLS`,
 * `OPENCODE_DISABLE_CLAUDE_CODE`, and any other `OPENCODE_DISABLE_*` vars.
 *
 * Status:
 *   pass — no OPENCODE_DISABLE_* vars set
 *   warn — one or more OPENCODE_DISABLE_* vars are set (with remediation hint)
 *
 * The `env` parameter exists for testability; callers pass `process.env`.
 *
 * Exported for unit testing.
 */
export function pushOcDisableFlagsCheck(
  checks: Check[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  const KNOWN_FLAGS = [
    'OPENCODE_DISABLE_EXTERNAL_SKILLS',
    'OPENCODE_DISABLE_CLAUDE_CODE',
  ]

  // Collect all OPENCODE_DISABLE_* flags from the environment with truthy
  // values — '0', 'false', 'no', 'off' (case-insensitive) are NOT treated
  // as set, matching OpenCode's own truthy-only semantics.
  const TRUTHY = /^(1|true|yes|on)$/i
  const setFlags: string[] = []

  for (const key of Object.keys(env)) {
    if (key.startsWith('OPENCODE_DISABLE_') && TRUTHY.test(env[key] ?? '')) {
      setFlags.push(key)
    }
  }

  // Ensure the two known flags always appear first (if set), then any extras.
  setFlags.sort((a, b) => {
    const ai = KNOWN_FLAGS.indexOf(a)
    const bi = KNOWN_FLAGS.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  if (setFlags.length === 0) {
    checks.push({
      name: 'OC disable-flags (OPENCODE_DISABLE_*)',
      status: 'pass',
      detail: 'no OPENCODE_DISABLE_* flags set',
    })
    return
  }

  const flagList = setFlags.join(', ')
  const hint =
    'unset these env vars to restore Anvil integration — e.g. `unset OPENCODE_DISABLE_EXTERNAL_SKILLS`'
  checks.push({
    name: 'OC disable-flags (OPENCODE_DISABLE_*)',
    status: 'warn',
    detail: `${setFlags.length} disable-flag(s) set: ${flagList} — ${hint}`,
  })
}

/**
 * D-02 — OpenCode config known-keys doctor row.
 *
 * Validates that `.opencode/opencode.json`'s inner `skills` block contains
 * only known keys. Unknown keys are surfaced as `warn` (never `fail`) so
 * users with stale config keep a working install. The outer object stays
 * permissive (D-01) — only inner-skills strictness is enforced here.
 *
 * Status:
 *   - pass  — config parses cleanly under strict schema
 *   - warn  — unknown skills.* key(s) present; detail enumerates up to 3
 *   - skip  — no .opencode/opencode.json in project, or not in project
 */
export function pushOpenCodeConfigKnownKeysCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
): void {
  const cfgPath = join(cwd, '.opencode', 'opencode.json')
  if (!inProject || !existsSync(cfgPath)) {
    checks.push({
      name: 'OpenCode config has known keys only',
      status: 'skip',
      detail: skipDetail,
    })
    return
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(cfgPath, 'utf-8'))
  } catch {
    checks.push({
      name: 'OpenCode config has known keys only',
      status: 'warn',
      detail: 'unable to parse .opencode/opencode.json',
    })
    return
  }
  const result = OpenCodeConfig.safeParse(raw)
  if (result.success) {
    checks.push({
      name: 'OpenCode config has known keys only',
      status: 'pass',
      detail: 'config parses under strict schema',
    })
    return
  }
  const offenders = result.error.issues
    .filter((i) => i.code === 'unrecognized_keys')
    .flatMap((i) => ('keys' in i ? (i.keys as string[]) : []))
  const shown = offenders.slice(0, 3).join(', ')
  const more = offenders.length > 3 ? ` …+${offenders.length - 3} more` : ''
  checks.push({
    name: 'OpenCode config has known keys only',
    status: 'warn',
    detail: `unknown skills.* key(s): ${shown}${more}`,
  })
}

/**
 * v0.11.2 Bundle E — "OpenCode plugin built and reachable" doctor row.
 *
 * Shallow file-existence + config-URL check; does NOT dynamically import the
 * plugin (that is the role of the companion "OC plugin agents loaded" row from
 * Bundle C). Runs even when the plugin cannot be loaded (e.g. wrong Node version).
 *
 * Status:
 *   - fail  — plugin entry-point file missing (not built / not installed)
 *   - warn  — plugin exists but package.json unreadable, or wired config URL
 *             points to a different path
 *   - pass  — plugin file and package.json present; wired configs (if any)
 *             point to the expected path
 *
 * Non-pass detail ends with: `see docs/opencode-plugin.md#troubleshooting`
 *
 * `ocConfigPaths` is the list of OC config files to check for plugin URL
 * wiring (typically user config + project config). Paths that do not exist
 * on disk are silently skipped.
 */
export function pushOpenCodePluginReachableRow(
  checks: Check[],
  anvilHome: string,
  ocConfigPaths: string[],
): void {
  const ANCHOR = 'see docs/opencode-plugin.md#troubleshooting'
  const pluginIndex = join(anvilHome, 'plugins', 'opencode', 'index.js')
  const pluginPkg = join(anvilHome, 'plugins', 'opencode', 'package.json')
  const expectedUrl = `file://${join(anvilHome, 'plugins', 'opencode', 'index.js')}`

  // Skip when no OC config is wired AND plugin file is absent — CC-only users
  // would otherwise see a false `fail: plugin entry point missing` on every
  // `anvil doctor` run.
  const anyConfigExists = ocConfigPaths.some((p) => existsSync(p))
  const pluginExists = existsSync(pluginIndex)
  if (!anyConfigExists && !pluginExists) {
    checks.push({
      name: 'OpenCode plugin built and reachable',
      status: 'skip',
      detail: 'no OpenCode config wired',
    })
    return
  }

  if (!pluginExists) {
    checks.push({
      name: 'OpenCode plugin built and reachable',
      status: 'fail',
      detail: `plugin entry point missing: ${pluginIndex} — run \`anvil init --target opencode\`. ${ANCHOR}`,
    })
    return
  }

  // Verify package.json parses
  let pkgOk = false
  try {
    JSON.parse(readFileSync(pluginPkg, 'utf-8'))
    pkgOk = true
  } catch {
    // package.json missing or corrupt — warn but don't fail
  }

  if (!pkgOk) {
    checks.push({
      name: 'OpenCode plugin built and reachable',
      status: 'warn',
      detail: `plugin index.js exists but package.json is missing or unreadable at ${pluginPkg}. ${ANCHOR}`,
    })
    return
  }

  // Check whether any wired OC config points at the expected plugin URL.
  // If no configs are present we still pass (plugin may be used by a freshly
  // created project config we haven't seen yet).
  let configDrift = false
  for (const cfgPath of ocConfigPaths) {
    if (!existsSync(cfgPath)) continue
    try {
      const raw = JSON.parse(readFileSync(cfgPath, 'utf-8')) as unknown
      if (
        typeof raw === 'object' &&
        raw !== null &&
        'plugin' in raw &&
        Array.isArray((raw as Record<string, unknown>).plugin)
      ) {
        const pluginArr = (raw as { plugin: unknown[] }).plugin
        const directoryUrl = `file://${join(anvilHome, 'plugins', 'opencode')}`
        const hasExpected = pluginArr.some(
          (p) =>
            typeof p === 'string' && (p === expectedUrl || p === directoryUrl),
        )
        if (!hasExpected) configDrift = true
      }
    } catch {
      // Unreadable config — not our row's responsibility; skip
    }
  }

  if (configDrift) {
    checks.push({
      name: 'OpenCode plugin built and reachable',
      status: 'warn',
      detail: `plugin exists but OpenCode config does not reference ${expectedUrl} — run \`anvil init --target opencode\`. ${ANCHOR}`,
    })
    return
  }

  checks.push({
    name: 'OpenCode plugin built and reachable',
    status: 'pass',
    detail: `plugin at ${pluginIndex} present and package.json valid`,
  })
}

/**
 * Plan 32 F5 / Plan 33 I2. Inspect $CWD/AGENTS.md for the anvil-routing marker block.
 * Compare against canonical OC routing content (from routing-rules-content.ts).
 *
 * 5-case matrix driven by install target from ~/.anvil/manifest.json:
 *   1. target=claude-code AND AGENTS.md present without marker → skip
 *      (AGENTS.md is project-owned; --target opencode|both would add the marker)
 *   2. target=claude-code AND AGENTS.md absent → omit row (not applicable)
 *   3. target=opencode|both AND AGENTS.md has matching marker → pass
 *   4. target=opencode|both AND AGENTS.md has marker but content drifted → warn
 *   5. target=opencode|both AND AGENTS.md has no marker (or absent) → fail
 *
 * When manifest is absent (pre-v0.9.0 install), fall back to the legacy
 * opencode-presence heuristic to avoid false positives.
 */
export async function pushOcStandingInstructionsCheck(
  checks: Check[],
  cwd: string,
  anvilHome: string,
): Promise<void> {
  const agentsPath = join(cwd, 'AGENTS.md')
  const name = 'AGENTS.md routing block (OpenCode standing instructions)'

  const agentsPresent = existsSync(agentsPath)

  // Plan 33 I1: read install target from manifest.json.
  // v0.10.9 E-003: reader now returns ManifestReadResult so we can tell
  // apart absent (pre-v0.9.0 install — fall through to legacy heuristic)
  // from malformed (config error — surface a fail row instead of silently
  // running the heuristic on broken JSON).
  const manifestRead = await readAnvilManifestTarget(anvilHome)
  if (manifestRead.present && 'error' in manifestRead) {
    checks.push({
      name,
      status: 'fail',
      detail: `~/.anvil/manifest.json malformed: ${manifestRead.error}`,
    })
    return
  }
  const installedTarget = manifestRead.present
    ? 'value' in manifestRead
      ? manifestRead.value
      : null
    : null

  // Determine whether OpenCode is relevant for this check.
  //
  // Plan 34 B2: when manifest is absent (installedTarget === null), the legacy
  // .opencode/ heuristic was too aggressive — .opencode/ may exist from prior
  // tools even when the user installed --target claude-code only.
  //
  // New null-target decision tree (handled before the 5-case matrix):
  //   null + AGENTS.md absent          → omit row (return early)
  //   null + AGENTS.md without marker  → skip (project-owned; no evidence OC)
  //   null + AGENTS.md WITH marker     → fall through as opencode-relevant
  // When installedTarget IS set, use the existing 5-case matrix (unchanged).

  if (installedTarget === null) {
    if (!agentsPresent) {
      // Manifest absent + AGENTS.md absent → omit row (not applicable).
      return
    }
    // Read AGENTS.md to check for the anvil routing marker.
    let agentsContentForNull: string
    try {
      agentsContentForNull = readFileSync(agentsPath, 'utf-8')
    } catch {
      return
    }
    const hasMarkerForNull =
      agentsContentForNull.includes(OC_ROUTING_MARKER_OPEN) &&
      agentsContentForNull.includes(OC_ROUTING_MARKER_CLOSE)
    if (!hasMarkerForNull) {
      // Manifest absent + AGENTS.md without marker → project-owned, skip.
      // No evidence that anvil ever installed an OC routing block here.
      checks.push({
        name,
        status: 'skip',
        detail:
          'AGENTS.md is project-owned (no anvil manifest found); run `anvil init --target opencode` to add the routing block',
        // ANV-0158: suppress in quiet mode — this is a recommendation, not a
        // diagnostic. The user has not opted into OC so there is nothing to fix.
        expectedAbsence: true,
      })
      return
    }
    // Manifest absent + AGENTS.md WITH marker → evidence anvil wrote it.
    // Fall through to the drift-content check below (treated as OC-relevant).
  }

  // At this point installedTarget is known (not null) OR null-target with
  // marker present (falls through from the block above).
  const opencodeRelevant =
    installedTarget === null
      ? true // reached only when AGENTS.md has the anvil marker (see above)
      : installedTarget === 'opencode' || installedTarget === 'both'

  if (installedTarget === 'claude-code') {
    // Cases 1 & 2: CC-only install — AGENTS.md belongs to the project.
    if (!agentsPresent) {
      // Case 2: AGENTS.md absent and CC-only → omit (not applicable).
      return
    }
    // Read AGENTS.md to check for marker.
    let agentsContentForCc: string
    try {
      agentsContentForCc = readFileSync(agentsPath, 'utf-8')
    } catch {
      // Unreadable — omit row for CC-only target.
      return
    }
    const hasMarker =
      agentsContentForCc.includes(OC_ROUTING_MARKER_OPEN) &&
      agentsContentForCc.includes(OC_ROUTING_MARKER_CLOSE)
    if (!hasMarker) {
      // Case 1: AGENTS.md present without marker, CC-only → skip.
      checks.push({
        name,
        status: 'skip',
        detail:
          'AGENTS.md is project-owned; --target opencode|both would add the anvil-routing marker',
        // ANV-0158: suppress in quiet mode — CC-only users have not opted into
        // OC standing instructions; this is advisory, not a diagnostic.
        expectedAbsence: true,
      })
      return
    }
    // Marker IS present (unusual for CC-only) — fall through to content check.
  }

  if (!opencodeRelevant && !agentsPresent) {
    // OpenCode was never installed for this project — check is not applicable.
    return
  }

  if (!agentsPresent) {
    // OC is relevant but AGENTS.md is absent → fail.
    checks.push({
      name,
      status: 'fail',
      detail:
        'AGENTS.md missing — run `anvil init --target opencode` to write the routing block',
    })
    return
  }

  let agentsMdContent: string
  try {
    agentsMdContent = readFileSync(agentsPath, 'utf-8')
  } catch {
    checks.push({
      name,
      status: 'fail',
      detail: 'AGENTS.md present but unreadable',
    })
    return
  }

  const openIdx = agentsMdContent.indexOf(OC_ROUTING_MARKER_OPEN)
  const closeIdx = agentsMdContent.indexOf(OC_ROUTING_MARKER_CLOSE)

  if (openIdx === -1 || closeIdx === -1 || openIdx >= closeIdx) {
    checks.push({
      name,
      status: 'fail',
      detail:
        'AGENTS.md present but no anvil-routing marker block found — run `anvil init --target opencode`',
    })
    return
  }

  const existingBlock = agentsMdContent.slice(
    openIdx,
    closeIdx + OC_ROUTING_MARKER_CLOSE.length,
  )
  const canonicalBlock = [
    OC_ROUTING_MARKER_OPEN,
    ANVIL_OC_ROUTING_CONTENT.trimEnd(),
    OC_ROUTING_MARKER_CLOSE,
  ].join('\n')

  if (existingBlock === canonicalBlock) {
    checks.push({
      name,
      status: 'pass',
      detail: 'present and canonical',
    })
  } else {
    checks.push({
      name,
      status: 'warn',
      detail:
        'marker block present but content has drifted — re-run `anvil init --target opencode` to sync',
    })
  }
}

/**
 * ANV-0050 — Skill providers doctor row.
 *
 * Reports loaded count per provider and total shadowed/deduped skills.
 * Skipped gracefully when no skills/ tree exists in cwd.
 *
 * Warn when significant slug collisions are detected (same slug, different
 * content from two providers — the higher-rank provider wins). User-vs-Bundled
 * collisions are filtered out: they are expected in dev when the source tree
 * is ahead of the last `anvil init` install and are not actionable.
 */
export async function pushSkillProvidersCheck(
  checks: Check[],
  cwd: string,
  skillsRootOverride?: string,
): Promise<void> {
  const skillsRoot = skillsRootOverride ?? join(cwd, 'skills')
  if (!existsSync(skillsRoot)) {
    // No skills/ tree — skip silently (same policy as other skill checks)
    return
  }

  try {
    const { loadAllSkillsWithProviderStats } = await import(
      '../../../skills/load-all.js'
    )
    const result = await loadAllSkillsWithProviderStats({ skillsRoot, cwd })

    // Build "label: N" parts for providers that loaded at least one skill
    const activeParts = result.providerStats
      .filter((s) => s.loaded > 0)
      .map((s) => `${s.label}: ${s.loaded}`)

    const totalLoaded = result.providerStats.reduce(
      (sum, s) => sum + s.loaded,
      0,
    )

    let detail = activeParts.length > 0 ? activeParts.join(', ') : 'none'
    if (result.totalShadowed > 0) {
      detail += `; ${result.totalShadowed} shadowed/deduped`
    }

    // Filter out User-vs-Bundled collisions — expected in dev when source has
    // been updated but the user hasn't reinstalled. The priority system handles
    // it correctly (User wins over Bundled), so this is not actionable noise.
    const significantCollisions = result.collisions.filter(
      (c) =>
        !(
          (c.winner.provider === SkillProvider.User &&
            c.loser.provider === SkillProvider.Bundled) ||
          (c.winner.provider === SkillProvider.Bundled &&
            c.loser.provider === SkillProvider.User)
        ),
    )
    const hasCollisions = significantCollisions.length > 0
    if (hasCollisions) {
      const preview = significantCollisions
        .slice(0, 5)
        .map((c) => c.slug)
        .join(', ')
      const more =
        significantCollisions.length > 5
          ? ` (+${significantCollisions.length - 5} more)`
          : ''
      detail += `; ${significantCollisions.length} content collision(s) between providers: ${preview}${more}`
    }

    checks.push({
      name: 'Skill providers',
      status: hasCollisions ? 'warn' : 'pass',
      detail: `${totalLoaded} total — ${detail}`,
    })

    // ANV-0122 — activation adoption row. Counts skills declaring an
    // `activation:` block. Always-visible so users can track gradual
    // adoption from doctor output without --verbose.
    const { countSkillsWithActivation } = await import(
      '../../../skills/activation.js'
    )
    const allSkills = result.registry.getAll()
    const activationCount = countSkillsWithActivation(allSkills)
    checks.push({
      name: 'activation',
      status: 'pass',
      detail: `${activationCount} of ${allSkills.length} skills use activation-block (gradual adoption)`,
      alwaysVisible: true,
    })

    // ANV-0123 — skill-shadow row. One row total, summarising any
    // cross-scope shadows the dedupe pass found. Always-visible.
    // User-vs-Bundled shadows are filtered like the collision row above —
    // they are the expected dev path when source is ahead of install.
    const significantShadows = result.scopeShadows.filter(
      (s) =>
        !(
          (s.winnerScope === 'home' && s.shadowedScope === 'bundled') ||
          (s.winnerScope === 'bundled' && s.shadowedScope === 'home')
        ),
    )
    if (significantShadows.length === 0) {
      checks.push({
        name: 'skill-shadow',
        status: 'pass',
        detail: 'no cross-scope shadows',
        alwaysVisible: true,
      })
    } else {
      const preview = significantShadows
        .slice(0, 3)
        .map(
          (s) =>
            `${s.slug} ${capScope(s.winnerScope)} shadows ${capScope(s.shadowedScope)}`,
        )
        .join('; ')
      const more =
        significantShadows.length > 3
          ? ` (+${significantShadows.length - 3} more)`
          : ''
      checks.push({
        name: 'skill-shadow',
        status: 'warn',
        detail: `${preview}${more} (intentional? add --allow-shadow to suppress)`,
        alwaysVisible: true,
      })
    }
  } catch (err) {
    checks.push({
      name: 'Skill providers',
      status: 'fail',
      detail: `failed to load provider stats: ${(err as Error).message}`,
    })
  }
}

function capScope(scope: string): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1)
}
