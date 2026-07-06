/**
 * ANV-0209 — Doctor row "Frontmatter portability".
 *
 * Asserts that every shipped agent and skill file uses only frontmatter
 * fields from the v0.16 allowlist. Permissive in v0.16 (allows `preferred_*`
 * and other transitional fields as warnings); tightens toward v0.17.
 *
 * Tier: standard and above (not quick). Because the doctor command has no
 * built-in tier concept, this check always runs — it is lightweight enough
 * (raw text scan) that quick-mode callers can skip via the `expectedAbsence`
 * flag pattern if a future tier gate is added.
 *
 * Design notes:
 *   - Root-key allowlist (ROOT_CORE_ALLOWLIST) contains ONLY the 15
 *     CC/OC-native keys + CC-agent-spec keys + x-anvil namespace key.
 *   - All Anvil-native fields previously at root are in ROOT_DEPRECATED_ALLOWLIST
 *     to nudge authors toward x-anvil: migration (emit warn, not fail).
 *   - x-anvil sub-key allowlist derived DYNAMICALLY from XAnvilSchema.shape
 *     (top-level keys only) — no hardcoded list that could drift from schema.
 *   - Unknown root key → failure.
 *   - Deprecated Anvil-native root keys → warning (migrate to x-anvil:).
 *   - Unknown x-anvil sub-key → warning.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { XAnvilSchema } from '../../../core/types.js'

// ─── Local Check interface (mirrors doctor.ts) ────────────────────────────────

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

// ─── Allowlists ───────────────────────────────────────────────────────────────

/**
 * v0.16 root-key allowlist shared across agents and skills.
 *
 * Core (CC/OC-native keys only — §Requirements 2 of ANV-0209):
 *   name, description, model, tools, disallowedTools, color, mode,
 *   permissionMode, background, isolation, paths, argument-hint,
 *   allowed-tools, user-invocable, disable-model-invocation
 *
 * Agent-native root fields (CC subagent spec — also CC-native at root):
 *   skills, memory, mcpServers, hooks, initialPrompt,
 *   readOnlyHint, destructiveHint, idempotentHint, openWorldHint
 *
 * x-anvil vendor-extension namespace (ANV-0206):
 *   single key 'x-anvil' is always allowed at root.
 *
 * All other Anvil-native fields (role, tier, group, trigger, kind, etc.)
 * have moved to ROOT_DEPRECATED_ALLOWLIST — they emit 'warn' to nudge
 * authors toward migrating those keys under x-anvil:.
 */
export const ROOT_CORE_ALLOWLIST: ReadonlySet<string> = new Set([
  // CC/OC-native (15 keys per ticket §Requirements 2)
  'name',
  'description',
  'model',
  'tools',
  'disallowedTools',
  'color',
  'mode',
  'permissionMode',
  'background',
  'isolation',
  'paths',
  'argument-hint',
  'allowed-tools',
  'user-invocable',
  'disable-model-invocation',
  // Agent-native root fields (CC subagent spec)
  'skills',
  'memory',
  'mcpServers',
  'hooks',
  'initialPrompt',
  'readOnlyHint',
  'destructiveHint',
  'idempotentHint',
  'openWorldHint',
  // CC-native agent delegation field (ANV-0072): CC uses this to route skill
  // execution to a named subagent slug at dispatch time.
  'agent',
  // Vendor-extension namespace (ANV-0206)
  'x-anvil',
  // ANV-0246: slash-command experimental flag used by the experimental build
  // to gate catalog/extension surfaces. Currently only on src/commands/slash/
  // files; future portability scans extending to slash dir should still pass.
  'experimental',
])

/**
 * Transitional deprecated root keys: still present in some files after the
 * v0.16 codemod. These emit 'warn' (not 'fail') so authors have time to
 * migrate them under x-anvil:.
 *
 * NOTE (ANV-0214, v0.17): preferred_model, preferred_effort, max_tokens,
 * and fallback_model have been REMOVED from this list. Any skill that
 * declares these fields at root will now hit the unknownRootOffenders path
 * and produce a 'fail', tightening the gate against future authoring
 * regressions. The ANV-0214 codemod (--strip-preferred) removes them from
 * all bundled skill files.
 *
 * Includes:
 *  - All Anvil-native fields previously silently allowed at root — nudging
 *    them toward x-anvil: migration per ANV-0209 §Requirements 2.
 */
export const ROOT_DEPRECATED_ALLOWLIST: ReadonlySet<string> = new Set([
  // Anvil-native routing / taxonomy fields (migrate to x-anvil:)
  'agent_mode',
  'role',
  'tier',
  'group',
  'trigger',
  'kind',
  'language',
  'tags',
  'aliases',
  'category',
  'disambiguator',
  'notepads_section',
  // Anvil-native I/O schema fields (migrate to x-anvil:)
  'output_schema',
  'input_schema',
  // Anvil-native versioning fields (migrate to x-anvil:)
  'version',
  'breaking_changes_in',
  'replacement',
  // Anvil-native provenance fields (migrate to x-anvil:)
  'source',
  'confidence',
  'created_at',
  'provenance',
  // Anvil-native asset / reference fields (migrate to x-anvil:)
  'scripts',
  'references',
  'assets',
  'templates',
  // Anvil-native runtime fields (migrate to x-anvil:)
  'activation',
  'context_providers',
  'eval_fixtures',
  'expected_tokens',
  // Agent-specific Anvil root fields (migrate to x-anvil:)
  'max_turns',
  'fallback_chain',
  'requires_any_model',
  'requires_provider',
  'required_reading',
  // Skill-specific root fields (migrate to x-anvil:)
  'chains',
  'sub_skills',
  'workflow',
  'isHidden',
  'tooltip',
  'license',
  'arguments',
  'effort',
  // Skill-specific composition fields (ANV-0092, migrate to x-anvil:)
  'strategy',
  'extends_skill',
  // Skill MCP server declarations (ANV-0037, migrate to x-anvil:)
  'mcp_servers',
  // CC-native skill context field
  'context',
])

/**
 * Build the x-anvil sub-key allowlist dynamically from XAnvilSchema.shape.
 * This guarantees the doctor row stays in sync with the canonical schema
 * without a separate hardcoded list.
 *
 * Only the top-level keys of XAnvilSchema are included (e.g. 'composition',
 * 'tier', 'role', …). Sub-keys of nested schemas (e.g. the fields inside
 * XAnvilCompositionSchema) are NOT merged into the top-level allowlist —
 * they live one level deeper under x-anvil.composition.
 */
function buildXAnvilAllowlist(): ReadonlySet<string> {
  const keys = new Set<string>()

  // Top-level XAnvilSchema fields only — composition and safety are already
  // included as top-level keys of XAnvilSchema.shape.
  const topShape = (
    XAnvilSchema as unknown as { shape: Record<string, unknown> }
  ).shape
  if (topShape && typeof topShape === 'object') {
    for (const k of Object.keys(topShape)) {
      keys.add(k)
    }
  }

  return keys
}

// Build once at module load — schemas are static.
const X_ANVIL_ALLOWLIST: ReadonlySet<string> = buildXAnvilAllowlist()

// ─── File scanning ────────────────────────────────────────────────────────────

/**
 * Walk a directory recursively collecting all .md files.
 * Skips CLAUDE.md and AGENTS.md meta-files.
 */
function walkMdFiles(root: string): string[] {
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
      let isDir = false
      let isFile = false
      try {
        const st = statSync(full)
        isDir = st.isDirectory()
        isFile = st.isFile()
      } catch {
        continue
      }
      if (isDir) {
        stack.push(full)
      } else if (isFile && name.endsWith('.md')) {
        out.push(full)
      }
    }
  }
  return out
}

// ─── Per-file frontmatter scan ────────────────────────────────────────────────

interface FileScanResult {
  path: string
  unknownRootKeys: string[]
  deprecatedRootKeys: string[]
  unknownXAnvilKeys: string[]
}

/**
 * Scan a single .md file's frontmatter for unknown / deprecated keys.
 * Returns null when the file has no frontmatter.
 */
function scanFileFrontmatter(filePath: string): FileScanResult | null {
  let src: string
  try {
    src = readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }

  // Quick gate: skip files without frontmatter
  if (!src.startsWith('---')) return null

  let parsed: Record<string, unknown>
  try {
    // NOTE (ANV-0209): cannot reuse src/skills/loader.ts here — the loader applies
    // Zod transforms (back-compat shim) that flatten x-anvil into root, hiding the
    // raw frontmatter keys we need to audit. Intentional divergence from ticket
    // "Notes for implementer".
    const result = matter(src)
    parsed = result.data as Record<string, unknown>
  } catch {
    // Malformed frontmatter — other checks surface parse errors; skip here.
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null

  const unknownRootKeys: string[] = []
  const deprecatedRootKeys: string[] = []

  for (const key of Object.keys(parsed)) {
    if (ROOT_CORE_ALLOWLIST.has(key)) continue
    if (ROOT_DEPRECATED_ALLOWLIST.has(key)) {
      deprecatedRootKeys.push(key)
      continue
    }
    unknownRootKeys.push(key)
  }

  // Check x-anvil sub-keys if the block is present
  const unknownXAnvilKeys: string[] = []
  const xAnvilBlock = parsed['x-anvil']
  if (
    xAnvilBlock &&
    typeof xAnvilBlock === 'object' &&
    !Array.isArray(xAnvilBlock)
  ) {
    for (const subKey of Object.keys(xAnvilBlock as Record<string, unknown>)) {
      if (!X_ANVIL_ALLOWLIST.has(subKey)) {
        unknownXAnvilKeys.push(subKey)
      }
    }
  }

  return {
    path: filePath,
    unknownRootKeys,
    deprecatedRootKeys,
    unknownXAnvilKeys,
  }
}

// ─── Aggregate scan ───────────────────────────────────────────────────────────

interface ScanSummary {
  scanned: number
  unknownRootOffenders: Array<{ rel: string; keys: string[] }>
  deprecatedOffenders: Array<{ rel: string; keys: string[] }>
  unknownXAnvilOffenders: Array<{ rel: string; keys: string[] }>
}

function scanDirectory(root: string, cwd: string): ScanSummary {
  const files = walkMdFiles(root)
  const summary: ScanSummary = {
    scanned: files.length,
    unknownRootOffenders: [],
    deprecatedOffenders: [],
    unknownXAnvilOffenders: [],
  }

  for (const file of files) {
    const result = scanFileFrontmatter(file)
    if (!result) continue
    const rel = file.startsWith(cwd)
      ? file.slice(cwd.length).replace(/^\//, '')
      : file

    if (result.unknownRootKeys.length > 0) {
      summary.unknownRootOffenders.push({ rel, keys: result.unknownRootKeys })
    }
    if (result.deprecatedRootKeys.length > 0) {
      summary.deprecatedOffenders.push({ rel, keys: result.deprecatedRootKeys })
    }
    if (result.unknownXAnvilKeys.length > 0) {
      summary.unknownXAnvilOffenders.push({
        rel,
        keys: result.unknownXAnvilKeys,
      })
    }
  }

  return summary
}

// ─── Pure row builder (exported for unit tests) ───────────────────────────────

export interface FrontmatterPortabilityResult {
  /** Number of files scanned across agents + skills. */
  scanned: number
  /** Files with root keys outside the allowlist (fail). */
  unknownRootOffenders: Array<{ rel: string; keys: string[] }>
  /** Files with deprecated transitional root keys (warn). */
  deprecatedOffenders: Array<{ rel: string; keys: string[] }>
  /** Files with unknown x-anvil sub-keys (warn). */
  unknownXAnvilOffenders: Array<{ rel: string; keys: string[] }>
}

/**
 * Pure builder for the frontmatter-portability row.
 * Exported so unit tests can call it without I/O.
 */
export function buildFrontmatterPortabilityRow(
  result: FrontmatterPortabilityResult,
): Check {
  const {
    scanned,
    unknownRootOffenders,
    deprecatedOffenders,
    unknownXAnvilOffenders,
  } = result

  // Failure: any unknown root key
  if (unknownRootOffenders.length > 0) {
    const preview = unknownRootOffenders
      .slice(0, 3)
      .map((o) => `${o.rel} (${o.keys.join(', ')})`)
      .join('; ')
    const more =
      unknownRootOffenders.length > 3
        ? ` …+${unknownRootOffenders.length - 3} more`
        : ''
    return {
      name: 'Frontmatter portability',
      status: 'fail',
      detail: `${unknownRootOffenders.length} file(s) use unknown root frontmatter key(s): ${preview}${more} — add to allowlist or move under x-anvil:`,
    }
  }

  // Warning: deprecated transitional root keys
  if (deprecatedOffenders.length > 0) {
    const preview = deprecatedOffenders
      .slice(0, 3)
      .map((o) => `${o.rel} (${o.keys.join(', ')})`)
      .join('; ')
    const more =
      deprecatedOffenders.length > 3
        ? ` …+${deprecatedOffenders.length - 3} more`
        : ''
    // Also surface any unknown x-anvil keys in the same row
    const xAnvilNote =
      unknownXAnvilOffenders.length > 0
        ? `; also ${unknownXAnvilOffenders.length} file(s) have unknown x-anvil sub-key(s)`
        : ''
    return {
      name: 'Frontmatter portability',
      status: 'warn',
      detail: `${scanned} file(s) scanned; ${deprecatedOffenders.length} file(s) use deprecated root key(s) (migrate before v0.17): ${preview}${more}${xAnvilNote}`,
    }
  }

  // Warning: unknown x-anvil sub-keys only
  if (unknownXAnvilOffenders.length > 0) {
    const preview = unknownXAnvilOffenders
      .slice(0, 3)
      .map((o) => `${o.rel} (${o.keys.join(', ')})`)
      .join('; ')
    const more =
      unknownXAnvilOffenders.length > 3
        ? ` …+${unknownXAnvilOffenders.length - 3} more`
        : ''
    return {
      name: 'Frontmatter portability',
      status: 'warn',
      detail: `${scanned} file(s) scanned; ${unknownXAnvilOffenders.length} file(s) have unknown x-anvil sub-key(s): ${preview}${more}`,
    }
  }

  return {
    name: 'Frontmatter portability',
    status: 'pass',
    detail: `${scanned} file(s) scanned — all frontmatter keys are within the v0.16 allowlist`,
  }
}

// ─── I/O wrapper (pushXxx convention) ────────────────────────────────────────

/**
 * Doctor push function for the frontmatter-portability row.
 *
 * Scans agents/ and skills/ directories (if present) in cwd for unknown
 * frontmatter keys. Skips gracefully when neither directory exists.
 *
 * Tier: standard and above (not quick). The doctor command does not yet
 * expose a tier concept, so this check always runs.
 */
export function pushFrontmatterPortabilityCheck(
  checks: Check[],
  cwd: string,
  inProject: boolean,
  skipDetail: string,
  _overrideAgentsRoot?: string,
  _overrideSkillsRoot?: string,
): void {
  const agentsRoot = _overrideAgentsRoot ?? join(cwd, 'agents')
  const skillsRoot = _overrideSkillsRoot ?? join(cwd, 'skills')

  const hasAgents = existsSync(agentsRoot)
  const hasSkills = existsSync(skillsRoot)

  if (!inProject || (!hasAgents && !hasSkills)) {
    checks.push({
      name: 'Frontmatter portability',
      status: 'skip',
      detail: skipDetail,
      expectedAbsence: true,
    })
    return
  }

  let scanned = 0
  const unknownRootOffenders: FrontmatterPortabilityResult['unknownRootOffenders'] =
    []
  const deprecatedOffenders: FrontmatterPortabilityResult['deprecatedOffenders'] =
    []
  const unknownXAnvilOffenders: FrontmatterPortabilityResult['unknownXAnvilOffenders'] =
    []

  for (const root of [agentsRoot, skillsRoot]) {
    if (!existsSync(root)) continue
    const summary = scanDirectory(root, cwd)
    scanned += summary.scanned
    unknownRootOffenders.push(...summary.unknownRootOffenders)
    deprecatedOffenders.push(...summary.deprecatedOffenders)
    unknownXAnvilOffenders.push(...summary.unknownXAnvilOffenders)
  }

  const row = buildFrontmatterPortabilityRow({
    scanned,
    unknownRootOffenders,
    deprecatedOffenders,
    unknownXAnvilOffenders,
  })
  checks.push(row)
}
