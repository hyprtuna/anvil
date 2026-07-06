/**
 * ANV-0206 — Frontmatter x-anvil namespace codemod.
 *
 * Migrates Anvil-runtime-only fields from the YAML root into an `x-anvil:`
 * vendor-extension namespace on agent and skill markdown files. Idempotent:
 * rerunning on already-migrated files produces zero diff.
 *
 * ANV-0214 — Strip preferred_* / max_tokens / fallback_model pass.
 *
 * Removes `preferred_model`, `preferred_effort`, `max_tokens`, and
 * `fallback_model` from skill frontmatter root (these fields have been
 * dropped from SkillFrontmatter schema in v0.17). Idempotent: rerunning on
 * already-stripped files produces zero diff.
 *
 * Usage:
 *   --dry-run          Print diff without writing
 *   --file <path>      Migrate a single file
 *   --all              Migrate all agents/*.md + skills/**\/*.md
 *   --check            CI mode: exit 2 if any files need migration
 *   --agents-only      Migrate only agents/*.md
 *   --skills-only      Migrate only skills/**\/*.md
 *   --strip-preferred  ANV-0214: strip preferred_model/preferred_effort/
 *                      max_tokens/fallback_model (skills only; implies
 *                      --skills-only)
 */

import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import jsyaml from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..')

// ─── Field partition tables ──────────────────────────────────────────────────

/**
 * Fields that STAY at root for all file types (CC/OC-native or deferred).
 * Everything not in this set is considered Anvil-only and moves to x-anvil.
 */
const ROOT_FIELDS_ALL = new Set([
  // CC/OC identity
  'name',
  'description',
  // CC/OC model / execution
  'model',
  'effort',
  'permissionMode',
  // CC/OC display
  'color',
  // CC/OC tool grants
  'tools',
  'disallowedTools',
  'allowed-tools',
  // CC/OC skill/agent refs
  'skills',
  'memory',
  'mcpServers',
  'hooks',
  // CC/OC execution
  'background',
  'isolation',
  'initialPrompt',
  // CC kebab-case native
  'user-invocable',
  'disable-model-invocation',
  'argument-hint',
  'arguments',
  // CC-native context / agent delegation
  'context',
  'agent',
  // CC-native path scoped injection
  'paths',
  // OC-native
  'license',
  'mode',
  'permission',
  'compatibility',
  'metadata',
  'status',
  // Deprecated (already gone per ANV-0210; accepted for back-compat)
  'inputs',
  'outputs',
  // ANV-0214 (v0.17) — these are stripped by --strip-preferred pass, not kept at root.
  // They remain in ROOT_FIELDS_ALL so the primary x-anvil migration pass (ANV-0206)
  // leaves them at root for the subsequent strip pass to clean up. Without this,
  // the ANV-0206 pass would move them into x-anvil before the strip pass runs.
  'preferred_model',
  'preferred_effort',
  'max_tokens',
  'fallback_model',
  // ANV-0255 — workflow stays at root (separate migration ticket)
  'workflow',
  // Legacy hidden flag (keep at root for back-compat)
  'isHidden',
  'tooltip',
  // x-anvil itself (sentinel — already migrated)
  'x-anvil',
])

/**
 * ANV-0216: MCP 4-tuple hint fields are dropped entirely from agent
 * frontmatter. They were previously mapped to x-anvil.safety but no
 * agent dispatcher consumes them. These are stripped on migration.
 */
const SAFETY_HINT_DROP = new Set([
  'readOnlyHint',
  'destructiveHint',
  'idempotentHint',
  'openWorldHint',
])

/**
 * Composition fields on skills collapse into x-anvil.composition.
 * Note: workflow is excluded per ANV-0255.
 */
const COMPOSITION_FIELDS = new Set(['sub_skills', 'chains', 'strategy', 'extends_skill'])

/**
 * ANV-0214 — Fields dropped from SkillFrontmatter in v0.17.
 * These are stripped entirely from skill frontmatter (both root and x-anvil sub-keys).
 * Idempotent: if already absent, no change is made.
 */
export const PREFERRED_FIELDS_STRIP = new Set([
  'preferred_model',
  'preferred_effort',
  'max_tokens',
  'fallback_model',
])

// ─── Migration logic ─────────────────────────────────────────────────────────

export interface MigrateResult {
  path: string
  changed: boolean
  output: string
  unknownRootKeys: string[]
}

/**
 * Migrate a single file's frontmatter. Returns the new content and metadata.
 * Idempotent: if `x-anvil` key already present at root, file is skipped.
 */
export function migrateFile(filePath: string, content: string): MigrateResult {
  const parsed = matter(content)
  const data = parsed.data as Record<string, unknown>

  // Sentinel: already migrated — skip (idempotency guarantee)
  if ('x-anvil' in data) {
    return { path: filePath, changed: false, output: content, unknownRootKeys: [] }
  }

  const rootData: Record<string, unknown> = {}
  const xAnvilData: Record<string, unknown> = {}
  const compositionData: Record<string, unknown> = {}
  const unknownRootKeys: string[] = []

  for (const [key, value] of Object.entries(data)) {
    // ANV-0216: MCP 4-tuple hint fields are dropped (not migrated to x-anvil.safety)
    if (SAFETY_HINT_DROP.has(key)) {
      continue
    }

    // Composition fields → x-anvil.composition (NOT workflow — per ANV-0255)
    if (COMPOSITION_FIELDS.has(key)) {
      compositionData[key] = value
      continue
    }

    // Root-stay fields
    if (ROOT_FIELDS_ALL.has(key)) {
      rootData[key] = value
      continue
    }

    // Everything else → x-anvil
    xAnvilData[key] = value
  }

  // Wire up composition if any composition fields were found
  if (Object.keys(compositionData).length > 0) {
    xAnvilData['composition'] = compositionData
  }

  // If nothing moved to x-anvil, nothing to do (file had no Anvil-only fields)
  // Still emit the file as-is if nothing changed
  if (Object.keys(xAnvilData).length === 0) {
    return { path: filePath, changed: false, output: content, unknownRootKeys }
  }

  // Build new frontmatter: root fields first (preserving order), then x-anvil block
  const newData: Record<string, unknown> = {
    ...rootData,
    'x-anvil': xAnvilData,
  }

  // Serialize using gray-matter's stringify (uses js-yaml under the hood)
  // Custom stringifier to control YAML output format
  const newFrontmatterYaml = stringifyYaml(newData)
  const newContent = `---\n${newFrontmatterYaml}---\n${parsed.content}`

  return { path: filePath, changed: true, output: newContent, unknownRootKeys }
}

/**
 * ANV-0214 — Strip preferred_model / preferred_effort / max_tokens /
 * fallback_model from a skill file's frontmatter (both root and any
 * occurrence nested under x-anvil:).
 *
 * Idempotent: rerunning on an already-stripped file returns changed=false.
 * Works on both pre-migration (no x-anvil) and post-migration (has x-anvil)
 * files.
 */
export function stripPreferredFields(filePath: string, content: string): MigrateResult {
  const parsed = matter(content)
  const data = parsed.data as Record<string, unknown>

  // Detect whether any of the target fields are present at root
  const hasRootFields = [...PREFERRED_FIELDS_STRIP].some((k) => k in data)

  // Also strip from x-anvil sub-object if present (defensive — these fields
  // should not be under x-anvil, but clean up any that slipped through)
  const xAnvilBlock = data['x-anvil'] as Record<string, unknown> | undefined
  const hasXAnvilFields =
    xAnvilBlock != null &&
    typeof xAnvilBlock === 'object' &&
    [...PREFERRED_FIELDS_STRIP].some((k) => k in xAnvilBlock)

  if (!hasRootFields && !hasXAnvilFields) {
    // Already clean — idempotent no-op
    return { path: filePath, changed: false, output: content, unknownRootKeys: [] }
  }

  // Build new root data without the stripped fields
  const newRootData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (PREFERRED_FIELDS_STRIP.has(key)) continue
    if (key === 'x-anvil' && xAnvilBlock != null && hasXAnvilFields) {
      // Also strip from inside x-anvil
      const cleanXAnvil: Record<string, unknown> = {}
      for (const [xk, xv] of Object.entries(xAnvilBlock)) {
        if (!PREFERRED_FIELDS_STRIP.has(xk)) cleanXAnvil[xk] = xv
      }
      newRootData['x-anvil'] = cleanXAnvil
      continue
    }
    newRootData[key] = value
  }

  const newFrontmatterYaml = stringifyYaml(newRootData)
  const newContent = `---\n${newFrontmatterYaml}---\n${parsed.content}`

  return { path: filePath, changed: true, output: newContent, unknownRootKeys: [] }
}

/**
 * Stringify a YAML object preserving readable formatting.
 * Uses block style throughout for clear diffs. Arrays of primitives
 * at depth 2+ (inside x-anvil) are rendered in flow style for compactness.
 */
function stringifyYaml(data: Record<string, unknown>): string {
  // Separate root-level fields from x-anvil
  const { 'x-anvil': xAnvil, ...rootFields } = data

  // Serialize root fields with flowLevel=1 so simple arrays like
  //   tools: [Read, Bash]
  // stay on one line (matches original file style).
  let out = jsyaml.dump(rootFields, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    flowLevel: 1, // top-level arrays as flow (tools, trigger, required_reading)
  })

  if (xAnvil !== undefined) {
    // Serialize x-anvil block separately with flowLevel=2 so arrays inside
    // x-anvil (trigger, required_reading, etc.) render as flow while the
    // x-anvil object itself uses block style.
    const xAnvilStr = jsyaml.dump({ 'x-anvil': xAnvil }, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
      flowLevel: 2, // arrays at depth >=2 use flow
    })
    out += xAnvilStr
  }

  return out
}

// ─── File collection ─────────────────────────────────────────────────────────

async function collectAgentFiles(repoRoot: string): Promise<string[]> {
  const agentsDir = join(repoRoot, 'agents')
  if (!existsSync(agentsDir)) return []
  const entries = await readdir(agentsDir)
  return entries
    .filter((e) => e.endsWith('.md') && !/^[A-Z]/.test(e))
    .map((e) => join(agentsDir, e))
}

async function collectSkillFiles(repoRoot: string): Promise<string[]> {
  const skillsDir = join(repoRoot, 'skills')
  if (!existsSync(skillsDir)) return []
  return collectMdFilesRecursive(skillsDir)
}

async function collectMdFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await collectMdFilesRecursive(fullPath)
      for (const p of nested) results.push(p)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Skip doc files
      if (/^(AGENTS|CLAUDE|README)\.md$/.test(entry.name)) continue
      results.push(fullPath)
    }
  }
  return results
}

// ─── Stats ───────────────────────────────────────────────────────────────────

interface Stats {
  scanned: number
  migrated: number
  skipped: number
  unknownRootKeysAll: string[]
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const isCheck = args.includes('--check')
  const isAll = args.includes('--all')
  const isAgentsOnly = args.includes('--agents-only')
  const isSkillsOnly = args.includes('--skills-only')
  const isStripPreferred = args.includes('--strip-preferred')
  const fileIdx = args.indexOf('--file')

  let files: string[] = []

  if (fileIdx !== -1) {
    // --file <path> [<path2> ...] — collect all non-flag args after --file
    const paths: string[] = []
    for (let i = fileIdx + 1; i < args.length; i++) {
      const a = args[i]
      if (a === undefined) break
      if (a.startsWith('--')) break
      paths.push(resolve(a))
    }
    files = paths
  } else if ((isAll || isAgentsOnly) && !isStripPreferred) {
    const agentFiles = await collectAgentFiles(REPO_ROOT)
    files.push(...agentFiles)
  }

  if (isAll || isSkillsOnly || isStripPreferred) {
    const skillFiles = await collectSkillFiles(REPO_ROOT)
    files.push(...skillFiles)
  }

  if (files.length === 0 && !isAll && !isAgentsOnly && !isSkillsOnly && !isStripPreferred && fileIdx === -1) {
    console.error(
      'Usage: codemod-frontmatter.ts [--dry-run] [--all | --agents-only | --skills-only | --strip-preferred | --file <path...>] [--check]',
    )
    process.exit(1)
  }

  const stats: Stats = { scanned: 0, migrated: 0, skipped: 0, unknownRootKeysAll: [] }
  let needsMigration = 0

  for (const filePath of files) {
    if (!existsSync(filePath)) {
      console.warn(`[codemod] file not found: ${filePath}`)
      continue
    }

    stats.scanned++
    const content = await readFile(filePath, 'utf-8')

    // Skip files without frontmatter
    if (!content.startsWith('---')) {
      stats.skipped++
      continue
    }

    const result = isStripPreferred
      ? stripPreferredFields(filePath, content)
      : migrateFile(filePath, content)

    for (const k of result.unknownRootKeys) {
      if (!stats.unknownRootKeysAll.includes(k)) {
        stats.unknownRootKeysAll.push(k)
      }
    }

    if (!result.changed) {
      stats.skipped++
      continue
    }

    needsMigration++

    if (isCheck) {
      console.log(`[codemod] needs migration: ${filePath}`)
      continue
    }

    if (isDryRun) {
      console.log(`[codemod] would migrate: ${filePath}`)
      stats.migrated++
      continue
    }

    await writeFile(filePath, result.output, 'utf-8')
    stats.migrated++
    console.log(`[codemod] migrated: ${filePath}`)
  }

  console.log(
    `\n[codemod] scanned=${stats.scanned} migrated=${stats.migrated} skipped=${stats.skipped}`,
  )
  if (stats.unknownRootKeysAll.length > 0) {
    console.warn(`[codemod] unknown root keys flagged: ${stats.unknownRootKeysAll.join(', ')}`)
  }

  if (isCheck && needsMigration > 0) {
    console.error(`[codemod] ${needsMigration} file(s) need migration`)
    process.exit(2)
  }
}

// Guard: only run when this is the entry point, not when imported as a module
const isEntryPoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url).endsWith(process.argv[1])
    ? true
    : process.argv[1] !== undefined &&
      (process.argv[1].endsWith('codemod-frontmatter.ts') ||
        process.argv[1].endsWith('codemod-frontmatter.js'))

if (isEntryPoint) {
  main().catch((err) => {
    console.error('[codemod] fatal:', err)
    process.exit(1)
  })
}
